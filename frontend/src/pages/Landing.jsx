import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";

const STEPS = [
  { n: 1, title: "Create", desc: "A seller issues an on-chain invoice to a buyer, stating the amount and the work." },
  { n: 2, title: "Confirm", desc: "The buyer reviews and confirms the invoice, setting their own repayment due date." },
  { n: 3, title: "Pay or Tokenize", desc: "The buyer pays directly, or the seller sells fractional shares to investors at a discount." },
  { n: 4, title: "Repay & Distribute", desc: "On repayment, funds are distributed proportionally to investors and the seller, automatically." },
];

export default function Landing() {
  const { isConnected } = useAccount();

  return (
    <div className="max-w-4xl mx-auto">
      <section className="text-center py-12 md:py-20">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6" style={{
            background: "rgba(92,184,112,0.1)",
            border: "1px solid rgba(92,184,112,0.2)",
            color: "var(--color-primary)",
          }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-primary)" }} />
            Built on BOT Chain
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-tight">
            Turn unpaid invoices
            <br />
            <span style={{ color: "var(--color-primary)" }}>into cash.</span>
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-8 leading-relaxed">
            Issue an invoice, confirm it on-chain, and either collect it directly or sell
            fractional shares to investors at a discount. Built natively on BOT Chain.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {!isConnected ? (
              <Link to="/dashboard" className="btn btn-primary px-8 py-3 text-base">
                Get Started
              </Link>
            ) : (
              <Link to="/dashboard" className="btn btn-primary px-8 py-3 text-base">
                Go to Dashboard
              </Link>
            )}
            <Link to="/docs" className="btn btn-outline px-8 py-3 text-base">
              Read Documentation
            </Link>
          </div>

          <div className="mt-8 mx-auto max-w-xl rounded-xl p-4 text-left text-sm" style={{
            background: "rgba(212,168,67,0.06)",
            border: "1px solid rgba(212,168,67,0.2)",
          }}>
            <span className="font-medium" style={{ color: "var(--color-accent-warn)" }}>Risk disclosure.</span>{" "}
            <span className="text-text-secondary">
              This is experimental testnet software. The contract cannot force a buyer to pay. Defaults
              are possible and are recorded permanently on-chain. There is no regulatory
              protection and no legal recourse provided by the contract. See the{" "}
            </span>
            <Link to="/docs" className="underline underline-offset-2 hover:text-text-primary">full documentation</Link>.
          </div>
        </motion.div>
      </section>

      <section className="py-8">
        <div className="card p-6 mb-8 text-center">
          <h2 className="text-xl font-semibold mb-2">Not sure how this works?</h2>
          <p className="text-text-secondary mb-4 max-w-2xl mx-auto">
            Understand fees, first-loss staking, the Trusted badge, and the full risk
            disclosure before you commit funds.
          </p>
          <Link to="/docs" className="btn btn-outline px-6 py-2.5">
            Understand the platform first
          </Link>
        </div>

        <h2 className="text-xl font-semibold mb-6 text-center">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25 }}
              className="card p-5"
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center font-semibold mb-3 text-sm"
                style={{
                  background: "rgba(92,184,112,0.12)",
                  color: "var(--color-primary)",
                }}
              >
                {s.n}
              </div>
              <h3 className="font-medium mb-1">{s.title}</h3>
              <p className="text-sm text-text-secondary leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
