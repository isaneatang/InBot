import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import StatusStepper from "../components/StatusStepper";
import TrustedBadge from "../components/TrustedBadge";
import { useFactoryContract, decodeInvoice, INVOICE_ABI } from "../hooks/useInvoiceFactory";
import { useToast } from "../components/Toast";
import { formatMoney, formatDate, relativeDue, truncateAddress, parseUnits } from "../lib/format";
import { INVOICE_FACTORY_ADDRESS, ACTIVE_NETWORK, USERNAME_FEE_WEI } from "../config/network";
import { isAddress } from "viem";

export default function InvoiceDetail() {
  const { id } = useParams();
  const invoiceId = BigInt(id ?? 0);
  const { address, isConnected } = useAccount();
  const c = useFactoryContract();
  const toast = useToast();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState("");
  const [discount, setDiscount] = useState(8500);
  const [stake, setStake] = useState("");
  const [investAmount, setInvestAmount] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const invoiceQuery = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const row = await c.getInvoice(invoiceId);
      return decodeInvoice(row);
    },
  });
  const inv = invoiceQuery.data;

  const relation = useQuery({
    queryKey: ["relation", id, address],
    queryFn: async () => {
      const contribution = await c.investorContribution(invoiceId, address);
      const percentage = await c.investorPercentage(invoiceId, address);
      return { contribution, percentage: Number(percentage), hasInvested: Number(contribution) > 0 };
    },
    enabled: !!inv && !!address && isConnected,
  });

  const buyerCredit = useQuery({
    queryKey: ["credit", inv?.buyer],
    queryFn: async () => {
      const [onTime, late, def] = await Promise.all([c.onTimePayments(inv.buyer), c.latePayments(inv.buyer), c.defaultCount(inv.buyer)]);
      return { onTime: Number(onTime), late: Number(late), def: Number(def) };
    },
    enabled: !!inv,
  });

  const buyerName = useQuery({ queryKey: ["username", inv?.buyer], queryFn: () => c.username(inv.buyer), enabled: !!inv });
  const sellerName = useQuery({ queryKey: ["username", inv?.seller], queryFn: () => c.username(inv.seller), enabled: !!inv });

  const exec = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
      toast.push(`${label} submitted`, "success");
      setTimeout(() => invoiceQuery.refetch(), 1500);
    } catch (e) {
      toast.push(e?.shortMessage || `${label} failed`, "error");
    } finally {
      setBusy("");
    }
  };

  const doWrite = async (functionName, args) => {
    // USDT-pulling operations need the user to approve the contract as a spender first.
    // Without it the wallet cannot estimate gas and shows a dash instead of confirming.
    if (functionName === "payDirect" || functionName === "repayTokenized") {
      await c.ensureApproval(inv.faceValue);
    } else if (functionName === "tokenizeInvoice" && stake) {
      await c.ensureApproval(parseUnits(stake));
    } else if (functionName === "invest" && args?.[1]) {
      await c.ensureApproval(args[1]);
    }
    await c.writeContractAsync({ address: INVOICE_FACTORY_ADDRESS, abi: INVOICE_ABI, functionName, args });
  };

  if (invoiceQuery.isLoading || !inv) {
    return <div className="card p-6"><div className="h-6 w-1/3 mb-4 rounded bg-surface-elevated animate-pulse" /><div className="h-4 w-2/3 rounded bg-surface-elevated animate-pulse" /></div>;
  }

  const status = Number(inv.status);
  const isBuyer = isConnected && address?.toLowerCase() === inv.buyer.toLowerCase();
  const isSeller = isConnected && address?.toLowerCase() === inv.seller.toLowerCase();
  const overdue = now > Number(inv.dueDate);
  const fullySold = Number(inv.totalSoldPercentageBps) >= 10000;
  const due = relativeDue(inv.dueDate, now);

  const trusted = buyerCredit.data && buyerCredit.data.onTime >= 5 && buyerCredit.data.def === 0;

  const actions = [];
  if (status === 0 && isBuyer) {
    actions.push({
      key: "confirm",
      label: "Confirm Invoice",
      run: () => doWrite("confirmInvoice", [invoiceId, BigInt(now + 30 * 86400)]),
    });
  }
  if (status === 1 && isBuyer && !overdue) {
    actions.push({ key: "pay", label: "Pay Direct", run: () => doWrite("payDirect", [invoiceId]) });
  }
  if (status === 1 && isSeller && !overdue) {
    actions.push({
      key: "tokenize",
      label: "Tokenize",
      run: () => doWrite("tokenizeInvoice", [invoiceId, BigInt(discount), stake ? parseUnits(stake) : 0n]),
    });
  }
  if (status === 2 && isBuyer && !overdue) {
    actions.push({ key: "repay", label: "Repay Invoice", run: () => doWrite("repayTokenized", [invoiceId]) });
  }
  if (status === 2 && !fullySold && !overdue) {
    actions.push({
      key: "invest",
      label: "Invest",
      run: () => doWrite("invest", [invoiceId, parseUnits(investAmount)]),
    });
  }
  if ((status === 1 || status === 2) && overdue) {
    actions.push({ key: "default", label: "Mark Defaulted", run: () => doWrite("markDefault", [invoiceId]) });
  }
  if (status === 3 && isSeller && !inv.sellerHasClaimed) {
    actions.push({ key: "sellerClaim", label: "Claim Seller Share", run: () => doWrite("claimSellerShare", [invoiceId]) });
  }
  if (status === 3 && relation.data?.hasInvested) {
    actions.push({ key: "investorClaim", label: "Claim My Share", run: () => doWrite("claimInvestorShare", [invoiceId]) });
  }
  if (status === 4 && relation.data?.hasInvested) {
    actions.push({ key: "investorClaim", label: "Claim From Stake", run: () => doWrite("claimInvestorShare", [invoiceId]) });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-semibold font-mono">Invoice #{id}</h1>
            <span className="text-xs text-text-secondary tabular">{STATUS_LABEL(status)}</span>
          </div>
          <StatusStepper invoice={inv} />

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div>
              <div className="label mb-1">Face value</div>
              <div className="text-2xl font-semibold tabular">${formatMoney(inv.faceValue)}</div>
            </div>
            <div>
              <div className="label mb-1">Repaid</div>
              <div className="text-2xl tabular">${formatMoney(inv.repaidAmount)}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="label mb-1">Description</div>
            <p className="text-text-secondary">{inv.description || "No description"}</p>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-text-secondary">Seller</span>
              <Link to={`/profile/${inv.seller}`} className="font-mono hover:text-primary">{truncateAddress(inv.seller)}</Link></div>
            <div className="flex justify-between"><span className="text-text-secondary">Buyer</span>
              <Link to={`/profile/${inv.buyer}`} className="font-mono hover:text-primary">{truncateAddress(inv.buyer)}</Link></div>
            <div className="flex justify-between"><span className="text-text-secondary">Created</span><span className="tabular">{formatDate(inv.createdAt)}</span></div>
            <div className="flex justify-between"><span className="text-text-secondary">Due date</span><span className="tabular">{formatDate(inv.dueDate)}</span></div>
            <div className="flex justify-between"><span className="text-text-secondary">Time</span>
              <span className="tabular" style={{ color: due.overdue ? "var(--color-danger)" : "var(--color-text-primary)" }}>{due.label}</span></div>
          </div>
        </div>

        {status >= 2 && inv.discountBps > 0 && (
          <div className="card p-6">
            <h2 className="font-medium mb-3">Funding</h2>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-secondary">Sold</span>
              <span className="tabular">{Number(inv.totalSoldPercentageBps) / 100}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-elevated overflow-hidden">
              <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${Number(inv.totalSoldPercentageBps) / 100}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
            </div>
            <div className="flex justify-between text-sm mt-4">
              <span className="text-text-secondary">Discount</span><span className="tabular">{Number(inv.discountBps) / 100}%</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-text-secondary">Stake</span><span className="tabular">${formatMoney(inv.stakedAmount)}</span>
            </div>
            {Number(inv.stakedAmount) > 0 && (
              <div className="flex justify-between text-sm mt-1">
                <span className="text-text-secondary">Stake consumed</span><span>{inv.stakeConsumed ? "Yes" : "No"}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          <h2 className="font-medium mb-3">Actions</h2>
          {!isConnected ? (
            <p className="text-sm text-text-secondary">Connect your wallet to act on this invoice.</p>
          ) : actions.length === 0 ? (
            <p className="text-sm text-text-secondary">No actions available for your role at this stage.</p>
          ) : (
            <div className="space-y-4">
              {actions.map((a) => (
                <div key={a.key}>
                  {a.key === "tokenize" && (
                    <div className="space-y-2 mb-2">
                      <div>
                        <label className="label mb-1 block">Discount rate (50% to 99%)</label>
                        <select value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="input">
                          {[5000, 6000, 7000, 7500, 8000, 8500, 9000, 9500, 9900].map((d) => <option key={d} value={d}>{d / 100}%</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label mb-1 block">First-loss stake (USDT, optional)</label>
                        <input type="text" inputMode="decimal" className="input tabular" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="0" />
                      </div>
                    </div>
                  )}
                  {a.key === "invest" && (
                    <div className="mb-2">
                      <label className="label mb-1 block">Amount to invest (USDT)</label>
                      <input type="text" inputMode="decimal" className="input tabular" value={investAmount} onChange={(e) => setInvestAmount(e.target.value)} placeholder="0.00" />
                    </div>
                  )}
                  <button className="btn btn-primary w-full py-2.5" disabled={busy === a.key} onClick={() => exec(a.label, a.run)}>
                    {busy === a.key ? (
                      <span className="inline-block w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                    ) : a.label}
                  </button>
                </div>
              ))}
            </div>
          )}
          {(status === 3 || status === 4) && (
            <button className="btn btn-outline w-full py-2.5 mt-3 text-xs" disabled={busy === "sweep"} onClick={() => exec("Sweep dust", () => doWrite("sweepDust", [invoiceId]))}>
              Sweep leftover dust
            </button>
          )}
        </div>

        <div className="card p-6">
          <h2 className="font-medium mb-3">Buyer credit history</h2>
          {buyerCredit.data ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border border-border rounded-md p-3"><div className="text-xl font-semibold tabular">{buyerCredit.data.onTime}</div><div className="text-xs text-text-secondary">On-time</div></div>
              <div className="border border-border rounded-md p-3"><div className="text-xl font-semibold tabular">{buyerCredit.data.late}</div><div className="text-xs text-text-secondary">Late</div></div>
              <div className="border border-border rounded-md p-3"><div className="text-xl font-semibold tabular" style={{ color: buyerCredit.data.def > 0 ? "var(--color-danger)" : "inherit" }}>{buyerCredit.data.def}</div><div className="text-xs text-text-secondary">Defaults</div></div>
            </div>
          ) : <div className="h-16 rounded bg-surface-elevated animate-pulse" />}
          {trusted && <div className="mt-3"><TrustedBadge /></div>}
        </div>

        {relation.data?.hasInvested && (
          <div className="card p-6">
            <h2 className="font-medium mb-2">Your position</h2>
            <div className="flex justify-between text-sm"><span className="text-text-secondary">Contribution</span><span className="tabular">${formatMoney(relation.data.contribution)}</span></div>
            <div className="flex justify-between text-sm mt-1"><span className="text-text-secondary">Share</span><span className="tabular">{relation.data.percentage / 100}%</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

function STATUS_LABEL(s) {
  return ["Created", "Confirmed", "Tokenized", "Repaid", "Defaulted"][s] || "Unknown";
}