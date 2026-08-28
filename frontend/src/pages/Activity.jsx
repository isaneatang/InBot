import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useBlockNumber, usePublicClient } from "wagmi";
import { AnimatePresence, motion } from "framer-motion";
import { Icon, Money, PageHeader, Segmented, Skeleton } from "../components/ui";
import { INVOICE_ABI } from "../hooks/useInvoiceFactory";
import { explorerTxUrl, formatBps, formatTimeOnly, truncateAddress } from "../lib/format";
import { ACTIVE_NETWORK, INVOICE_FACTORY_ADDRESS } from "../config/network";

/** Every event the contract emits, so nothing that happens on chain is invisible here. */
const EVENTS = {
  InvoiceCreated: { label: "Invoice created", tone: "neutral", icon: "plus" },
  InvoiceConfirmed: { label: "Invoice confirmed", tone: "neutral", icon: "check" },
  InvoiceTokenized: { label: "Invoice tokenized", tone: "primary", icon: "layers" },
  InvestmentMade: { label: "Investment made", tone: "primary", icon: "coins" },
  InvoicePaidDirect: { label: "Paid directly", tone: "primary", icon: "check" },
  InvoiceRepaid: { label: "Repaid in full", tone: "primary", icon: "check" },
  InvestorClaimed: { label: "Investor claimed", tone: "neutral", icon: "arrowDown" },
  SellerClaimed: { label: "Seller claimed", tone: "neutral", icon: "arrowDown" },
  StakeReturned: { label: "Stake returned", tone: "neutral", icon: "arrowUp" },
  InvoiceDefaulted: { label: "Defaulted", tone: "danger", icon: "alert" },
  UsernameClaimed: { label: "Username claimed", tone: "neutral", icon: "user" },
  TrustedStatusGranted: { label: "Trusted granted", tone: "warn", icon: "check" },
};

const EVENT_NAMES = Object.keys(EVENTS);

const TONE_COLOR = {
  primary: "var(--color-primary)",
  danger: "var(--color-danger)",
  warn: "var(--color-accent-warn)",
  neutral: "var(--color-text-secondary)",
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "money", label: "Money" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "identity", label: "Identity" },
];

const GROUPS = {
  money: ["InvestmentMade", "InvoicePaidDirect", "InvoiceRepaid", "InvestorClaimed", "SellerClaimed", "StakeReturned"],
  lifecycle: ["InvoiceCreated", "InvoiceConfirmed", "InvoiceTokenized", "InvoiceDefaulted"],
  identity: ["UsernameClaimed", "TrustedStatusGranted"],
};

/**
 * How far back to look on first load, and how much to ask for per request.
 *
 * Public RPC nodes commonly cap a single eth_getLogs range, so history is walked backwards in
 * chunks from the newest block rather than requested in one wide call. Walking newest first
 * means the feed fills with the most recent events immediately and older ones arrive after.
 */
const BACKFILL_BLOCKS = 300000n;
const CHUNK_BLOCKS = 10000n;
const MAX_ROWS = 120;
/** Enough recent events to fill the screen. Older chunks are not worth the requests. */
const BACKFILL_TARGET = 60;

