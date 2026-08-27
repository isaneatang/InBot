import { useState } from "react";

export function useTx(onSuccess) {
  const [state, setState] = useState("idle"); // idle | pending | confirmed | error
  const [error, setError] = useState("");

  const run = async (fn) => {
    setState("pending");
    setError("");
    try {
      const result = await fn();
      setState("confirmed");
      if (onSuccess) onSuccess(result);
      return result;
    } catch (e) {
      setState("error");
      setError(e?.shortMessage || e?.message || "Transaction failed");
      return null;
    }
  };

  const reset = () => {
    setState("idle");
    setError("");
  };

  return { state, error, run, reset, pending: state === "pending" };
}