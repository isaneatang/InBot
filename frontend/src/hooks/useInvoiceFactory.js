import { useMemo } from "react";
import { usePublicClient, useWriteContract, useAccount, useChainId } from "wagmi";
import { parseAbi } from "viem";
import { INVOICE_FACTORY_ADDRESS, ACTIVE_NETWORK, USDT_DECIMALS } from "../config/network";
import abi from "../abi.json";

export const INVOICE_ABI = abi;

export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

/** Page size for batched invoice reads. Keeps each response comfortably under RPC limits. */
const INVOICE_PAGE_SIZE = 50;

/** Approving the maximum means a user only ever signs one approval for this contract. */
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Turns any wallet or RPC error into a single lowercase string so it can be matched
 * without worrying about which nesting level the useful text ended up in.
 */
function flattenError(err) {
  const parts = [];
  let node = err;
  for (let depth = 0; node && depth < 6; depth++) {
    parts.push(node.shortMessage, node.message, node.details, node.reason, node.name);
    if (Array.isArray(node.metaMessages)) parts.push(...node.metaMessages);
    node = node.cause;
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function isUserRejection(err) {
  const text = flattenError(err);
  return (
    err?.code === 4001 ||
    err?.name === "UserRejectedRequestError" ||
    text.includes("user rejected") ||
    text.includes("user denied") ||
    text.includes("rejected the request") ||
    text.includes("request rejected")
  );
}

/**
 * Maps a raw revert or RPC failure to something a person can act on. Custom errors from
 * InvoiceFactory come back by name once viem has decoded them against the ABI.
 */
export function describeError(err) {
  if (isUserRejection(err)) return "You cancelled the transaction in your wallet.";
  const text = flattenError(err);

  if (text.includes("insufficient allowance")) {
    return "USDT spending approval is missing or too low. Approve the contract and try again.";
  }
  if (text.includes("transfer amount exceeds balance") || text.includes("insufficient balance")) {
    return "Your USDT balance is too low for this amount.";
  }
  if (text.includes("insufficient funds")) {
    return `You do not have enough ${ACTIVE_NETWORK.nativeSymbol} to pay for gas on this transaction.`;
  }
  if (text.includes("notauthorized")) return "This wallet is not allowed to perform this action on this invoice.";
  if (text.includes("invalidstatus")) return "The invoice has moved on and no longer accepts this action. Reload the page.";
  if (text.includes("pastduedate")) return "The due date has passed, so this action is no longer available.";
  if (text.includes("notyetdue")) return "The due date has not passed yet.";
  if (text.includes("invaliddiscountrate")) return "The discount rate must be between 50 and 99 percent.";
  if (text.includes("exceedsavailablepercentage")) return "That amount is more than the share still available on this invoice.";
  if (text.includes("alreadyclaimed")) return "This share has already been claimed.";
  if (text.includes("nostaketoclaim")) return "This invoice defaulted with no stake posted, so there is nothing to claim.";
  if (text.includes("nosellershare")) return "There is no seller share to claim on this invoice.";
  if (text.includes("claimspending")) return "Dust can only be swept once every investor and the seller have claimed.";
  if (text.includes("usernametaken")) return "That username is already taken. Pick another.";
  if (text.includes("usernamealreadyset")) return "This wallet has already claimed a username. Usernames are permanent.";
  if (text.includes("invalidusername")) return "Usernames must be between 1 and 32 characters.";
  if (text.includes("invalidbuyer")) return "You cannot invoice your own wallet address.";
  if (text.includes("zeroaddress")) return "That address is not valid.";
  if (text.includes("zeroamount")) return "Enter an amount greater than zero.";
  if (text.includes("invalidinvoice")) return "That invoice does not exist.";

  if (text.includes("chain mismatch") || text.includes("chain id")) {
    return `Your wallet is on the wrong network. Switch to ${ACTIVE_NETWORK.label} and try again.`;
  }
  if (text.includes("timeout") || text.includes("timed out")) {
    return "The network did not respond in time. Check your connection and try again.";
  }
  if (text.includes("rate limit") || text.includes("too many requests")) {
    return "The network is rate limiting requests. Wait a moment and try again.";
  }

  return err?.shortMessage || err?.cause?.shortMessage || err?.message || "The transaction failed.";
}

/** Transient conditions worth a second attempt, as opposed to a genuine revert. */
function isTransient(err) {
  const text = flattenError(err);
  return (
    err?.code === -32603 ||
    err?.code === -32000 ||
    err?.code === -32005 ||
    text.includes("header not found") ||
    text.includes("block not found") ||
    text.includes("missing trie node") ||
    text.includes("nonce too low") ||
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("rate limit") ||
    text.includes("too many requests") ||
    text.includes("failed to fetch") ||
    text.includes("network error") ||
    text.includes("internal json-rpc error")
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function useFactoryContract() {
  const publicClient = usePublicClient();
  const { address: account } = useAccount();
  const chainId = useChainId();
  const write = useWriteContract();

  return useMemo(() => {
    const factory = { address: INVOICE_FACTORY_ADDRESS, abi };
    const usdt = { address: ACTIVE_NETWORK.usdtAddress, abi: ERC20_ABI };
    const onCorrectNetwork = chainId === ACTIVE_NETWORK.chainId;

    const read = (functionName, args) =>
      publicClient.readContract({ ...factory, functionName, args });

    const c = {
      publicClient,
      account,
      chainId,
      onCorrectNetwork,
      ...write,
    };

    /* ---------------------------------------------------------------- */
    /* Reads                                                            */
    /* ---------------------------------------------------------------- */

    c.getInvoice = (id) => read("getInvoice", [BigInt(id)]);
    c.nextInvoiceId = () => read("nextInvoiceId");
    c.investorContribution = (id, who) => read("investorContribution", [BigInt(id), who]);
    c.investorPercentage = (id, who) => read("investorPercentageBps", [BigInt(id), who]);
    c.getInvestors = (id) => read("getInvestors", [BigInt(id)]);
    c.investorCount = (id) => read("investorCount", [BigInt(id)]);
    c.username = (who) => read("addressToUsername", [who]);
    c.onTimePayments = (who) => read("onTimePayments", [who]);
    c.latePayments = (who) => read("latePayments", [who]);
    c.defaultCount = (who) => read("defaultCount", [who]);
    c.isTrusted = (who) => read("isTrusted", [who]);
    c.claimableInvestorShare = (id, who) => read("claimableInvestorShare", [BigInt(id), who]);
    c.claimableSellerShare = (id) => read("claimableSellerShare", [BigInt(id)]);
    c.sweepableDust = (id) => read("sweepableDust", [BigInt(id)]);
    c.quoteInvestment = (id, amount) => read("quoteInvestment", [BigInt(id), BigInt(amount)]);

    /**
     * Identity plus credit history in a single call rather than four.
     */
    c.creditProfile = async (who) => {
      const [username, onTime, late, defaults, trusted] = await read("getCreditProfile", [who]);
      return {
        address: who,
        username,
        onTime: Number(onTime),
        late: Number(late),
        defaults: Number(defaults),
        trusted,
      };
    };

    /**
     * Loads the full invoice book using the contract's paged getter, so a book of 200
     * invoices costs four requests instead of two hundred.
     */
    c.allInvoices = async () => {
      const total = Number(await c.nextInvoiceId());
      if (total === 0) return [];
      const pages = [];
      for (let offset = 0; offset < total; offset += INVOICE_PAGE_SIZE) {
        pages.push(read("getInvoices", [BigInt(offset), BigInt(INVOICE_PAGE_SIZE)]));
      }
      const settled = await Promise.all(pages);
      return settled.flat().map((row, index) => ({ id: index, ...normalizeInvoice(row) }));
    };

    /**
     * Reads many credit profiles at once, de-duplicating addresses first.
     */
    c.creditProfiles = async (addresses) => {
      const unique = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
      const results = await Promise.all(unique.map((a) => c.creditProfile(a).catch(() => null)));
      const map = {};
      unique.forEach((addr, i) => {
        if (results[i]) map[addr] = results[i];
      });
      return map;
    };

    /* ---------------------------------------------------------------- */
    /* Token and gas helpers                                            */
    /* ---------------------------------------------------------------- */

    c.usdtBalance = (who) =>
      publicClient.readContract({ ...usdt, functionName: "balanceOf", args: [who] });

    c.usdtAllowance = (who) =>
      publicClient.readContract({ ...usdt, functionName: "allowance", args: [who, INVOICE_FACTORY_ADDRESS] });

    c.nativeBalance = (who) => publicClient.getBalance({ address: who });

    /**
     * Confirms the wallet holds enough USDT before any approval prompt is raised, so the
     * user is told what is wrong instead of watching a transaction fail.
     */
    c.requireUsdtBalance = async (amount) => {
      const needed = BigInt(amount);
      if (needed === 0n) return;
      const balance = await c.usdtBalance(account);
      if (balance < needed) {
        throw new Error(
          `You need ${formatTokenAmount(needed)} USDT for this action but hold ${formatTokenAmount(balance)} USDT.`
        );
      }
    };

    /**
     * Raises the USDT allowance if the contract cannot yet pull the amount required.
     *
     * After the approval is mined the allowance is polled until the node actually serves
     * the new value. Waiting on the receipt alone is not enough on a load balanced RPC,
     * where the next read can still land on a node one block behind and report the old
     * allowance. That stale read is what makes the following simulation revert and the
     * wallet show an unestimatable transaction.
     */
    c.ensureApproval = async (amount) => {
      const needed = BigInt(amount);
      if (needed === 0n) return false;

      const current = await c.usdtAllowance(account);
      if (current >= needed) return false;

      const hash = await c.sendTransaction({
        ...usdt,
        functionName: "approve",
        args: [INVOICE_FACTORY_ADDRESS, MAX_UINT256],
      });
      await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

      for (let attempt = 0; attempt < 12; attempt++) {
        const allowance = await c.usdtAllowance(account).catch(() => 0n);
        if (allowance >= needed) return true;
        await sleep(500);
      }
      throw new Error(
        "The USDT approval was confirmed but the network is still reporting the old allowance. Wait a few seconds and try again."
      );
    };

    /**
     * Simulates a contract call, then sends it with an explicit gas limit.
     *
     * Simulating first serves two purposes. It surfaces the exact revert reason before the
     * wallet is ever opened, and it yields a gas figure that is passed straight to the
     * wallet so the wallet never has to run its own estimation. Several wallet in-app
     * browsers display a blank or dashed fee and refuse to sign when their own estimation
     * call fails, which is why the limit is supplied rather than left to them.
     *
     * The account passed to the simulation must be the connected wallet. Simulating as the
     * contract itself makes every function that pulls USDT revert, because the contract has
     * neither a balance nor an allowance to itself.
     */
    c.sendTransaction = async ({ address, abi: contractAbi, functionName, args, value }, { retries = 2 } = {}) => {
      if (!account) throw new Error("Connect your wallet to continue.");
      if (!onCorrectNetwork) {
        throw new Error(`Switch your wallet to ${ACTIVE_NETWORK.label} before sending a transaction.`);
      }

      let lastError;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const { request } = await publicClient.simulateContract({
            address,
            abi: contractAbi,
            functionName,
            args,
            value,
            account,
          });

          // A 25 percent head room covers the difference between a simulation against the
          // latest block and execution one or two blocks later.
          const gas = request.gas ? (request.gas * 125n) / 100n : undefined;
          await c.requireGasBudget(gas);

          return await write.writeContractAsync({
            address,
            abi: contractAbi,
            functionName,
            args,
            value,
            gas,
          });
        } catch (err) {
          lastError = err;
          if (isUserRejection(err)) throw err;
          if (isTransient(err) && attempt < retries) {
            await sleep(Math.min(800 * 2 ** attempt, 4000));
            continue;
          }
          throw new TransactionError(describeError(err), err);
        }
      }
      throw new TransactionError(describeError(lastError), lastError);
    };

    /**
     * Checks the wallet can cover the gas for a call before prompting to sign it.
     */
    c.requireGasBudget = async (gas) => {
      if (!gas) return;
      try {
        const [balance, fees] = await Promise.all([
          c.nativeBalance(account),
          publicClient.estimateFeesPerGas().catch(() => null),
        ]);
        const gasPrice = fees?.maxFeePerGas ?? fees?.gasPrice;
        if (!gasPrice) return;
        const cost = gas * gasPrice;
        if (balance < cost) {
          throw new TransactionError(
            `This transaction needs about ${formatNative(cost)} ${ACTIVE_NETWORK.nativeSymbol} for gas but your wallet holds ${formatNative(balance)}. Top up from the BOT Chain faucet.`
          );
        }
      } catch (err) {
        // Only a genuine shortfall should block signing. A failure to read the balance or
        // the fee market must not stop an otherwise valid transaction.
        if (err instanceof TransactionError) throw err;
      }
    };

    /**
     * Sends a transaction and waits for its receipt, so callers can show a real confirmed
     * state rather than an optimistic one. Throws if the transaction reverted on chain.
     */
    c.sendAndConfirm = async (params, options) => {
      const hash = await c.sendTransaction(params, options);
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
      if (receipt.status !== "success") {
        throw new TransactionError("The transaction was mined but reverted on chain.", { hash });
      }
      return { hash, receipt };
    };

    /**
     * The single entry point for every write against InvoiceFactory. Handles the USDT
     * approval when the call pulls tokens, then sends and confirms.
     */
    c.call = async (functionName, args, { approve = 0n } = {}) => {
      if (approve && BigInt(approve) > 0n) {
        await c.requireUsdtBalance(approve);
        await c.ensureApproval(approve);
      }
      return c.sendAndConfirm({ ...factory, functionName, args });
    };

    return c;
  }, [publicClient, account, chainId, write]);
}

/** Error carrying a message already written for a person to read. */
export class TransactionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "TransactionError";
    this.cause = cause;
  }
}

/** Converts a struct returned by getInvoice or getInvoices into a plain named object. */
export function normalizeInvoice(row) {
  return {
    seller: row.seller,
    buyer: row.buyer,
    faceValue: row.faceValue,
    description: row.description,
    dueDate: row.dueDate,
    status: Number(row.status),
    createdAt: row.createdAt,
    confirmedAt: row.confirmedAt,
    totalSoldPercentageBps: row.totalSoldPercentageBps,
    discountBps: row.discountBps,
    stakedAmount: row.stakedAmount,
    stakeConsumed: row.stakeConsumed,
    repaidAmount: row.repaidAmount,
    sellerHasClaimed: row.sellerHasClaimed,
    distributedAmount: row.distributedAmount,
    claimsMade: row.claimsMade,
    poolAmount: row.poolAmount,
    distributionBasisBps: row.distributionBasisBps,
  };
}

function formatTokenAmount(value, decimals = USDT_DECIMALS) {
  const factor = 10n ** BigInt(decimals);
  const whole = value / factor;
  const frac = (value % factor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

function formatNative(value) {
  const factor = 10n ** 18n;
  const whole = value / factor;
  const frac = (value % factor).toString().padStart(18, "0").slice(0, 5).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
