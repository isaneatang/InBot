import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import InvoiceCard from "../components/InvoiceCard";
import TrustedBadge from "../components/TrustedBadge";
import { useAllInvoices } from "./Marketplace";
import { useFactoryContract } from "../hooks/useInvoiceFactory";
import { truncateAddress } from "../lib/format";
import { ACTIVE_NETWORK, TRUSTED_MIN_REPAID, TRUSTED_MAX_DEFAULTS } from "../config/network";

export default function Profile() {
  const { address } = useParams();
  const addr = (address || "").toLowerCase();
  const c = useFactoryContract();
  const [tab, setTab] = useState("buyer");
  const { data } = useAllInvoices();

  const profile = useQuery({
    queryKey: ["profile", addr],
    queryFn: async () => {
      const [username, onTime, late, def] = await Promise.all([
        c.username(addr),
        c.onTimePayments(addr),
        c.latePayments(addr),
        c.defaultCount(addr),
      ]);
      return { username, onTime: Number(onTime), late: Number(late), def: Number(def) };
    },
  });

  const asSeller = (data || []).filter((inv) => inv.seller.toLowerCase() === addr);
  const asBuyer = (data || []).filter((inv) => inv.buyer.toLowerCase() === addr);

  if (profile.isLoading) {
    return <div className="card p-6"><div className="h-6 w-1/3 mb-4 rounded bg-surface-elevated animate-pulse" /><div className="h-4 w-1/2 rounded bg-surface-elevated animate-pulse" /></div>;
  }

  const trusted = profile.data.onTime >= TRUSTED_MIN_REPAID && profile.data.def <= TRUSTED_MAX_DEFAULTS;

  return (
    <div>
      <div className="card p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{profile.data.username || truncateAddress(addr)}</h1>
            <a href={`${ACTIVE_NETWORK.explorerUrl}/address/${addr}`} target="_blank" rel="noreferrer" className="font-mono text-sm text-text-secondary hover:text-primary break-all">
              {addr}
            </a>
          </div>
          {trusted && <TrustedBadge />}
        </div>
        {trusted && (
          <p className="text-xs text-text-secondary mt-2">
            Trusted is earned automatically on-chain after at least {TRUSTED_MIN_REPAID} on-time repayments and at most {TRUSTED_MAX_DEFAULTS} defaults. No one can grant or remove it.
          </p>
        )}
      </div>

      <div className="card p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
        <div className="border border-border rounded-md p-4"><div className="text-2xl font-semibold tabular">{profile.data.onTime}</div><div className="text-sm text-text-secondary">On-Time Payments</div></div>
        <div className="border border-border rounded-md p-4"><div className="text-2xl font-semibold tabular">{profile.data.late}</div><div className="text-sm text-text-secondary">Late Payments</div></div>
        <div className="border border-border rounded-md p-4"><div className="text-2xl font-semibold tabular" style={{ color: profile.data.def > 0 ? "var(--color-danger)" : "inherit" }}>{profile.data.def}</div><div className="text-sm text-text-secondary">Defaults</div></div>
      </div>

      <div className="flex gap-2 mb-4">
        {[["buyer", "As Buyer"], ["seller", "As Seller"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-md text-sm border ${tab === k ? "bg-primary text-background border-primary" : "border-border text-text-secondary"}`}>{l}</button>
        ))}
      </div>

      {tab === "buyer" && (asBuyer.length === 0 ? <p className="text-text-secondary">No invoices as buyer.</p> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{asBuyer.map((inv) => <InvoiceCard key={inv.id} invoice={inv} id={inv.id} />)}</div>)}
      {tab === "seller" && (asSeller.length === 0 ? <p className="text-text-secondary">No invoices as seller.</p> : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{asSeller.map((inv) => <InvoiceCard key={inv.id} invoice={inv} id={inv.id} />)}</div>)}
    </div>
  );
}