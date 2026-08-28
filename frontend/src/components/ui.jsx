import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { formatMoneyFixed } from "../lib/format";

/* ------------------------------------------------------------------------- */
/* Motion presets                                                            */
/* ------------------------------------------------------------------------- */

/** Shared timings so no component invents its own. */
export const MOTION = {
  page: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  hover: { duration: 0.15, ease: [0.16, 1, 0.3, 1] },
  step: { duration: 0.3, ease: "easeInOut" },
  count: { duration: 0.5, ease: "easeOut" },
  toast: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
};

/* ------------------------------------------------------------------------- */
/* Icons                                                                     */
/* ------------------------------------------------------------------------- */

const PATHS = {
  check: "M20 6 9 17l-5-5",
  alert: "M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
  clock: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  x: "M18 6 6 18M6 6l12 12",
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  copy: "M9 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  external: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  wallet: "M2 7h20v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7zM2 7l2.5-4h15L22 7M16 13h2",
  phone: "M5 2h14a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM12 18h.01",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  store: "M3 3h18v4H3zM5 7v14h14V7M9 21v-6h6v6",
  plus: "M12 5v14M5 12h14",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3z",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  offline: "M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01",
  trend: "M23 6l-9.5 9.5-5-5L1 18M17 6h6v6",
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  coins: "M12 8c4.42 0 8-1.34 8-3s-3.58-3-8-3-8 1.34-8 3 3.58 3 8 3zM4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3",
  arrowDown: "M12 5v14M19 12l-7 7-7-7",
  arrowUp: "M12 19V5M5 12l7-7 7 7",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
};

