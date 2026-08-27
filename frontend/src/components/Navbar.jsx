import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { useAppKit } from "@reown/appkit/react";
import { Link, useNavigate } from "react-router-dom";
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
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Connect Wallet</h2>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">x</button>
        </div>

        <div className="border border-border rounded-md mb-4 p-4">
          <div className="label mb-2">Browser Wallet</div>
          <p className="text-sm text-text-secondary mb-3">
            Fastest for desktop. Uses the wallet extension installed in your browser.
          </p>
          <button className="btn btn-primary w-full" onClick={connectBrowser} disabled={busy}>
            {busy ? "Connecting..." : "Connect Browser Wallet"}
          </button>
        </div>

        <div className="border border-border rounded-md p-4">
          <div className="label mb-2">Mobile or Other Wallets</div>
          <p className="text-sm text-text-secondary mb-3">
            Use WalletConnect to pair with a mobile wallet via QR code or deep link.
          </p>
          <button className="btn btn-outline w-full" onClick={connectMobile}>
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
    <div className="bg-accent-warn/15 border-b border-accent-warn px-4 py-2 text-sm flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1">
        <span className="font-medium text-accent-warn">Wrong network.</span>{" "}
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

  if (!isConnected || !address) return null;

  const display = username || truncateAddress(address);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-surface-elevated px-3 py-1.5 hover:border-primary transition-colors"
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: onCorrectNetwork ? "#4d7a52" : "#c9a227" }}
          title={onCorrectNetwork ? "Connected to correct network" : "Wrong network"}
        />
        <span className="text-sm tabular">{display}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 mt-2 w-52 card p-2 z-50"
          >
            <button
              className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-elevated text-sm"
              onClick={() => {
                navigate(`/profile/${address}`);
                setOpen(false);
              }}
            >
              View Profile
            </button>
            <button
              className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-elevated text-sm"
              onClick={() => {
                navigator.clipboard.writeText(address);
                setOpen(false);
              }}
            >
              Copy Address
            </button>
            <button
              className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-elevated text-sm text-danger"
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
            >
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

  return (
    <header className="border-b border-border sticky top-0 z-40 bg-background/90 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center text-background font-bold">IL</div>
          <span className="font-semibold tracking-tight">Invoice Ledger</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-text-secondary">
          <Link to="/marketplace" className="hover:text-text-primary transition-colors">Marketplace</Link>
          <Link to="/dashboard" className="hover:text-text-primary transition-colors">Dashboard</Link>
          <Link to="/create" className="hover:text-text-primary transition-colors">Create Invoice</Link>
          <Link to="/activity" className="hover:text-text-primary transition-colors">Live Activity</Link>
          <Link to="/docs" className="hover:text-text-primary transition-colors">Documentation</Link>
        </nav>

        <div className="flex items-center gap-2">
          {isConnected && (
            <Link to="/settings" className="hidden sm:inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Settings
            </Link>
          )}
          <WalletPill />
          {!isConnected && (
            <button className="btn btn-primary px-4 py-2 text-sm" onClick={() => setConnectOpen(true)}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>
      <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </header>
  );
}