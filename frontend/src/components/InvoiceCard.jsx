import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { formatMoney, relativeDue, truncateAddress } from "../lib/format";
import StatusStepper from "./StatusStepper";
import TrustedBadge from "./TrustedBadge";
import { useFactoryContract } from "../hooks/useInvoiceFactory";
import { ACTIVE_NETWORK } from "../config/network";

function FundingBar({ invoice }) {
  const sold = Number(invoice.totalSoldPercentageBps);
  const pct = sold / 100;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-text-secondary mb-1">
        <span>Funding</span>
        <span className="tabular">{pct.toFixed(0)}% sold</span>
      </div>
      <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function InvoiceCard({ invoice, id }) {
  const c = useFactoryContract();
  const status = Number(invoice.status);

  const buyerName = useQuery({
    queryKey: ["username", invoice.buyer],
    queryFn: () => c.username(invoice.buyer),
    enabled: !!invoice.buyer,
  });

  const buyerCredit = useQuery({
    queryKey: ["credit", invoice.buyer],
    queryFn: async () => {
      const [onTime, late, def] = await Promise.all([
        c.onTimePayments(invoice.buyer),
        c.latePayments(invoice.buyer),
        c.defaultCount(invoice.buyer),
      ]);
      return { onTime: Number(onTime), late: Number(late), def: Number(def) };
    },
    enabled: !!invoice.buyer,
  });

  const trusted =
    !!buyerCredit.data &&
    buyerCredit.data.onTime >= 5 &&
    buyerCredit.data.def === 0;

  const due = relativeDue(invoice.dueDate);

  return (
    <motion.div whileHover={{ y: -2, scale: 1.01 }} transition={{ duration: 0.15, ease: "easeOut" }}>
      <Link
        to={`/invoice/${id}`}
        className="card p-4 block hover:border-primary transition-colors"
      >
        <div className="flex justify-between items-center mb-3">
          <span className="font-mono text-xs text-text-secondary">#{id}</span>
          <StatusStepper invoice={invoice} compact />
        </div>

        <div className="text-2xl font-semibold tabular mb-1">
          ${formatMoney(invoice.faceValue)}
        </div>
        <p className="text-sm text-text-secondary truncate mb-3">{invoice.description || "No description"}</p>

        {(status === 2 || status === 3 || status === 4) && invoice.discountBps > 0 && (
          <FundingBar invoice={invoice} />
        )}

        <div className="flex justify-between items-center mt-4">
          <span
            className="text-xs"
            style={{ color: due.overdue ? "var(--color-danger)" : "var(--color-text-secondary)" }}
          >
            {due.label}
          </span>
          <div className="flex items-center gap-2">
            {trusted && <TrustedBadge small />}
            <span className="font-mono text-xs text-text-secondary">{truncateAddress(invoice.buyer)}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}