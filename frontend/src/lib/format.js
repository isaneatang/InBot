import { ACTIVE_NETWORK, USDT_DECIMALS } from "../config/network";

export function formatUnits(value, decimals = USDT_DECIMALS) {
  if (value === undefined || value === null) return "0";
  const v = BigInt(value);
  const negative = v < 0n;
  const abs = negative ? -v : v;
  const factor = 10n ** BigInt(decimals);
  const whole = abs / factor;
  const frac = (abs % factor).toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${body}` : body;
}

function group(whole) {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatMoney(value, decimals = USDT_DECIMALS) {
  const [w, f] = formatUnits(value, decimals).split(".");
  const negative = w.startsWith("-");
  const grouped = group(negative ? w.slice(1) : w);
  const body = f ? `${grouped}.${f}` : grouped;
  return negative ? `-${body}` : body;
}

/**
 * Money with exactly two decimal places, for figures shown in a column next to each other.
 */
export function formatMoneyFixed(value, decimals = USDT_DECIMALS) {
  if (value === undefined || value === null) return "0.00";
  const v = BigInt(value);
  const factor = 10n ** BigInt(decimals);
  const whole = v / factor;
  const cents = ((v % factor) / 10n ** BigInt(decimals - 2)).toString().padStart(2, "0");
  return `${group(whole.toString())}.${cents}`;
}

/**
 * Shortens large figures for headline stats, keeping full precision available elsewhere.
 */
export function formatCompact(value, decimals = USDT_DECIMALS) {
  const asNumber = Number(formatUnits(value, decimals));
  if (!isFinite(asNumber)) return "0";
  if (Math.abs(asNumber) >= 1_000_000) return `${(asNumber / 1_000_000).toFixed(2)}M`;
  if (Math.abs(asNumber) >= 10_000) return `${(asNumber / 1000).toFixed(1)}K`;
  return formatMoneyFixed(value, decimals);
}

export function parseUnits(str, decimals = USDT_DECIMALS) {
  if (str === undefined || str === null) return 0n;
  const clean = String(str).trim();
  if (clean === "" || clean === "." || !/^\d*\.?\d*$/.test(clean)) return 0n;
  const factor = 10n ** BigInt(decimals);
  const [w, f = ""] = clean.split(".");
  const padded = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(w || "0") * factor + BigInt(padded || "0");
}

export function truncateAddress(address, lead = 6, tail = 4) {
  if (!address) return "";
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

/** Prefers a claimed username, falling back to a truncated address. */
export function displayName(address, username) {
  if (username && username.length > 0) return username;
  return truncateAddress(address);
}

export function formatBps(bps) {
  const n = Number(bps ?? 0);
  return n % 100 === 0 ? `${n / 100}%` : `${(n / 100).toFixed(2)}%`;
}

export function formatDate(ts) {
  if (!ts || Number(ts) === 0) return "Not set";
  return new Date(Number(ts) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(ts) {
  if (!ts || Number(ts) === 0) return "Not set";
  return new Date(Number(ts) * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeOnly(ts) {
  if (!ts || Number(ts) === 0) return "";
  return new Date(Number(ts) * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** The unix timestamp for the start of the day, offsetDays from today, in local time. */
export function dayOffsetTimestamp(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(23, 59, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/** Formats a unix timestamp for a date input's value attribute. */
export function toDateInputValue(ts) {
  const d = new Date(Number(ts) * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Reads a date input value as the last minute of that local day. */
export function fromDateInputValue(value) {
  if (!value) return 0;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Math.floor(new Date(y, m - 1, d, 23, 59, 0, 0).getTime() / 1000);
}

/**
 * A relative due-date description. Returns the pieces separately so a caller can render a
 * text label, an urgency level, and a full countdown without recomputing any of it.
 */
export function relativeDue(dueTs, nowTs) {
  const now = Number(nowTs ?? Math.floor(Date.now() / 1000));
  const due = Number(dueTs ?? 0);

  if (due === 0) {
    return { label: "No due date yet", overdue: false, urgency: "none", seconds: 0, parts: null };
  }

  const diff = due - now;

  if (diff <= 0) {
    const over = Math.abs(diff);
    const days = Math.floor(over / 86400);
    const hours = Math.floor((over % 86400) / 3600);
    let label = "Overdue";
    if (days > 0) label = `Overdue by ${days} day${days === 1 ? "" : "s"}`;
    else if (hours > 0) label = `Overdue by ${hours} hour${hours === 1 ? "" : "s"}`;
    return { label, overdue: true, urgency: "overdue", seconds: -over, parts: null };
  }

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  let label;
  if (days > 0) label = `${days} day${days === 1 ? "" : "s"} left`;
  else if (hours > 0) label = `${hours}h ${minutes}m left`;
  else if (minutes > 0) label = `${minutes}m ${seconds}s left`;
  else label = `${seconds}s left`;

  // Anything inside three days is worth flagging to a buyer or an investor.
  const urgency = days >= 7 ? "calm" : days >= 3 ? "soon" : "urgent";

  return { label, overdue: false, urgency, seconds: diff, parts: { days, hours, minutes, seconds } };
}

export function explorerTxUrl(hash) {
  return `${ACTIVE_NETWORK.explorerUrl}/tx/${hash}`;
}

export function explorerAddressUrl(addr) {
  return `${ACTIVE_NETWORK.explorerUrl}/address/${addr}`;
}

export function sameAddress(a, b) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
