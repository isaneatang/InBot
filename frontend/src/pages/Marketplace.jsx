import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import InvoiceCard from "../components/InvoiceCard";
import { useFactoryContract, decodeInvoice } from "../hooks/useInvoiceFactory";

export function useAllInvoices() {
  const c = useFactoryContract();
  return useQuery({
    queryKey: ["allInvoices"],
    queryFn: async () => {
      const count = Number(await c.nextInvoiceId());
      if (count === 0) return [];
      const items = [];
      for (let i = 0; i < count; i++) {
        const row = await c.getInvoice(i);
        items.push({ id: i, ...decodeInvoice(row) });
      }
      return items;
    },
  });
}

export default function Marketplace() {
  const { data, isLoading, isError } = useAllInvoices();
  const [minDiscount, setMinDiscount] = useState(5000);
  const [maxDays, setMaxDays] = useState(90);
  const [stakedOnly, setStakedOnly] = useState(false);
  const [sort, setSort] = useState("newest");

  let list = (data || []).filter((inv) => Number(inv.status) === 2 && Number(inv.discountBps) >= minDiscount);
  if (stakedOnly) list = list.filter((inv) => Number(inv.stakedAmount) > 0);
  const now = Math.floor(Date.now() / 1000);
  list = list.filter((inv) => (Number(inv.dueDate) - now) / 86400 <= maxDays);

  switch (sort) {
    case "discount":
      list.sort((a, b) => Number(b.discountBps) - Number(a.discountBps));
      break;
    case "mostFunded":
      list.sort((a, b) => Number(b.totalSoldPercentageBps) - Number(a.totalSoldPercentageBps));
      break;
    case "leastFunded":
      list.sort((a, b) => Number(a.totalSoldPercentageBps) - Number(b.totalSoldPercentageBps));
      break;
    case "dueSoonest":
      list.sort((a, b) => Number(a.dueDate) - Number(b.dueDate));
      break;
    default:
      list.sort((a, b) => b.id - a.id);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Marketplace</h1>
        <span className="text-sm text-text-secondary tabular">{list.length} open</span>
      </div>

      <div className="card p-4 mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="label mb-1 block">Min discount</label>
          <input type="range" min={5000} max={9900} step={100} value={minDiscount}
            onChange={(e) => setMinDiscount(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          <span className="text-xs tabular text-text-secondary">{(minDiscount / 100).toFixed(0)}%</span>
        </div>
        <div>
          <label className="label mb-1 block">Max days until due</label>
          <input type="range" min={1} max={90} step={1} value={maxDays}
            onChange={(e) => setMaxDays(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          <span className="text-xs tabular text-text-secondary">{maxDays} days</span>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={stakedOnly} onChange={(e) => setStakedOnly(e.target.checked)} className="accent-[var(--color-primary)]" />
            Staked only
          </label>
        </div>
        <div>
          <label className="label mb-1 block">Sort</label>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="input">
            <option value="newest">Newest</option>
            <option value="discount">Highest Discount</option>
            <option value="mostFunded">Most Funded</option>
            <option value="leastFunded">Least Funded</option>
            <option value="dueSoonest">Due Soonest</option>
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="card p-4"><div className="h-4 w-1/3 mb-4 rounded-lg" style={{ background: "var(--color-surface-elevated)" }} /><div className="h-6 w-1/2 mb-2 rounded-lg" style={{ background: "var(--color-surface-elevated)" }} /><div className="h-4 w-full rounded-lg" style={{ background: "var(--color-surface-elevated)" }} /></div>)}
        </div>
      )}

      {isError && (
        <div className="card p-6 text-center" style={{ borderColor: "rgba(212,76,68,0.3)" }}>
          <p style={{ color: "var(--color-danger)" }}>Could not load marketplace data. The network may be unreachable.</p>
          <p className="text-sm text-text-secondary mt-1">Check your connection and try again.</p>
        </div>
      )}

      {!isLoading && !isError && list.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-text-secondary">No tokenized invoices are currently open for investment. Check back soon.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((inv) => <InvoiceCard key={inv.id} invoice={inv} id={inv.id} />)}
      </div>
    </div>
  );
}
