import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import StatusStepper, { StatusChip } from "./StatusStepper";
import TrustedBadge from "./TrustedBadge";
import { FundingMeter, Icon, Money } from "./ui";
import { formatBps, relativeDue } from "../lib/format";

const URGENCY_COLOR = {
  overdue: "var(--color-danger)",
  urgent: "var(--color-accent-warn)",
  soon: "var(--color-text-secondary)",
  calm: "var(--color-text-secondary)",
  none: "var(--color-text-muted)",
};

/**
 * The single invoice card used by the dashboard, marketplace and profile grids.
 *
 * Which counterparty is surfaced depends on why the card is being shown. An investor
 * browsing the marketplace is assessing whether the buyer will pay and whether the seller
 * is credible, so both can be shown. A seller looking at their own list only needs the
 * buyer.
 */
export default function InvoiceCard({
  invoice,
  id,
  counterparty = "buyer",
  profiles = {},
  claimable,
  footnote,
}) {
  const status = Number(invoice.status);
  const wasTokenized = Number(invoice.discountBps) > 0;
  const due = relativeDue(invoice.dueDate);

  const buyerProfile = profiles[invoice.buyer?.toLowerCase()];
  const sellerProfile = profiles[invoice.seller?.toLowerCase()];

  const remainingBps = 10000 - Number(invoice.totalSoldPercentageBps);
  const remainingValue =
    (BigInt(invoice.faceValue) * BigInt(remainingBps) * BigInt(invoice.discountBps || 0n)) / 100000000n;

  const parties = [];
  if (counterparty === "buyer" || counterparty === "both") {
    parties.push({ role: "Buyer", address: invoice.buyer, profile: buyerProfile });
  }
  if (counterparty === "seller" || counterparty === "both") {
    parties.push({ role: "Seller", address: invoice.seller, profile: sellerProfile });
  }

  return (
    <motion.div layout transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}>
      <Link
        to={`/invoice/${id}`}
        className="card card-interactive p-4 flex flex-col h-full"
        aria-label={`Invoice ${id}`}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="font-mono text-xs text-text-muted">#{id}</span>
          <div className="flex items-center gap-2">
            <StatusStepper invoice={invoice} compact />
            <StatusChip status={status} />
          </div>
        </div>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-semibold tracking-tight">
            <Money value={invoice.faceValue} />
          </span>
          {wasTokenized && (
            <span className="chip chip-neutral">{formatBps(invoice.discountBps)} of face</span>
          )}
          {Number(invoice.stakedAmount) > 0 && (
            <span className="chip chip-primary" title="The seller posted a first-loss stake on this invoice">
              <Icon name="coins" size={10} strokeWidth={2.5} />
              Staked
            </span>
          )}
        </div>

        <p className="text-sm text-text-secondary mt-1.5 line-clamp-2 min-h-[2.5rem]">
          {invoice.description || "No description provided"}
        </p>

        {wasTokenized && status === 2 && (
          <div className="mt-3">
            <FundingMeter soldBps={invoice.totalSoldPercentageBps} remaining={remainingValue} />
          </div>
        )}
        {wasTokenized && status !== 2 && (
          <div className="mt-3">
            <FundingMeter soldBps={invoice.totalSoldPercentageBps} label="Sold to investors" />
          </div>
        )}

        {claimable !== undefined && claimable > 0n && (
          <div
            className="mt-3 panel px-3 py-2 flex items-center justify-between"
            style={{ borderColor: "color-mix(in srgb, var(--color-primary) 30%, transparent)" }}
          >
            <span className="text-xs text-text-secondary">Claimable now</span>
            <span className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
              <Money value={claimable} />
            </span>
          </div>
        )}

        <div className="mt-auto pt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: URGENCY_COLOR[due.urgency] }}>
              <Icon name={due.overdue ? "alert" : "clock"} size={11} />
              <span className="truncate">{due.label}</span>
            </div>
            {footnote && <p className="text-xs text-text-muted mt-1 truncate">{footnote}</p>}
          </div>

          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {parties.map((p) => (
              <div key={p.role} className="flex items-center gap-1.5">
                {p.profile?.trusted && <TrustedBadge small asLink={false} />}
                <span className="text-xs text-text-muted">{p.role}</span>
                <span className={`text-xs ${p.profile?.username ? "" : "font-mono"} text-text-secondary`}>
                  {p.profile?.username || `${p.address.slice(0, 6)}...${p.address.slice(-4)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
