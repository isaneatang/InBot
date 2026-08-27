import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useFactoryContract, INVOICE_ABI } from "../hooks/useInvoiceFactory";
import { useToast } from "../components/Toast";
import { INVOICE_FACTORY_ADDRESS, USERNAME_FEE_WEI } from "../config/network";

export default function Settings() {
  const { address, isConnected } = useAccount();
  const c = useFactoryContract();
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const profile = useQuery({
    queryKey: ["settingsProfile", address],
    queryFn: async () => {
      const [name, onTime, late, def] = await Promise.all([c.username(address), c.onTimePayments(address), c.latePayments(address), c.defaultCount(address)]);
      return { name, onTime: Number(onTime), late: Number(late), def: Number(def) };
    },
    enabled: !!address && isConnected,
  });

  if (!isConnected || !address) {
    return <div className="card max-w-md mx-auto p-8 text-center"><p>Connect your wallet to manage your profile.</p></div>;
  }

  const hasUsername = profile.data?.name?.length > 0;
  const usernameValid = username.length >= 1 && username.length <= 32 && /^[a-zA-Z0-9_.-]+$/.test(username);

  const claim = async () => {
    setBusy(true);
    try {
      // Check the user has enough USDT before we bother with approvals.
      const bal = await c.usdtBalance(address);
      if (bal < USERNAME_FEE_WEI) {
        toast.push("You need at least 1 USDT to claim a username.", "error");
        setBusy(false);
        return;
      }

      await c.ensureApproval(USERNAME_FEE_WEI);
      await c.writeContractWithRetry({ address: INVOICE_FACTORY_ADDRESS, abi: INVOICE_ABI, functionName: "claimUsername", args: [username] });
      toast.push("Username claimed", "success");
      profile.refetch();
      setUsername("");
    } catch (e) {
      toast.push(e?.message || e?.shortMessage || "Claim failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Your Profile & Settings</h1>

      <div className="card p-6">
        <h2 className="font-medium mb-3">Username</h2>
        {hasUsername ? (
          <p className="text-sm text-text-secondary">Your username is <span className="font-semibold text-text-primary">{profile.data.name}</span>. Usernames are permanent and one per address.</p>
        ) : (
          <>
            <p className="text-sm text-text-secondary mb-3">Claim a public username (1 to 32 characters) for a one-time fee of 1 USDT. It discourages squatting, but note your credit history stays tied to your wallet address and cannot be hidden by a new username.</p>
            <div className="flex gap-2">
              <input className="input font-mono max-w-xs" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" maxLength={32} />
              <button className="btn btn-primary px-4 py-2" disabled={!usernameValid || busy} onClick={claim}>
                {busy ? "Claiming..." : "Claim Username"}
              </button>
            </div>
            {!usernameValid && username && <p className="text-xs mt-1" style={{ color: "var(--color-danger)" }}>Use 1 to 32 letters, numbers, underscores, dots or hyphens.</p>}
          </>
        )}
      </div>

      <div className="card p-6">
        <h2 className="font-medium mb-3">Your credit history</h2>
        <p className="text-sm text-text-secondary mb-4">Credit history is permanently tied to this wallet address. It cannot be altered or hidden by anyone, including you.</p>
        {profile.data ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl p-4" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}><div className="text-2xl font-semibold tabular">{profile.data.onTime}</div><div className="text-xs text-text-secondary">On-time</div></div>
            <div className="rounded-xl p-4" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}><div className="text-2xl font-semibold tabular">{profile.data.late}</div><div className="text-xs text-text-secondary">Late</div></div>
            <div className="rounded-xl p-4" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}><div className="text-2xl font-semibold tabular" style={{ color: profile.data.def > 0 ? "var(--color-danger)" : "inherit" }}>{profile.data.def}</div><div className="text-xs text-text-secondary">Defaults</div></div>
          </div>
        ) : <div className="h-20 rounded-xl" style={{ background: "var(--color-surface-elevated)" }} />}
        <Link to={`/profile/${address}`} className="btn btn-outline mt-4 px-4 py-2 text-sm">View public profile</Link>
      </div>
    </div>
  );
}
