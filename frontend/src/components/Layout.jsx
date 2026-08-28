import { Link, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import Navbar, { NetworkBanner } from "./Navbar";
import { MOTION } from "./ui";
import { ACTIVE_NETWORK, INVOICE_FACTORY_ADDRESS } from "../config/network";

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-full flex flex-col app-shell">
      <Navbar />
      <NetworkBanner />

      <main className="app-main flex-1 w-full max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={MOTION.page}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mt-8 px-4 py-8" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Invoice Ledger</p>
            <p className="text-xs text-text-secondary mt-1 max-w-md leading-relaxed">
              Experimental software running on {ACTIVE_NETWORK.label}. Not a regulated financial
              service. The contract cannot force a buyer to pay.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-secondary">
            <Link to="/docs" className="hover:text-text-primary transition-colors">
              Documentation
            </Link>
            <Link to="/docs#risk" className="hover:text-text-primary transition-colors">
              Risk disclosure
            </Link>
            <Link to="/marketplace" className="hover:text-text-primary transition-colors">
              Marketplace
            </Link>
            <a
              href={`${ACTIVE_NETWORK.explorerUrl}/address/${INVOICE_FACTORY_ADDRESS}`}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-text-primary transition-colors font-mono"
            >
              Contract
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
