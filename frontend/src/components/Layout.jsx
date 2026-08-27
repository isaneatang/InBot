import { Outlet, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import Navbar, { NetworkBanner } from "./Navbar";

export default function Layout() {
  const location = useLocation();
  return (
    <div className="min-h-full flex flex-col">
      <Navbar />
      <NetworkBanner />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <Outlet />
        </motion.div>
      </main>
      <footer className="py-8 px-4 mt-8" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between gap-4 text-xs text-text-secondary">
          <p>Invoice Ledger. Experimental testnet software. This is not a regulated financial service.</p>
          <Link to="/docs" className="underline underline-offset-2 hover:text-text-primary transition-colors">Read the Risk Disclosure</Link>
        </div>
      </footer>
    </div>
  );
}
