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
    // Most USDT-pulling operations revert at estimate time without approval, which is what
    // causes the wallet to show a dash and refuse to confirm. Approve to the max so the
    // user only has to do this once.
    c.ensureApproval = async (amount) => {
      const needed = BigInt(amount);
      const allowance = await c.usdtAllowance(address);
      const max = 115792089237316195423570985008687907853269984665640564039457584007913129639935n;
      if (allowance < needed) {
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