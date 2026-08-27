import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { useAppKit } from "@reown/appkit/react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { truncateAddress } from "../lib/format";
import { useFactoryContract } from "../hooks/useInvoiceFactory";
import { useQuery } from "@tanstack/react-query";
import { ACTIVE_NETWORK } from "../config/network";

export function useWalletStatus() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const c = useFactoryContract();
  const username = useQuery({
    queryKey: ["username", address],
    queryFn: () => c.username(address),
    enabled: !!address && isConnected,
  });
  return {
    address,
    isConnected,
    chainId,
    onCorrectNetwork: chainId === ACTIVE_NETWORK.chainId,
    username: username.data || "",
  };
}

export function ConnectModal({ open, onClose }) {
  const { connect } = useConnect();
  const { open: openAppKit } = useAppKit();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const connectBrowser = async () => {
    setBusy(true);
    try {
      connect({ connector: injected() });
      navigate("/dashboard");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const connectMobile = () => {
    openAppKit();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)" }}
      onPointerDown={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="w-full max-w-md p-6"
        style={{
          background: "linear-gradient(160deg, #1a1e18 0%, #111310 60%, #0d0f0b 100%)",
          border: "1px solid #252a22",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-lg font-semibold">Connect Wallet</h2>
            <p className="text-xs text-text-secondary mt-0.5">Choose your connection method</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div
          className="rounded-xl p-4 mb-3 cursor-pointer transition-all"
          style={{
            background: "linear-gradient(135deg, rgba(92,184,112,0.08) 0%, rgba(92,184,112,0.02) 100%)",
            border: "1px solid rgba(92,184,112,0.2)",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            connectBrowser();
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(92,184,112,0.15)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M2 10h20" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-sm">Browser Wallet</div>
              <div className="text-xs text-text-secondary">MetaMask, OKX, Rabby, etc.</div>
            </div>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Uses the wallet extension installed in your browser. Fastest connection.
          </p>
          <button className="btn btn-primary w-full py-2.5 text-sm" disabled={busy}>
            {busy ? "Connecting..." : "Connect Browser Wallet"}
          </button>
        </div>

        <div
          className="rounded-xl p-4 cursor-pointer transition-all"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--color-border)",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            connectMobile();
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
            </div>
            <div>
              <div className="font-medium text-sm">Mobile Wallet</div>
              <div className="text-xs text-text-secondary">WalletConnect & AppKit</div>
            </div>
          </div>
          <p className="text-xs text-text-secondary mb-3">
            Scan a QR code or deep-link from a mobile wallet app.
          </p>
          <button className="btn btn-outline w-full py-2.5 text-sm">
            Connect with Mobile Wallet
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function NetworkBanner() {
  const { onCorrectNetwork, chainId } = useWalletStatus();
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState("");

  const addNetwork = async () => {
    setAdding(true);
    setStatus("");
    try {
      const provider = window.ethereum;
      if (!provider) {
        setStatus("No injected wallet detected. Install a browser wallet to add the network.");
        return;
      }
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${ACTIVE_NETWORK.chainId.toString(16)}` }],
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: `0x${ACTIVE_NETWORK.chainId.toString(16)}`,
                chainName: ACTIVE_NETWORK.chain.name,
                nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
                rpcUrls: [ACTIVE_NETWORK.rpcUrl],
                blockExplorerUrls: [ACTIVE_NETWORK.explorerUrl],
              },
            ],
          });
        } else {
          throw switchErr;
        }
      }
      setStatus("Network added or switched. If it did not change automatically, select it in your wallet.");
    } catch (e) {
      setStatus("Could not switch network. Please add or switch manually in your wallet.");
    } finally {
      setAdding(false);
    }
  };

  if (onCorrectNetwork) return null;

  return (
    <div className="border-b px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" style={{ background: "rgba(212, 168, 67, 0.08)", borderColor: "rgba(212, 168, 67, 0.2)" }}>
      <div className="flex-1">
        <span className="font-medium" style={{ color: "var(--color-accent-warn)" }}>Wrong network.</span>{" "}
        <span className="text-text-secondary">
          You are on chain {chainId ?? "unknown"}. This platform runs on {ACTIVE_NETWORK.label} (chain {ACTIVE_NETWORK.chainId}).
          Write actions are blocked until you switch. Browsing is still allowed.
        </span>
      </div>
      <button className="btn btn-outline btn-sm text-xs" onClick={addNetwork} disabled={adding}>
        {adding ? "Adding..." : `Switch to ${ACTIVE_NETWORK.label}`}
      </button>
      {status && <div className="text-xs text-text-secondary">{status}</div>}
    </div>
  );
}

export function WalletPill() {
  const { address, isConnected, onCorrectNetwork, username } = useWalletStatus();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  // Close dropdown on outside pointer down (works on all wallets/browsers)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    // Use pointerdown for broader wallet browser compatibility
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open]);

  if (!isConnected || !address) return null;

  const display = username || truncateAddress(address);

  return (
    <div className="relative" ref={ref}>
      <button
        onPointerDown={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-all"
        style={{
          background: "linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-elevated) 100%)",
          border: "1px solid var(--color-border)",
          boxShadow: open ? "0 0 0 2px rgba(92,184,112,0.2)" : "0 1px 3px rgba(0,0,0,0.2)",
        }}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: onCorrectNetwork ? "#5cb870" : "#d4a843",
            boxShadow: onCorrectNetwork ? "0 0 6px rgba(92,184,112,0.5)" : "0 0 6px rgba(212,168,67,0.5)",
          }}
          title={onCorrectNetwork ? "Connected to correct network" : "Wrong network"}
        />
        <span className="text-sm tabular">{display}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 150ms ease-out" }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 mt-2 w-56 z-50 p-1.5"
            style={{
              background: "linear-gradient(160deg, #1a1e18 0%, #111310 100%)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
              style={{ color: "var(--color-text-primary)" }}
              onPointerEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onPointerLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onPointerDown={() => {
                navigate(`/profile/${address}`);
                setOpen(false);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              View Profile
            </button>
            <button
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
              style={{ color: "var(--color-text-primary)" }}
              onPointerEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
              onPointerLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onPointerDown={() => {
                navigator.clipboard.writeText(address);
                setOpen(false);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy Address
            </button>
            <div style={{ height: "1px", background: "var(--color-border)", margin: "4px 8px" }} />
            <button
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
              style={{ color: "var(--color-danger)" }}
              onPointerEnter={(e) => (e.currentTarget.style.background = "rgba(212,76,68,0.08)")}
              onPointerLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onPointerDown={() => {
                disconnect();
                setOpen(false);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar() {
  const { isConnected } = useAccount();
  const [connectOpen, setConnectOpen] = useState(false);
  const location = useLocation();

  const navLinks = [
    { to: "/marketplace", label: "Marketplace", icon: "M3 3h18v18H3zM3 9h18M9 21V9" },
    { to: "/dashboard", label: "Dashboard", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
    { to: "/create", label: "Create", icon: "M12 5v14M5 12h14" },
    { to: "/activity", label: "Activity", icon: "M22 12h-4l-3 9L9 3l-3 9H2" },
  ];

  return (
    <>
      <header
        className="sticky top-0 z-40"
        style={{
          background: "rgba(10, 12, 8, 0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm"
              style={{
                background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-strong) 100%)",
                color: "#0a0c08",
                boxShadow: "0 2px 8px rgba(92,184,112,0.3)",
              }}
            >
              IL
            </div>
            <span className="font-semibold tracking-tight hidden sm:inline">Invoice Ledger</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="px-3 py-2 rounded-lg transition-colors"
                style={{
                  color: location.pathname === l.to ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  background: location.pathname === l.to ? "rgba(92,184,112,0.08)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (location.pathname !== l.to) e.currentTarget.style.color = "var(--color-text-primary)";
                }}
                onMouseLeave={(e) => {
                  if (location.pathname !== l.to) e.currentTarget.style.color = "var(--color-text-secondary)";
                }}
              >
                {l.label}
              </Link>
            ))}
            {isConnected && (
              <Link
                to="/settings"
                className="px-3 py-2 rounded-lg text-text-secondary transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-secondary)")}
              >
                Settings
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <WalletPill />
            {!isConnected && (
              <button className="btn btn-primary px-4 py-2 text-sm" onPointerDown={() => setConnectOpen(true)}>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>
      {createPortal(<ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />, document.body)}

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav">
        {navLinks.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={location.pathname === l.to ? "active" : ""}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={l.icon} />
            </svg>
            <span>{l.label}</span>
          </Link>
        ))}
        {isConnected && (
          <Link
            to="/settings"
            className={location.pathname === "/settings" ? "active" : ""}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            <span>Settings</span>
          </Link>
        )}
      </nav>
    </>
  );
}
