import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, kind = "info") => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, kind }]);
      if (kind !== "error") {
        setTimeout(() => dismiss(id), 4000);
      }
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 items-end">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="max-w-sm rounded-xl px-4 py-3 text-sm"
              style={{
                background:
                  t.kind === "error"
                    ? "linear-gradient(135deg, #d44c44 0%, #b83e38 100%)"
                    : t.kind === "success"
                    ? "linear-gradient(135deg, #5cb870 0%, #4a9e5e 100%)"
                    : "linear-gradient(145deg, #1a1e18 0%, #111310 100%)",
                color: t.kind === "error" || t.kind === "success" ? "#0a0c08" : "var(--color-text-primary)",
                border: t.kind === "info" ? "1px solid var(--color-border)" : "none",
                boxShadow:
                  t.kind === "error"
                    ? "0 8px 24px rgba(212,76,68,0.3)"
                    : t.kind === "success"
                    ? "0 8px 24px rgba(92,184,112,0.3)"
                    : "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              {t.kind === "error" && (
                <button onClick={() => dismiss(t.id)} className="float-right ml-4 font-bold opacity-60 hover:opacity-100 transition-opacity">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