export default function Activity() {
  const publicClient = usePublicClient();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backfilled, setBackfilled] = useState(false);
  const [filter, setFilter] = useState("all");
  const [liveCount, setLiveCount] = useState(0);
  const seen = useRef(new Set());

  const add = useCallback((logs, live) => {
    const rows = [];
    for (const log of logs) {
      const key = `${log.transactionHash}-${log.logIndex}`;
      if (seen.current.has(key)) continue;
      seen.current.add(key);
      rows.push({
        key,
        name: log.eventName,
        args: log.args || {},
        blockNumber: log.blockNumber,
        hash: log.transactionHash,
      });
    }
    if (rows.length === 0) return;
    if (live) setLiveCount((n) => n + rows.length);
    setEvents((prev) =>
      [...rows, ...prev]
        .sort((a, b) => Number(b.blockNumber - a.blockNumber))
        .slice(0, MAX_ROWS)
    );
  }, []);

  /**
   * Loads recent history so the page has content immediately rather than sitting empty until
   * the next event happens to fire. Chunked and walked backwards so a node that refuses a
   * wide range still returns everything, one window at a time.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { parseEventLogs } = await import("viem");
        const latest = await publicClient.getBlockNumber();
        const floor = latest > BACKFILL_BLOCKS ? latest - BACKFILL_BLOCKS : 0n;

        let collected = 0;
        let toBlock = latest;

        while (!cancelled && toBlock > floor && collected < BACKFILL_TARGET) {
          const fromBlock = toBlock - CHUNK_BLOCKS > floor ? toBlock - CHUNK_BLOCKS : floor;

          let logs = [];
          try {
            logs = await publicClient.getLogs({
              address: INVOICE_FACTORY_ADDRESS,
              fromBlock,
              toBlock,
            });
          } catch {
            // A node that still refuses this window is skipped rather than aborting the walk,
            // so one bad range cannot empty the whole feed.
            toBlock = fromBlock - 1n;
            continue;
          }

          if (logs.length > 0) {
            const parsed = parseEventLogs({ abi: INVOICE_ABI, logs });
            collected += parsed.length;
            if (!cancelled) add(parsed, false);
          }

          // The first chunk is the one the user waits on, so release the loading state as
          // soon as it lands and let the rest stream in behind it.
          if (!cancelled) setLoading(false);

          if (fromBlock === floor) break;
          toBlock = fromBlock - 1n;
        }
      } catch {
        // The live watcher below still populates the feed if history is unavailable.
      } finally {
        if (!cancelled) {
          setLoading(false);
          setBackfilled(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [publicClient, add]);

  /**
   * A single watcher for every event on the contract, rather than one polling loop per
   * event name.
   */
  useEffect(() => {
    const unwatch = publicClient.watchContractEvent({
      address: INVOICE_FACTORY_ADDRESS,
      abi: INVOICE_ABI,
      onLogs: (logs) => add(logs, true),
      poll: true,
      pollingInterval: 4000,
    });
    return () => unwatch();
  }, [publicClient, add]);

  const visible =
    filter === "all" ? events : events.filter((e) => (GROUPS[filter] || []).includes(e.name));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live activity"
        subtitle="Every event emitted by the contract, backfilled from recent history and then watched in real time."
        action={
          <div className="flex items-center gap-2 text-sm">
            <span className="dot pending-pulse" style={{ background: "var(--color-primary)" }} />
            <span className="text-text-secondary">
              Block <span className="tabular">{blockNumber?.toString() ?? "..."}</span>
            </span>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented items={FILTERS} value={filter} onChange={setFilter} id="activity-filter" />
        <p className="text-xs text-text-secondary">
          {visible.length} event{visible.length === 1 ? "" : "s"}
          {!backfilled && ", loading history"}
          {liveCount > 0 && ` · ${liveCount} since you opened this page`}
        </p>
      </div>

      {loading ? (
        <div className="card divide-border">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-3.5">
              <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16 flex-shrink-0" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <div
            className="w-11 h-11 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
          >
            <Icon name="activity" size={20} />
          </div>
          <p className="font-medium mb-1">
            {events.length === 0 ? "No activity recorded yet" : "No events match this filter"}
          </p>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            {events.length === 0
              ? `Watching ${ACTIVE_NETWORK.label} for contract events. Anything that happens will appear here as it is mined.`
              : "Switch back to All to see everything the contract has emitted."}
          </p>
        </div>
      ) : (
        <div className="card divide-border overflow-hidden">
          <AnimatePresence initial={false}>
            {visible.map((event) => (
              <motion.div
                key={event.key}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <Row event={event} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function Row({ event }) {
  const config = EVENTS[event.name] || { label: event.name, tone: "neutral", icon: "activity" };
  const color = TONE_COLOR[config.tone];
  const args = event.args;

  const invoiceId = args.invoiceId !== undefined ? Number(args.invoiceId) : null;
  const actor = args.buyer || args.seller || args.investor || args.user || null;
  const detail = describe(event.name, args);

  return (
    <div className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-surface-elevated">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--color-surface-elevated)", color }}
      >
        <Icon name={config.icon} size={12} strokeWidth={2.5} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm" style={{ color }}>
            {config.label}
          </span>
          {invoiceId !== null && (
            <Link
              to={`/invoice/${invoiceId}`}
              className="font-mono text-xs hover:underline"
              style={{ color: "var(--color-text-secondary)" }}
            >
              #{invoiceId}
            </Link>
          )}
          {detail && <span className="text-xs text-text-secondary">{detail}</span>}
        </div>
        {actor && (
          <Link
            to={`/profile/${actor}`}
            className="font-mono text-xs text-text-muted hover:text-primary transition-colors"
          >
            {truncateAddress(actor)}
          </Link>
        )}
      </div>

      <a
        href={explorerTxUrl(event.hash)}
        target="_blank"
        rel="noreferrer noopener"
        className="text-xs text-text-muted hover:text-primary transition-colors flex items-center gap-1 flex-shrink-0"
        title={`Block ${event.blockNumber}`}
      >
        <span className="tabular hidden sm:inline">{args.timestamp ? formatTimeOnly(args.timestamp) : ""}</span>
        <Icon name="external" size={11} />
      </a>
    </div>
  );
}

/** The one figure that matters for each event type, rather than every argument. */
function describe(name, args) {
  switch (name) {
    case "InvoiceCreated":
      return <Money value={args.faceValue} />;
    case "InvoicePaidDirect":
    case "InvoiceRepaid":
      return <Money value={args.amount} />;
    case "InvoiceTokenized":
      return `at ${formatBps(args.discountBps)} of face${Number(args.stakedAmount) > 0 ? ", staked" : ""}`;
    case "InvestmentMade":
      return (
        <>
          <Money value={args.amountContributed} /> for {formatBps(args.percentageBps)}
        </>
      );
    case "InvestorClaimed":
    case "SellerClaimed":
    case "StakeReturned":
      return <Money value={args.amount} />;
    case "UsernameClaimed":
      return args.username;
    default:
      return null;
  }
}
