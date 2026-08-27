import { useMemo } from "react";
import { usePublicClient, useWriteContract, useAccount } from "wagmi";
import { parseAbi } from "viem";
import { INVOICE_FACTORY_ADDRESS, USDT_DECIMALS, ACTIVE_NETWORK } from "../config/network";
import abi from "../abi.json";

export const INVOICE_ABI = abi;

export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export function useFactoryContract() {
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const write = useWriteContract();

  return useMemo(() => {
    const c = { publicClient, address, ...write };

    // Reads
    c.getInvoice = async (id) => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "invoices", args: [id] });
    c.nextInvoiceId = () => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "nextInvoiceId" });
    c.investorContribution = (id, who) => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "investorContribution", args: [id, who] });
    c.investorPercentage = (id, who) => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "investorPercentageBps", args: [id, who] });
    c.invoiceInvestors = (id) => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "invoiceInvestors", args: [id] });
    c.username = (who) => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "addressToUsername", args: [who] });
    c.onTimePayments = (who) => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "onTimePayments", args: [who] });
    c.latePayments = (who) => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "latePayments", args: [who] });
    c.defaultCount = (who) => publicClient.readContract({ address: INVOICE_FACTORY_ADDRESS, abi, functionName: "defaultCount", args: [who] });

    // USDT helpers
    c.usdtBalance = (who) => publicClient.readContract({ address: ACTIVE_NETWORK.usdtAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [who] });
    c.usdtAllowance = (who) => publicClient.readContract({ address: ACTIVE_NETWORK.usdtAddress, abi: ERC20_ABI, functionName: "allowance", args: [who, INVOICE_FACTORY_ADDRESS] });

    // Approve the contract to spend USDT on the connected user's behalf if needed.
    // Some USDT-like tokens have non-standard approve behavior. We approve to the max
    // so the user only has to do this once. The approval is sent as a separate tx and
    // we wait for it to be mined before returning.
    c.ensureApproval = async (amount) => {
      const needed = BigInt(amount);
      if (needed === 0n) return false;

      const allowance = await c.usdtAllowance(address);
      const max = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
      if (allowance < needed) {
        // Send approval tx and wait for receipt before returning.
        // This ensures the chain state is updated before the next write.
        const hash = await write.writeContractAsync({
          address: ACTIVE_NETWORK.usdtAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [INVOICE_FACTORY_ADDRESS, max],
        });
        await publicClient.waitForTransactionReceipt({ hash });
        return true;
      }
      return false;
    };

    // Simulate the contract call first to:
    // 1. Get a clear revert reason if the call would fail
    // 2. Obtain an accurate gas estimate so the wallet doesn't need to re-estimate
    //    (wallet-level estimation often fails on ergs-9060 chains right after an
    //     approval tx is mined, even though the on-chain state is correct).
    // Retries with exponential backoff for transient RPC staleness.
    c.writeContractWithRetry = async (params, retries = 3) => {
      const { address, abi, functionName, args, value } = params;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const { request } = await publicClient.simulateContract({
            address,
            abi,
            functionName,
            args,
            account: address,
            value,
          });
          // Pass the estimated gas (with 50% buffer) so the wallet never needs
          // to estimate again, avoiding the "dashes" UX on wallet browsers.
          return await write.writeContractAsync({
            address,
            abi,
            functionName,
            args,
            value,
            gas: (request.gas * 150n) / 100n,
          });
        } catch (err) {
          const deepMsg = [
            err?.shortMessage,
            err?.message,
            err?.details,
            err?.cause?.shortMessage,
            err?.cause?.message,
            err?.cause?.details,
            err?.cause?.reason,
          ]
            .filter(Boolean)
            .join(" ");
          const userRejected =
            deepMsg.includes("User rejected") ||
            deepMsg.includes("user rejected") ||
            err?.code === 4001;
          if (userRejected) throw err;

          const isRetryable =
            deepMsg.includes("gas") ||
            deepMsg.includes("estimate") ||
            deepMsg.includes("insufficient") ||
            deepMsg.includes("execution reverted") ||
            deepMsg.includes("Internal JSON-RPC error") ||
            deepMsg.includes("timed out") ||
            deepMsg.includes("timeout") ||
            deepMsg.includes("rate limit") ||
            deepMsg.includes("too many requests") ||
            deepMsg.includes("header not found") ||
            deepMsg.includes("block") ||
            err?.code === -32603 ||
            err?.code === -32000 ||
            err?.code === -32005;

          if (isRetryable && attempt < retries) {
            const delay = Math.min(1000 * 2 ** attempt, 6000);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          // If we exhausted retries or the error is not retryable, rethrow with
          // the most useful human-readable message available.
          const finalMsg = err?.shortMessage || err?.cause?.shortMessage || err?.message || "Transaction failed";
          const fallback = new Error(finalMsg);
          fallback.code = err?.code;
          throw fallback;
        }
      }
    };

    return c;
  }, [publicClient, address, write]);
}

export function decodeInvoice(row) {
  return {
    seller: row[0],
    buyer: row[1],
    faceValue: row[2],
    description: row[3],
    dueDate: row[4],
    status: Number(row[5]),
    createdAt: row[6],
    confirmedAt: row[7],
    totalSoldPercentageBps: row[8],
    discountBps: row[9],
    stakedAmount: row[10],
    stakeConsumed: row[11],
    repaidAmount: row[12],
    sellerHasClaimed: row[13],
    distributedAmount: row[14],
    claimsMade: row[15],
  };
}

export const STATUS_LABELS = ["Created", "Confirmed", "Tokenized", "Repaid", "Defaulted"];
