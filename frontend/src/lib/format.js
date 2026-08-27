import { USDT_DECIMALS } from "../config/network";

export function formatUnits(value, decimals = USDT_DECIMALS) {
  if (value === undefined || value === null) return "0";
  const v = BigInt(value);
  const factor = 10n ** BigInt(decimals);
  const whole = v / factor;
  const frac = v % factor;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

export function formatMoney(value, decimals = USDT_DECIMALS) {
  const s = formatUnits(value, decimals);
  const [w, f] = s.split(".");
  const grouped = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f ? `${grouped}.${f}` : grouped;
}

export function parseUnits(str, decimals = USDT_DECIMALS) {
  if (!str) return 0n;
  const clean = String(str).trim();
  if (!/^\d*\.?\d*$/.test(clean) || clean === "" || clean === ".") return 0n;
  const factor = 10n ** BigInt(decimals);
  const [w, f = ""] = clean.split(".");
  const padded = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(w || "0") * factor + BigInt(padded || "0");
}

export function truncateAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDate(ts) {
  if (!ts) return "-";
  return new Date(Number(ts) * 1000).toLocaleString();
}

export function relativeDue(dueTs, nowTs) {
  const now = Number(nowTs ?? Math.floor(Date.now() / 1000));
  const due = Number(dueTs);
  const diff = due - now;
  if (diff <= 0) {
    const over = Math.abs(diff);
    const days = Math.floor(over / 86400);
    return { label: days > 0 ? `Overdue by ${days} day${days === 1 ? "" : "s"}` : "Overdue", overdue: true };
  }
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return { label: `${days} day${days === 1 ? "" : "s"} remaining`, overdue: false };
  return { label: `${hours} hour${hours === 1 ? "" : "s"} remaining`, overdue: false };
}

export function explorerTxUrl(hash) {
  return `${ACTIVE_NETWORK_EXPLORER}/tx/${hash}`;
}

export function explorerAddressUrl(addr) {
  return `${ACTIVE_NETWORK_EXPLORER}/address/${addr}`;
}

import { ACTIVE_NETWORK as ACTIVE_NETWORK_EXPLORER_SRC } from "../config/network";
const ACTIVE_NETWORK_EXPLORER = ACTIVE_NETWORK_EXPLORER_SRC.explorerUrl;