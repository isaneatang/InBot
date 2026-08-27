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
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className={`max-w-sm rounded-md px-4 py-3 text-sm shadow-lg ${
                t.kind === "error"
                  ? "bg-danger text-white"
                  : t.kind === "success"
                  ? "bg-primary text-background"
                  : "bg-surface-elevated border border-border text-text-primary"
              }`}
            >
              {t.kind === "error" && (
                <button onClick={() => dismiss(t.id)} className="float-right ml-4 font-bold">
                  x
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