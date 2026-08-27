import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import InvoiceCard from "../components/InvoiceCard";
import { useAllInvoices } from "./Marketplace";
import { useFactoryContract } from "../hooks/useInvoiceFactory";

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const { data, isLoading } = useAllInvoices();
  const [tab, setTab] = useState("seller");
  const c = useFactoryContract();

  const credit = useQuery({
    queryKey: ["credit", address],
    queryFn: async () => {
      const [onTime, late, def] = await Promise.all([c.onTimePayments(address), c.latePayments(address), c.defaultCount(address)]);
      return { onTime: Number(onTime), late: Number(late), def: Number(def) };
    },
    enabled: !!address && isConnected,
  });

  const asSeller = (data || []).filter((inv) => inv.seller.toLowerCase() === address?.toLowerCase());
  const asBuyer = (data || []).filter((inv) => inv.buyer.toLowerCase() === address?.toLowerCase());

  const invested = useQuery({
    queryKey: ["invested", address, data?.length],
    queryFn: async () => {
      const out = [];
      for (const inv of data || []) {
        const contribution = await c.investorContribution(BigInt(inv.id), address);
        if (Number(contribution) > 0) out.push(inv);
      }
      return out;
    },
    enabled: !!address && isConnected && !!data,
  });

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto p-8 text-center">
        <p className="mb-4">Connect your wallet to see your dashboard.</p>
        <Link to="/" className="btn btn-primary px-6 py-2">Connect Wallet</Link>
      </div>
    );
  }

  const tabs = [
    { key: "seller", label: "As Seller" },
    { key: "buyer", label: "As Buyer" },
    { key: "investor", label: "As Investor" },
  ];

  const renderInvestor = () => {
    if (invested.isLoading) return <div className="card p-4"><div className="h-6 w-1/2 mb-2 rounded-lg" style={{ background: "var(--color-surface-elevated)" }} /></div>;
    if (!invested.data?.length) {
      return <Empty msg="You have not invested in any invoices yet." to="/marketplace" cta="Browse Marketplace" />;
    }
    return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{invested.data.map((inv) => <InvoiceCard key={inv.id} invoice={inv} id={inv.id} />)}</div>;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <Link to="/create" className="btn btn-primary px-4 py-2 text-sm">Create Invoice</Link>
      </div>

      {credit.data && (
        <div className="card p-4 mb-6 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl p-3" style={{ background: "var(--color-surface-elevated)" }}>
            <div className="text-xl font-semibold tabular">{credit.data.onTime}</div>
            <div className="text-xs text-text-secondary">On-time</div>
          </div>
          <div className="rounded-xl p-3" style={{ background: "var(--color-surface-elevated)" }}>
            <div className="text-xl font-semibold tabular">{credit.data.late}</div>
            <div className="text-xs text-text-secondary">Late</div>
          </div>
          <div className="rounded-xl p-3" style={{ background: "var(--color-surface-elevated)" }}>
            <div className="text-xl font-semibold tabular" style={{ color: credit.data.def > 0 ? "var(--color-danger)" : "inherit" }}>{credit.data.def}</div>
            <div className="text-xs text-text-secondary">Defaults</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-sm transition-all"
            style={{
              background: tab === t.key ? "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-strong) 100%)" : "transparent",
              color: tab === t.key ? "#0a0c08" : "var(--color-text-secondary)",
              border: tab === t.key ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
              fontWeight: tab === t.key ? 500 : 400,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <div key={i} className="card p-4"><div className="h-6 w-1/2 mb-2 rounded-lg" style={{ background: "var(--color-surface-elevated)" }} /><div className="h-4 w-full rounded-lg" style={{ background: "var(--color-surface-elevated)" }} /></div>)}</div>}

      {tab === "seller" && (
        asSeller.length === 0 && !isLoading
          ? <Empty msg="You have not created any invoices yet." to="/create" cta="Create an Invoice" />
          : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{asSeller.map((inv) => <InvoiceCard key={inv.id} invoice={inv} id={inv.id} />)}</div>
      )}

      {tab === "buyer" && (
        asBuyer.length === 0 && !isLoading
          ? <Empty msg="No invoices are addressed to you yet." />
          : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{asBuyer.map((inv) => <InvoiceCard key={inv.id} invoice={inv} id={inv.id} />)}</div>
      )}

      {tab === "investor" && renderInvestor()}
    </div>
  );
}

function Empty({ msg, to, cta }) {
  return (
    <div className="card p-8 text-center">
      <p className="text-text-secondary mb-4">{msg}</p>
      {to && <Link to={to} className="btn btn-outline px-6 py-2">{cta}</Link>}
    </div>
  );
}
