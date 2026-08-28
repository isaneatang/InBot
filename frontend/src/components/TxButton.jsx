import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "./Toast";
import { Icon } from "./ui";
import { isUserRejection } from "../hooks/useInvoiceFactory";

/**
 * Drives one write transaction through its full lifecycle and reports each stage.
 *
 * The four states map onto what the user can actually see happening: idle, waiting for the
 * wallet and then the receipt, confirmed, or failed with a reason. Nothing is reported as
 * successful before the receipt has been read back from the chain.
 */
export function useTransaction({ onConfirmed } = {}) {
  const toast = useToast();
  const [state, setState] = useState("idle");
  const [error, setError] = useState(null);
  const [hash, setHash] = useState(null);
  const toastRef = useRef(null);

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
    setHash(null);
  }, []);

  /**
   * @param label short present-tense description, for example "Confirming invoice"
   * @param run   async function performing the write, resolving to { hash, receipt }
   */
  const execute = useCallback(
    async (label, run) => {
      setState("pending");
      setError(null);
      setHash(null);
      toastRef.current = toast.push(`${label}. Waiting for confirmation.`, "pending");

      try {
        const result = await run();
        const txHash = result?.hash ?? null;
        setHash(txHash);
        setState("confirmed");
        toast.update(toastRef.current, `${label} confirmed on chain.`, "success", { hash: txHash });
        if (onConfirmed) await onConfirmed(result);
        return result;
      } catch (err) {
        if (isUserRejection(err)) {
          setState("idle");
          toast.dismiss(toastRef.current);
          return null;
        }
        setState("error");
        setError(err);
        toast.update(toastRef.current, err?.message || `${label} failed.`, "error");
        return null;
      }
    },
    [toast, onConfirmed]
  );

  return {
    execute,
    reset,
    state,
    error,
    hash,
    isPending: state === "pending",
    isConfirmed: state === "confirmed",
    isError: state === "error",
  };
}

/**
 * A button wired to a transaction state.
 *
 * While pending it pulses and shows a spinner. On confirmation it briefly shows a check
 * before returning to its label, so the user gets a definite acknowledgement rather than
 * having to infer success from the page changing underneath them.
 */
export default function TxButton({
  children,
  onClick,
  state = "idle",
  disabled,
  variant = "primary",
  size,
  block = true,
  pendingLabel,
  confirmedLabel = "Done",
  type = "button",
  className = "",
  title,
}) {
  const isPending = state === "pending";
  const isConfirmed = state === "confirmed";

  const classes = [
    "btn",
    `btn-${variant}`,
    size ? `btn-${size}` : "",
    block ? "btn-block" : "",
    isPending ? "pending-pulse" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || isPending}
      aria-busy={isPending}
      title={title}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isPending ? (
          <motion.span
            key="pending"
            className="inline-flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            <span className="spinner" />
            {pendingLabel || "Confirming"}
          </motion.span>
        ) : isConfirmed ? (
          <motion.span
            key="confirmed"
            className="inline-flex items-center gap-2"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            <Icon name="check" size={15} strokeWidth={2.5} />
            {confirmedLabel}
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            className="inline-flex items-center gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
