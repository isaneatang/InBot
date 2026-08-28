import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import InvoiceCard from "../components/InvoiceCard";
import {
  BottomSheet,
  CardGridSkeleton,
  Callout,
  EmptyState,
  ErrorState,
  Icon,
  Money,
  PageHeader,
} from "../components/ui";
import { useAllInvoices, useCreditProfiles } from "../hooks/useInvoices";
import { useNetworkSwitch, useWallet } from "../hooks/useNetwork";
import { ACTIVE_NETWORK, MAX_DISCOUNT_BPS, MIN_DISCOUNT_BPS } from "../config/network";

const SORTS = [
  { key: "newest", label: "Newest first" },
  { key: "discount", label: "Deepest discount" },
  { key: "leastFunded", label: "Least funded" },
  { key: "mostFunded", label: "Most funded" },
  { key: "dueSoonest", label: "Due soonest" },
  { key: "largest", label: "Largest face value" },
];

const DEFAULT_FILTERS = {
  minDiscount: MIN_DISCOUNT_BPS,
  maxDays: 120,
  stakedOnly: false,
  trustedBuyerOnly: false,
  sort: "newest",
};

export default function Marketplace() {
  const { data, isLoading, isError, error, refetch } = useAllInvoices();
  const { onCorrectNetwork, isConnected } = useWallet();
  const { switchNetwork } = useNetworkSwitch();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  /** Only tokenized invoices that are still open and still fundable belong on the market. */
  const open = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    return (data || []).filter(
      (inv) => inv.status === 2 && Number(inv.dueDate) > now && Number(inv.totalSoldPercentageBps) < 10000
    );
  }, [data]);

  const addresses = useMemo(() => open.flatMap((inv) => [inv.buyer, inv.seller]), [open]);
  const { data: profiles = {} } = useCreditProfiles(addresses);

  const list = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    let result = open.filter((inv) => Number(inv.discountBps) >= filters.minDiscount);
    result = result.filter((inv) => (Number(inv.dueDate) - now) / 86400 <= filters.maxDays);
    if (filters.stakedOnly) result = result.filter((inv) => Number(inv.stakedAmount) > 0);
    if (filters.trustedBuyerOnly) {
      result = result.filter((inv) => profiles[inv.buyer?.toLowerCase()]?.trusted);
    }

    const sorted = [...result];
    switch (filters.sort) {
      case "discount":
        sorted.sort((a, b) => Number(a.discountBps) - Number(b.discountBps));
        break;
      case "mostFunded":
        sorted.sort((a, b) => Number(b.totalSoldPercentageBps) - Number(a.totalSoldPercentageBps));
        break;
      case "leastFunded":
        sorted.sort((a, b) => Number(a.totalSoldPercentageBps) - Number(b.totalSoldPercentageBps));
        break;
      case "dueSoonest":
        sorted.sort((a, b) => Number(a.dueDate) - Number(b.dueDate));
        break;
      case "largest":
        sorted.sort((a, b) => (BigInt(b.faceValue) > BigInt(a.faceValue) ? 1 : -1));
        break;
      default:
        sorted.sort((a, b) => b.id - a.id);
    }
    return sorted;
  }, [open, filters, profiles]);

  /** Aggregate figures for the market as a whole, useful context before filtering. */
  const totals = useMemo(() => {
    const availableValue = open.reduce((acc, inv) => {
      const remainingBps = BigInt(10000 - Number(inv.totalSoldPercentageBps));
      return acc + (BigInt(inv.faceValue) * remainingBps * BigInt(inv.discountBps)) / 100000000n;
    }, 0n);
    const avgDiscount = open.length
      ? open.reduce((acc, inv) => acc + Number(inv.discountBps), 0) / open.length
      : 0;
    return { availableValue, avgDiscount, staked: open.filter((i) => Number(i.stakedAmount) > 0).length };
  }, [open]);

  const activeFilterCount =
    (filters.minDiscount !== DEFAULT_FILTERS.minDiscount ? 1 : 0) +
    (filters.maxDays !== DEFAULT_FILTERS.maxDays ? 1 : 0) +
    (filters.stakedOnly ? 1 : 0) +
    (filters.trustedBuyerOnly ? 1 : 0);

  if (isError) {
    return (
      <>
        <PageHeader title="Marketplace" />
        <ErrorState
          error={error}
          onRetry={refetch}
          wrongNetwork={isConnected && !onCorrectNetwork}
          networkLabel={ACTIVE_NETWORK.label}
          onSwitchNetwork={switchNetwork}
        />
      </>
    );
  }

  const filterControls = <Filters filters={filters} set={set} onReset={() => setFilters(DEFAULT_FILTERS)} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketplace"
        subtitle="Tokenized invoices open for investment. You buy a share at a discount and receive face value if the buyer repays."
      />

      {/* Market context. Not filtered, so the numbers do not move as controls are used. */}
      {!isLoading && open.length > 0 && (
        <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-lg font-semibold tabular">
              <Money value={totals.availableValue} />
            </div>
            <div className="stat-label">Still to be funded</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular">{open.length}</div>
            <div className="stat-label">Open invoices</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular">{(totals.avgDiscount / 100).toFixed(1)}%</div>
            <div className="stat-label">Average price of face</div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular">{totals.staked}</div>
            <div className="stat-label">With a seller stake</div>
          </div>
        </div>
      )}

      {/* Desktop filter bar. */}
      <div className="hidden md:block card p-4">{filterControls}</div>

      {/* Mobile filter trigger and sort, kept to one row. */}
      <div className="flex md:hidden items-center gap-2">
        <button className="btn btn-outline btn-sm flex-1" onClick={() => setSheetOpen(true)}>
          <Icon name="filter" size={13} />
          Filters
          {activeFilterCount > 0 && <span className="segmented-count">{activeFilterCount}</span>}
        </button>
        <select
          className="input flex-1"
          style={{ minHeight: "2rem", padding: "0.25rem 2rem 0.25rem 0.625rem", fontSize: "0.8125rem" }}
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value })}
          aria-label="Sort invoices"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter invoices"
        footer={
          <button className="btn btn-primary btn-block" onClick={() => setSheetOpen(false)}>
            Show {list.length} invoice{list.length === 1 ? "" : "s"}
          </button>
        }
      >
        {filterControls}
      </BottomSheet>

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {isLoading ? "Loading" : `${list.length} invoice${list.length === 1 ? "" : "s"} match`}
        </p>
        {activeFilterCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <CardGridSkeleton count={6} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="store"
          title={
            open.length === 0
              ? "No invoices are open for investment right now"
              : "No invoices match these filters"
          }
          body={
            open.length === 0
              ? "An invoice appears here once a seller tokenizes it and before its due date passes. Check back, or create and tokenize one yourself."
              : "Widen the discount range or the days until due, or clear the filters to see everything that is open."
          }
          action={
            open.length === 0 ? (
              <Link to="/create" className="btn btn-outline">
                Create an invoice
              </Link>
            ) : (
              <button className="btn btn-outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Clear filters
              </button>
            )
          }
        />
      ) : (
        <>
          <div className="grid-cards">
            {list.map((inv) => (
              <InvoiceCard key={inv.id} id={inv.id} invoice={inv} counterparty="both" profiles={profiles} />
            ))}
          </div>

          <Callout tone="warn" title="Before you invest">
            Read the buyer's credit record and check whether the seller posted a first-loss stake. The
            contract cannot force repayment. On a default you recover only the stake, split between
            investors in proportion to what each bought, and nothing at all where no stake was posted.
          </Callout>
        </>
      )}
    </div>
  );
}