export function Icon({ name, size = 16, className = "", strokeWidth = 2, style }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

/* ------------------------------------------------------------------------- */
/* Skeletons                                                                 */
/* ------------------------------------------------------------------------- */

export function Skeleton({ className = "", style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Matches the shape of an InvoiceCard so the layout does not jump when data lands. */
export function InvoiceCardSkeleton() {
  return (
    <div className="card p-4" aria-hidden="true">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-7 w-32 mb-2" />
      <Skeleton className="h-3.5 w-full mb-1.5" />
      <Skeleton className="h-3.5 w-2/3 mb-4" />
      <Skeleton className="h-1.5 w-full mb-4" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }) {
  return (
    <div className="grid-cards">
      {Array.from({ length: count }, (_, i) => (
        <InvoiceCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-4">
          <Skeleton className="h-6 w-20 mb-2" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Empty and error states                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Every empty state names the specific thing that is missing and offers the action that
 * would fill it. There is no generic no-data message anywhere in the app.
 */
export function EmptyState({ icon = "inbox", title, body, action }) {
  return (
    <div className="card px-6 py-12 text-center">
      <div
        className="w-11 h-11 mx-auto mb-4 rounded-full flex items-center justify-center"
        style={{ background: "var(--color-surface-elevated)", color: "var(--color-text-muted)" }}
      >
        <Icon name={icon} size={20} />
      </div>
      <p className="font-medium mb-1">{title}</p>
      {body && <p className="text-sm text-text-secondary max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * Distinguishes an unreachable network from a wrong-network wallet, because the two need
 * completely different actions from the user.
 */
export function ErrorState({ error, onRetry, wrongNetwork, networkLabel, onSwitchNetwork }) {
  if (wrongNetwork) {
    return (
      <div className="card p-6" style={{ borderColor: "color-mix(in srgb, var(--color-accent-warn) 36%, transparent)" }}>
        <div className="flex items-start gap-3">
          <span style={{ color: "var(--color-accent-warn)" }} className="mt-0.5">
            <Icon name="alert" size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-medium mb-1">You are on the wrong network</p>
            <p className="text-sm text-text-secondary">
              This data lives on {networkLabel}. Switch your wallet to load it.
            </p>
            {onSwitchNetwork && (
              <button className="btn btn-outline btn-sm mt-4" onClick={onSwitchNetwork}>
                Switch to {networkLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6" style={{ borderColor: "color-mix(in srgb, var(--color-danger) 36%, transparent)" }}>
      <div className="flex items-start gap-3">
        <span style={{ color: "var(--color-danger)" }} className="mt-0.5">
          <Icon name="offline" size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium mb-1">Could not reach the network</p>
          <p className="text-sm text-text-secondary">
            The RPC endpoint did not respond. Check your connection and try again.
          </p>
          {error?.message && (
            <p className="text-xs font-mono mt-2 text-text-muted break-all">{error.message}</p>
          )}
          {onRetry && (
            <button className="btn btn-outline btn-sm mt-4" onClick={onRetry}>
              <Icon name="refresh" size={13} />
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Numbers                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Interpolates from the previous value to the next over 500ms.
 *
 * A linear tween rather than a spring: a balance that overshoots and settles back looks
 * like a glitch when the number is money.
 */
export function AnimatedNumber({ value, decimals = 2, prefix = "", suffix = "", className = "" }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }

    const duration = 500;
    const start = performance.now();

    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // Ease-out cubic, matching the shared count timing.
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (target - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  const text = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`tabular ${className}`}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/** A USDT figure. Animates when asked, which is only worth it for live totals. */
export function Money({ value, animate = false, decimals = 2, className = "", showSymbol = true }) {
  const prefix = showSymbol ? "$" : "";
  if (animate) {
    const asNumber = Number(value ?? 0n) / 1e6;
    return <AnimatedNumber value={asNumber} decimals={decimals} prefix={prefix} className={className} />;
  }
  return (
    <span className={`tabular ${className}`}>
      {prefix}
      {formatMoneyFixed(value ?? 0n)}
    </span>
  );
}

/* ------------------------------------------------------------------------- */
/* Stats                                                                     */
/* ------------------------------------------------------------------------- */

export function StatTile({ label, value, hint, tone = "default", icon }) {
  const color =
    tone === "danger"
      ? "var(--color-danger)"
      : tone === "primary"
        ? "var(--color-primary)"
        : tone === "warn"
          ? "var(--color-accent-warn)"
          : "var(--color-text-primary)";

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="stat-value truncate" style={{ color }}>
            {value}
          </div>
          <div className="stat-label">{label}</div>
        </div>
        {icon && (
          <span style={{ color: "var(--color-text-muted)" }} className="flex-shrink-0 mt-0.5">
            <Icon name={icon} size={15} />
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-text-muted mt-3 leading-snug">{hint}</p>}
    </div>
  );
}

/**
 * On-time, late and default counts. Rendered identically everywhere it appears so the
 * three numbers always mean the same thing in the same order.
 */
export function CreditSummary({ profile, size = "md" }) {
  const cells = [
    { label: "On-time", value: profile?.onTime ?? 0, tone: "default" },
    { label: "Late", value: profile?.late ?? 0, tone: "default" },
    { label: "Defaults", value: profile?.defaults ?? 0, tone: (profile?.defaults ?? 0) > 0 ? "danger" : "default" },
  ];
  const valueClass = size === "sm" ? "text-lg font-semibold" : "stat-value";

  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map((cell) => (
        <div key={cell.label} className="panel px-3 py-2.5 text-center">
          <div
            className={`${valueClass} tabular`}
            style={{ color: cell.tone === "danger" ? "var(--color-danger)" : "var(--color-text-primary)" }}
          >
            {cell.value}
          </div>
          <div className="text-xs text-text-secondary mt-0.5">{cell.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Segmented control                                                         */
/* ------------------------------------------------------------------------- */

/**
 * Tabs with an animated indicator. Scrolls horizontally on narrow screens instead of
 * wrapping, which keeps the control one line tall on a phone.
 */
export function Segmented({ items, value, onChange, id = "segmented" }) {
  return (
    <div className="scroll-x-bleed">
      <div className="segmented" role="tablist">
        {items.map((item) => {
          const selected = item.key === value;
          return (
            <button
              key={item.key}
              role="tab"
              type="button"
              aria-selected={selected}
              className="segmented-item"
              onClick={() => onChange(item.key)}
            >
              {selected && (
                <motion.span
                  layoutId={`${id}-indicator`}
                  className="absolute inset-0 rounded-[4px]"
                  style={{ background: "var(--color-surface-hover)" }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                {item.label}
                {item.count !== undefined && <span className="segmented-count">{item.count}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Overlays                                                                  */
/* ------------------------------------------------------------------------- */

/** Locks background scrolling while an overlay is open. */
function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/** Closes an overlay on Escape. */
function useEscape(active, onClose) {
  useEffect(() => {
    if (!active) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onClose]);
}

export function Modal({ open, onClose, title, subtitle, children, maxWidth = "26rem" }) {
  useScrollLock(open);
  useEscape(open, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(3px)" }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="card w-full"
            style={{ maxWidth, borderRadius: "var(--radius-lg)" }}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={MOTION.page}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5 pb-0">
              <div className="min-w-0">
                <h2 className="font-semibold">{title}</h2>
                {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="btn btn-ghost -mt-1 -mr-1"
                style={{ minHeight: "2rem", padding: "0.375rem" }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Bottom sheet for mobile-only surfaces such as the marketplace filters. */
export function BottomSheet({ open, onClose, title, children, footer }) {
  useScrollLock(open);
  useEscape(open, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[55]"
            style={{ background: "rgba(0,0,0,0.6)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90) onClose();
            }}
          >
            <div className="sheet-handle" />
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-semibold text-sm">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="btn btn-ghost"
                style={{ minHeight: "2rem", padding: "0.375rem" }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <div className="px-4 pb-4">{children}</div>
            {footer && (
              <div className="px-4 pb-4 pt-2 sticky bottom-0" style={{ background: "var(--color-surface)" }}>
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/* ------------------------------------------------------------------------- */
/* Small pieces                                                              */
/* ------------------------------------------------------------------------- */

/** Copies text and confirms it inline, so the user sees the action register. */
export function CopyButton({ value, label = "Copy", className = "" }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Wallet in-app browsers sometimes block the clipboard API. Fall back to a
      // temporary selection, which they generally do allow.
      const el = document.createElement("textarea");
      el.value = value;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button type="button" onClick={copy} className={`btn btn-ghost btn-sm ${className}`}>
      <Icon name={copied ? "check" : "copy"} size={13} />
      {copied ? "Copied" : label}
    </button>
  );
}

export function ExplorerLink({ path, children, className = "" }) {
  return (
    <a
      href={path}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${className}`}
    >
      {children}
      <Icon name="external" size={11} />
    </a>
  );
}

/** A monospace address that links to its profile page. */
export function AddressLink({ address, username, className = "" }) {
  const label = username && username.length > 0 ? username : `${address.slice(0, 6)}...${address.slice(-4)}`;
  return (
    <Link
      to={`/profile/${address}`}
      className={`${username ? "" : "font-mono"} hover:text-primary transition-colors ${className}`}
      title={address}
    >
      {label}
    </Link>
  );
}

export function SectionHeading({ title, description, action, className = "" }) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-text-secondary mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, meta }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-text-secondary mt-1">{subtitle}</p>}
        {meta}
      </div>
      {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
    </div>
  );
}

/** A labelled progress meter with the percentage stated as text beside it. */
export function FundingMeter({ soldBps, label = "Funded", remaining }) {
  const pct = Math.min(Number(soldBps) / 100, 100);
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1.5">
        <span className="text-text-secondary">{label}</span>
        <span className="tabular font-medium">{pct.toFixed(pct % 1 === 0 ? 0 : 1)}%</span>
      </div>
      <div className="meter">
        <motion.div
          className="meter-fill"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={MOTION.count}
        />
      </div>
      {remaining !== undefined && (
        <p className="text-xs text-text-secondary mt-1.5">
          <Money value={remaining} /> still available
        </p>
      )}
    </div>
  );
}

/** A callout used for risk and disclosure copy. Border-only, never a filled alarm block. */
export function Callout({ tone = "warn", title, children }) {
  const color = tone === "danger" ? "var(--color-danger)" : "var(--color-accent-warn)";
  return (
    <div
      className="rounded-md p-4"
      style={{ border: `1px solid color-mix(in srgb, ${color} 36%, transparent)` }}
    >
      {title && (
        <p className="font-medium text-sm mb-1.5 flex items-center gap-2" style={{ color }}>
          <Icon name="alert" size={14} />
          {title}
        </p>
      )}
      <div className="text-sm text-text-secondary leading-relaxed">{children}</div>
    </div>
  );
}
