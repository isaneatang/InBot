import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CopyButton, Icon, Modal } from "./ui";
import { useNetworkSwitch, useWallet, useWalletConnection } from "../hooks/useNetwork";
import { truncateAddress } from "../lib/format";
import { ACTIVE_NETWORK } from "../config/network";

const NAV_LINKS = [
  { to: "/marketplace", label: "Market", fullLabel: "Marketplace", icon: "store" },
  { to: "/dashboard", label: "Dashboard", fullLabel: "Dashboard", icon: "grid" },
  { to: "/create", label: "Create", fullLabel: "Create", icon: "plus" },
  { to: "/activity", label: "Activity", fullLabel: "Activity", icon: "activity" },
];

/* ------------------------------------------------------------------------- */
/* Connect modal                                                             */
/* ------------------------------------------------------------------------- */

export function ConnectModal({ open, onClose }) {
  const navigate = useNavigate();
  const {
    injectedWallets,
    fallbackInjected,
    hasInjected,
    connectInjected,
    connectMobile,
    pendingId,
    error,
    mobileAvailable,
  } = useWalletConnection();

  const handleInjected = async (connector) => {
    const connected = await connectInjected(connector);
    if (connected) {
      onClose();
      navigate("/dashboard");
    }
  };

  const handleMobile = () => {
    connectMobile();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect wallet" subtitle="Choose how you want to sign transactions">
      <div className="space-y-4">
        {/* Primary path. Listed first because it is the fastest route on desktop. */}
        <section>
          <p className="label mb-2">Browser wallet</p>
          {injectedWallets.length > 0 ? (
            <div className="space-y-1.5">
              {injectedWallets.map((connector) => (
                <button
                  key={connector.uid}
                  type="button"
                  onClick={() => handleInjected(connector)}
                  disabled={!!pendingId}
                  className="panel w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-surface-hover disabled:opacity-50"
                >
                  {connector.icon ? (
                    <img src={connector.icon} alt="" className="w-7 h-7 rounded-md flex-shrink-0" />
                  ) : (
                    <span
                      className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
                    >
                      <Icon name="wallet" size={14} />
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{connector.name}</span>
                    <span className="block text-xs text-text-secondary">Installed in this browser</span>
                  </span>
                  {pendingId === connector.uid ? (
                    <span className="spinner" />
                  ) : (
                    <Icon name="chevronRight" size={14} className="text-text-muted" />
                  )}
                </button>
              ))}
            </div>
          ) : hasInjected ? (
            <button
              type="button"
              onClick={() => handleInjected(fallbackInjected)}
              disabled={!!pendingId}
              className="panel w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              <span
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--color-primary-soft)", color: "var(--color-primary)" }}
              >
                <Icon name="wallet" size={14} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">Injected wallet</span>
                <span className="block text-xs text-text-secondary">Detected in this browser</span>
              </span>
              {pendingId ? <span className="spinner" /> : <Icon name="chevronRight" size={14} className="text-text-muted" />}
            </button>
          ) : (
            <p className="text-sm text-text-secondary panel p-3">
              No browser wallet was detected. Install one, or connect a mobile wallet below.
            </p>
          )}
        </section>

        {/* Secondary path. Reown owns the session, viem still owns every read and write. */}
        <section>
          <p className="label mb-2">Mobile or other wallets</p>
          <button
            type="button"
            onClick={handleMobile}
            disabled={!mobileAvailable}
            className="panel w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-surface-hover disabled:opacity-50"
          >
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--color-surface-hover)", color: "var(--color-text-secondary)" }}
            >
              <Icon name="phone" size={14} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">Scan or deep link</span>
              <span className="block text-xs text-text-secondary">
                {mobileAvailable ? "WalletConnect through Reown AppKit" : "Needs a Reown project id"}
              </span>
            </span>
            <Icon name="chevronRight" size={14} className="text-text-muted" />
          </button>
        </section>

        {error && <p className="field-error">{error}</p>}

        <p className="text-xs text-text-muted leading-relaxed">
          This app runs on {ACTIVE_NETWORK.label}. Your wallet will be asked to add or switch to it
          after connecting. Nothing is ever custodied by this site.
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------- */
/* Network banner                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Persistent gate shown whenever the wallet is on the wrong chain. Read-only browsing keeps
 * working, but every write path checks the same condition and refuses to open the wallet.
 */
export function NetworkBanner() {
  const { isConnected, onCorrectNetwork, chainId } = useWallet();
  const { switchNetwork, isPending, message } = useNetworkSwitch();

  if (!isConnected || onCorrectNetwork) return null;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden"
      style={{
        background: "color-mix(in srgb, var(--color-accent-warn) 9%, var(--color-background))",
        borderBottom: "1px solid color-mix(in srgb, var(--color-accent-warn) 26%, transparent)",
      }}
      role="alert"
    >
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span style={{ color: "var(--color-accent-warn)" }} className="flex-shrink-0">
          <Icon name="alert" size={15} />
        </span>
        <p className="text-sm flex-1 min-w-[14rem]">
          <span className="font-medium" style={{ color: "var(--color-accent-warn)" }}>
            Wrong network.
          </span>{" "}
          <span className="text-text-secondary">
            Your wallet is on chain {chainId ?? "unknown"}. Signing is blocked until you switch to{" "}
            {ACTIVE_NETWORK.label} (chain {ACTIVE_NETWORK.chainId}). Browsing still works.
          </span>
        </p>
        <button className="btn btn-outline btn-sm flex-shrink-0" onClick={switchNetwork} disabled={isPending}>
          {isPending ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
          Switch network
        </button>
        {message && <p className="text-xs text-text-secondary basis-full">{message}</p>}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------------- */
/* Connected wallet pill                                                     */
/* ------------------------------------------------------------------------- */

function WalletPill() {
  const { address, isConnected, onCorrectNetwork, username } = useWallet();
  const { disconnect } = useWalletConnection();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    // pointerdown rather than click, because several wallet in-app browsers swallow the
    // synthetic click that would otherwise close this.
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open]);

  if (!isConnected || !address) return null;

  const items = [
    { label: "My profile", icon: "user", run: () => navigate(`/profile/${address}`) },
    { label: "Settings", icon: "settings", run: () => navigate("/settings") },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full pl-2.5 pr-2 py-1.5 transition-colors"
        style={{
          background: "var(--color-surface)",
          border: `1px solid ${open ? "var(--color-border-strong)" : "var(--color-border)"}`,
        }}
      >
        <span
          className="dot"
          style={{ background: onCorrectNetwork ? "var(--color-primary)" : "var(--color-accent-warn)" }}
          title={onCorrectNetwork ? `Connected to ${ACTIVE_NETWORK.label}` : "Wrong network"}
        />
        <span className={`text-sm max-w-[9rem] truncate ${username ? "" : "font-mono"}`}>
          {username || truncateAddress(address)}
        </span>
        <Icon
          name="chevronDown"
          size={13}
          className="text-text-muted"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="card absolute right-0 mt-2 w-64 p-1.5 z-50"
            style={{ background: "var(--color-surface-elevated)", boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}
          >
            <div className="px-2.5 py-2 mb-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <p className="text-xs text-text-secondary mb-1">
                {onCorrectNetwork ? ACTIVE_NETWORK.label : "Wrong network"}
              </p>
              <p className="font-mono text-xs break-all leading-relaxed">{address}</p>
              <CopyButton value={address} label="Copy address" className="mt-1 -ml-2" />
            </div>

            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  item.run();
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm text-left transition-colors hover:bg-surface-hover"
              >
                <Icon name={item.icon} size={14} className="text-text-muted" />
                {item.label}
              </button>
            ))}

            <div style={{ height: 1, background: "var(--color-border)", margin: "0.25rem 0.5rem" }} />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-sm text-left transition-colors"
              style={{ color: "var(--color-danger)" }}
            >
              <Icon name="logout" size={14} />
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Navbar                                                                    */
/* ------------------------------------------------------------------------- */

export default function Navbar() {
  const { isConnected } = useWallet();
  const [connectOpen, setConnectOpen] = useState(false);
  const location = useLocation();

  const isActive = (to) => location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <>
      <header
        className="sticky top-0 z-40"
        style={{
          background: "color-mix(in srgb, var(--color-background) 88%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid var(--color-border)",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 flex-shrink-0" aria-label="Invoice Ledger home">
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: "var(--color-primary)", color: "#0b0d09" }}
            >
              IL
            </span>
            <span className="font-semibold tracking-tight hidden sm:inline">Invoice Ledger</span>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5 text-sm" aria-label="Main">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-current={isActive(link.to) ? "page" : undefined}
                className="px-3 py-1.5 rounded transition-colors"
                style={{
                  color: isActive(link.to) ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  background: isActive(link.to) ? "var(--color-surface-elevated)" : "transparent",
                  fontWeight: isActive(link.to) ? 500 : 400,
                }}
              >
                {link.fullLabel}
              </Link>
            ))}
            <Link
              to="/docs"
              aria-current={isActive("/docs") ? "page" : undefined}
              className="px-3 py-1.5 rounded transition-colors"
              style={{
                color: isActive("/docs") ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                background: isActive("/docs") ? "var(--color-surface-elevated)" : "transparent",
              }}
            >
              Docs
            </Link>
          </nav>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isConnected ? (
              <WalletPill />
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setConnectOpen(true)}>
                <Icon name="wallet" size={14} />
                Connect
              </button>
            )}
          </div>
        </div>
      </header>

      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />

      {/* Mobile tab bar. Docs live in the footer on small screens to keep five items max. */}
      <nav className="bottom-nav" aria-label="Main">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="bottom-nav-item"
            data-active={isActive(link.to)}
            aria-current={isActive(link.to) ? "page" : undefined}
          >
            <Icon name={link.icon} size={20} strokeWidth={isActive(link.to) ? 2.4 : 2} />
            <span>{link.label}</span>
          </Link>
        ))}
        <Link
          to={isConnected ? "/settings" : "/docs"}
          className="bottom-nav-item"
          data-active={isActive("/settings") || isActive("/docs")}
        >
          <Icon name={isConnected ? "settings" : "inbox"} size={20} />
          <span>{isConnected ? "Account" : "Docs"}</span>
        </Link>
      </nav>
    </>
  );
}
