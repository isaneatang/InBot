import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Icon, MOTION } from "./ui";
import { explorerTxUrl } from "../lib/format";

const ToastContext = createContext(null);

const TONES = {
  success: { color: "var(--color-primary)", icon: "check" },
  error: { color: "var(--color-danger)", icon: "alert" },
  pending: { color: "var(--color-accent-warn)", icon: "clock" },
  info: { color: "var(--color-text-secondary)", icon: "activity" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  /**
   * Errors stay until dismissed. A financial error message that vanishes after four
   * seconds is worse than no message at all, because the user knows something went wrong
   * but not what.
   */
  const schedule = useCallback(
    (id, kind) => {
      if (kind === "error" || kind === "pending") return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 4000)
      );
    },
    [dismiss]
  );

  const push = useCallback(
    (message, kind = "info", options = {}) => {
      const id = ++idRef.current;
      setToasts((list) => [...list, { id, message, kind, ...options }]);
      schedule(id, kind);
      return id;
    },
    [schedule]
  );

  /** Replaces an existing toast in place, used to move pending to confirmed. */
  const update = useCallback(
    (id, message, kind, options = {}) => {
      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, message, kind, ...options } : t)));
      schedule(id, kind);
    },
    [schedule]
  );

  const value = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed z-[80] flex flex-col gap-2 pointer-events-none
                   top-[calc(env(safe-area-inset-top,0px)+0.75rem)] left-3 right-3
                   sm:left-auto sm:right-4 sm:top-4 sm:w-[22rem]"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const tone = TONES[t.kind] || TONES.info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.97 }}
                transition={MOTION.toast}
                className="card p-3 pointer-events-auto flex items-start gap-2.5"
                style={{
                  background: "var(--color-surface-elevated)",
                  borderColor: `color-mix(in srgb, ${tone.color} 34%, var(--color-border))`,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                }}
              >
                <span
                  className={`flex-shrink-0 mt-px ${t.kind === "pending" ? "pending-pulse" : ""}`}
                  style={{ color: tone.color }}
                >
                  <Icon name={tone.icon} size={15} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug break-words">{t.message}</p>
                  {t.hash && (
                    <a
                      href={explorerTxUrl(t.hash)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs font-mono mt-1.5 inline-flex items-center gap-1 hover:text-primary transition-colors"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {t.hash.slice(0, 10)}...{t.hash.slice(-8)}
                      <Icon name="external" size={10} />
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="flex-shrink-0 -mt-0.5 -mr-0.5 p-1 rounded text-text-muted hover:text-text-primary transition-colors"
                >
                  <Icon name="x" size={13} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
