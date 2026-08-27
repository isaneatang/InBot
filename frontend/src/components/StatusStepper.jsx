import { motion } from "framer-motion";

const STATUS_VALUES = { Created: 0, Confirmed: 1, Tokenized: 2, Repaid: 3, Defaulted: 4 };

function buildSteps(inv) {
  const status = inv ? Number(inv.status) : 0;
  const tokenized = inv ? Number(inv.discountBps) > 0 : false;
  const steps = [];
  steps.push({ label: "Created", value: 0 });
  steps.push({ label: "Confirmed", value: 1 });
  if (tokenized) steps.push({ label: "Tokenized", value: 2 });
  if (status === STATUS_VALUES.Defaulted) {
    steps.push({ label: "Defaulted", value: 4 });
  } else {
    steps.push({ label: "Repaid", value: 3 });
  }
  return steps;
}

export default function StatusStepper({ invoice, compact = false }) {
  const steps = buildSteps(invoice);
  const status = invoice ? Number(invoice.status) : 0;
  const currentIdx = steps.findIndex((s) => s.value === status);

  return (
    <div className={`flex items-center ${compact ? "gap-1" : "gap-2"}`}>
      {steps.map((s, i) => {
        const state = i < currentIdx ? "done" : i === currentIdx ? "current" : "todo";
        const isDanger = s.value === STATUS_VALUES.Defaulted;
        return (
          <div key={s.label} className="flex items-center flex-1 min-w-0">
            <motion.div
              className="flex flex-col items-center"
              initial={false}
              animate={{ scale: state === "current" ? 1 : 1 }}
            >
              <motion.div
                className={`rounded-full flex items-center justify-center ${
                  compact ? "w-3.5 h-3.5" : "w-5 h-5"
                }`}
                style={{
                  backgroundColor: state === "todo" ? "transparent" : isDanger ? "var(--color-danger)" : "var(--color-primary)",
                  border: state === "todo" ? "2px solid var(--color-border)" : "none",
                  outline: state === "current" ? "2px solid var(--color-primary)" : "none",
                  opacity: state === "todo" ? 0.5 : 1,
                }}
                animate={
                  state === "current"
                    ? { scale: [1, 1.15, 1], opacity: [1, 0.7, 1] }
                    : {}
                }
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
              {!compact && (
                <span
                  className="mt-1 text-[10px] whitespace-nowrap"
                  style={{ color: state === "todo" ? "var(--color-text-secondary)" : isDanger ? "var(--color-danger)" : "var(--color-text-primary)" }}
                >
                  {s.label}
                </span>
              )}
            </motion.div>
            {i < steps.length - 1 && (
              <div
                className="h-0.5 flex-1 mx-1"
                style={{
                  backgroundColor: i < currentIdx ? "var(--color-primary)" : "var(--color-border)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}