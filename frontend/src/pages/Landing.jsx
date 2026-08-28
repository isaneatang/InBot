import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Callout, Icon, Money } from "../components/ui";
import { useWallet } from "../hooks/useNetwork";
import { useAllInvoices } from "../hooks/useInvoices";
import { ACTIVE_NETWORK, PLATFORM_FEE_BPS } from "../config/network";

const STEPS = [
  {
    n: 1,
    title: "Create",
    icon: "plus",
    body: "A seller issues an invoice on-chain to a buyer's wallet address, stating the amount and what the work was.",
  },
  {
    n: 2,
    title: "Confirm",
    icon: "check",
    body: "The buyer reviews it and confirms, choosing their own repayment due date. Nothing is payable until they do.",
  },
  {
    n: 3,
    title: "Pay or tokenize",
    icon: "layers",
    body: "The buyer can pay in full, or the seller can sell fractional shares to investors at a discount for cash now.",
  },
  {
    n: 4,
    title: "Repay and distribute",
    icon: "arrowDown",
    body: "On repayment each investor and the seller claims their proportional share. Nothing is pushed, everything is pulled.",
  },
];

export default function Landing() {
  const { isConnected } = useWallet();
  const { data: invoices } = useAllInvoices();

  const stats = useQuery({
    queryKey: ["landingStats", invoices?.length ?? 0],
    enabled: !!invoices,
    queryFn: () => {
      const book = invoices || [];
      const open = book.filter((inv) => inv.status === 2 && Number(inv.totalSoldPercentageBps) < 10000);
      const settled = book.filter((inv) => inv.status === 3);
      const available = open.reduce((acc, inv) => {
        const remaining = BigInt(10000 - Number(inv.totalSoldPercentageBps));
        return acc + (BigInt(inv.faceValue) * remaining * BigInt(inv.discountBps)) / 100000000n;
      }, 0n);
      const settledValue = settled.reduce((acc, inv) => acc + BigInt(inv.faceValue), 0n);
      return { total: book.length, open: open.length, available, settledValue };
    },
  });

  return (
    <div className="space-y-16 sm:space-y-24">
      {/* Hero */}
      <section className="pt-6 sm:pt-14 text-center max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="chip chip-primary mb-6">
            <span className="dot" />
            Running on {ACTIVE_NETWORK.label}
          </span>

          <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight leading-[1.1] mb-5">
            Get paid for an invoice
            <br />
            before the buyer does.
          </h1>

          <p className="text-base sm:text-lg text-text-secondary leading-relaxed max-w-2xl mx-auto mb-8">
            Issue an invoice on-chain. Once the buyer confirms it, either wait to be paid or sell
            fractional shares of it to investors at a discount and take the cash today.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link to={isConnected ? "/dashboard" : "/marketplace"} className="btn btn-primary btn-lg">
              {isConnected ? "Go to your dashboard" : "Browse open invoices"}
              <Icon name="chevronRight" size={15} />
            </Link>
            <Link to="/docs" className="btn btn-outline btn-lg">
              Read the documentation
            </Link>
          </div>

          {/* Risk sits next to the primary call to action, not hidden in the footer. */}
          <div className="mt-8 text-left max-w-xl mx-auto">
            <Callout tone="warn" title="Read this before you commit funds">
              This is experimental software. The contract cannot force a buyer to pay. Defaults are
              possible and are recorded permanently on-chain. There is no regulatory protection and no
              legal recourse provided by the contract itself.{" "}
              <Link to="/docs#risk" className="underline underline-offset-2 hover:text-text-primary">
                Full risk disclosure
              </Link>
              .
            </Callout>
          </div>
        </motion.div>
      </section>

      {/* Live figures, so the landing page is not making claims the chain cannot back. */}
      {stats.data && stats.data.total > 0 && (
        <section className="card divide-y sm:divide-y-0 sm:grid sm:grid-cols-4" style={{ borderColor: "var(--color-border)" }}>
          {[
            { label: "Invoices issued", value: stats.data.total },
            { label: "Open for investment", value: stats.data.open },
            { label: "Still to be funded", value: <Money value={stats.data.available} /> },
            { label: "Repaid in full", value: <Money value={stats.data.settledValue} /> },
          ].map((cell, i) => (
            <div
              key={cell.label}
              className="p-5"
              style={i > 0 ? { borderLeft: "1px solid var(--color-border)" } : undefined}
            >
              <div className="text-xl font-semibold tabular">{cell.value}</div>
              <div className="stat-label">{cell.label}</div>
            </div>
          ))}
        </section>
      )}

      {/* How it works */}
      <section>
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold tracking-tight mb-2">How it works</h2>
          <p className="text-text-secondary max-w-xl mx-auto">
            Four steps, all on-chain. One address can be a seller, a buyer and an investor at the same
            time.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.25, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="card p-5"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                >
                  <Icon name={step.icon} size={14} />
                </span>
                <span className="text-xs tabular text-text-muted">Step {step.n}</span>
              </div>
              <h3 className="font-medium mb-1.5">{step.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{step.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Three roles */}
      <section>
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold tracking-tight mb-2">What each side gets</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              role: "Sellers",
              icon: "trend",
              points: [
                "Turn a confirmed invoice into cash before its due date",
                "Set the discount yourself, between 50 and 99 percent of face",
                "Optionally stake your own USDT to signal confidence in your buyer",
              ],
              cta: { to: "/create", label: "Create an invoice" },
            },
            {
              role: "Buyers",
              icon: "check",
              points: [
                "You choose the due date, not the seller",
                "Paying on time builds a permanent public credit record",
                "Five on-time repayments and no defaults earns the Trusted badge",
              ],
              cta: { to: "/dashboard", label: "See invoices addressed to you" },
            },
            {
              role: "Investors",
              icon: "coins",
              points: [
                "Buy a share of an invoice below its face value",
                "Your return is the gap between what you pay and what is repaid",
                "Price the default risk using the buyer's public record and the seller's stake",
              ],
              cta: { to: "/marketplace", label: "Browse the marketplace" },
            },
          ].map((card) => (
            <div key={card.role} className="card p-5 flex flex-col">
              <div className="flex items-center gap-2.5 mb-4">
                <span
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                >
                  <Icon name={card.icon} size={14} />
                </span>
                <h3 className="font-semibold">{card.role}</h3>
              </div>
              <ul className="space-y-2.5 mb-6 flex-1">
                {card.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm text-text-secondary leading-relaxed">
                    <span style={{ color: "var(--color-primary)" }} className="flex-shrink-0 mt-1">
                      <Icon name="check" size={12} strokeWidth={2.5} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <Link to={card.cta.to} className="btn btn-outline btn-sm mt-auto">
                {card.cta.label}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Design commitments. These are properties of the contract, not marketing claims. */}
      <section className="card p-6 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight mb-2">What the contract will not do</h2>
        <p className="text-sm text-text-secondary mb-6 max-w-2xl leading-relaxed">
          These are properties of the deployed bytecode, not policies that could be changed later.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          {[
            ["No owner or admin", "There is no owner, no admin role and no pause function anywhere in the contract."],
            ["No changeable fee", `The ${(PLATFORM_FEE_BPS / 100).toFixed(1)} percent fee and its recipient are immutable after deployment.`],
            ["No manual Trusted badge", "The badge is a mechanical result of repayment history. Nobody can grant or revoke it."],
            ["No hidden reputation", "Credit history is tied to a wallet address, not a username, so a new name hides nothing."],
            ["No forced repayment", "No contract can compel payment in the physical world. This one does not pretend otherwise."],
            ["No custody", "The contract holds funds only between settlement and each rightful party claiming them."],
          ].map(([title, body]) => (
            <div key={title} className="flex gap-3">
              <span style={{ color: "var(--color-primary)" }} className="flex-shrink-0 mt-0.5">
                <Icon name="check" size={14} strokeWidth={2.5} />
              </span>
              <div>
                <p className="text-sm font-medium mb-0.5">{title}</p>
                <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="text-center pb-6">
        <h2 className="text-2xl font-semibold tracking-tight mb-3">Understand it before you use it</h2>
        <p className="text-text-secondary max-w-xl mx-auto mb-7 leading-relaxed">
          The documentation covers the fee structure, first-loss staking and the Trusted badge with
          worked numeric examples, plus the full risk disclosure.
        </p>
        <Link to="/docs" className="btn btn-primary btn-lg">
          Read the documentation
        </Link>
      </section>
    </div>
  );
}