function Filters({ filters, set, onReset }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor="min-discount" className="label">
            Price of face, minimum
          </label>
          <span className="text-xs tabular font-medium">{(filters.minDiscount / 100).toFixed(0)}%</span>
        </div>
        <input
          id="min-discount"
          type="range"
          min={MIN_DISCOUNT_BPS}
          max={MAX_DISCOUNT_BPS}
          step={100}
          value={filters.minDiscount}
          onChange={(e) => set({ minDiscount: Number(e.target.value) })}
        />
        <p className="field-hint mt-1">A lower price means a deeper discount and a higher yield.</p>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor="max-days" className="label">
            Days until due, maximum
          </label>
          <span className="text-xs tabular font-medium">{filters.maxDays}</span>
        </div>
        <input
          id="max-days"
          type="range"
          min={1}
          max={180}
          step={1}
          value={filters.maxDays}
          onChange={(e) => set({ maxDays: Number(e.target.value) })}
        />
        <p className="field-hint mt-1">Shorter terms return your capital sooner.</p>
      </div>

      <div className="space-y-3">
        <Toggle
          label="Seller stake posted"
          hint="Only invoices with a first-loss buffer"
          checked={filters.stakedOnly}
          onChange={(v) => set({ stakedOnly: v })}
        />
        <Toggle
          label="Trusted buyer only"
          hint="Buyer has earned the on-chain badge"
          checked={filters.trustedBuyerOnly}
          onChange={(v) => set({ trustedBuyerOnly: v })}
        />
      </div>

      <div className="flex flex-col">
        <label htmlFor="sort" className="label mb-1.5 hidden md:block">
          Sort by
        </label>
        <select
          id="sort"
          className="input hidden md:block"
          value={filters.sort}
          onChange={(e) => set({ sort: e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button className="btn btn-ghost btn-sm mt-auto self-start md:mt-3" onClick={onReset}>
          Reset all
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 w-full text-left"
    >
      <span className="switch mt-0.5" data-on={checked} />
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block field-hint">{hint}</span>
      </span>
    </button>
  );
}
