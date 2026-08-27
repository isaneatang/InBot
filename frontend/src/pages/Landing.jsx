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
      <section className="text-center py-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Turn unpaid invoices into cash.
          </h1>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-8">
            Issue an invoice, confirm it on-chain, and either collect it directly or sell
            fractional shares to investors at a discount. Built natively on BOT Chain.
          </p>

          {!isConnected ? (
            <Link to="/dashboard" className="btn btn-primary px-8 py-3 text-base">
              Get Started
            </Link>
          ) : (
            <Link to="/dashboard" className="btn btn-primary px-8 py-3 text-base">
              Go to Dashboard
            </Link>
          )}

          <div className="mt-6 mx-auto max-w-xl border border-accent-warn rounded-md p-4 text-left text-sm text-text-secondary">
            <span className="font-medium text-accent-warn">Risk disclosure.</span> This is
            experimental testnet software. The contract cannot force a buyer to pay. Defaults
            are possible and are recorded permanently on-chain. There is no regulatory
            protection and no legal recourse provided by the contract. See the{" "}
            <Link to="/docs" className="underline underline-offset-2 hover:text-text-primary">full documentation</Link>.
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/docs" className="btn btn-outline px-8 py-3 text-base">
              Read the Documentation
            </Link>
            <Link to="/marketplace" className="text-sm text-text-secondary underline underline-offset-2 hover:text-text-primary">
              Browse the marketplace
            </Link>
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
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2 }}
              className="card p-4"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold mb-3">
                {s.n}
              </div>
              <h3 className="font-medium mb-1">{s.title}</h3>
              <p className="text-sm text-text-secondary">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}