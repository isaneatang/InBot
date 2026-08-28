import { motion } from "framer-motion";
import { Icon, MOTION } from "./ui";

const STATUS = { Created: 0, Confirmed: 1, Tokenized: 2, Repaid: 3, Defaulted: 4 };

export const STATUS_LABELS = ["Created", "Confirmed", "Tokenized", "Repaid", "Defaulted"];

/**
 * The five lifecycle stages, reduced to the path this particular invoice actually took.
 *
 * Tokenized only appears once the invoice was tokenized, since a directly paid invoice
 * never passes through it. Repaid and Defaulted are mutually exclusive end states, so only
 * the one that applies is shown rather than presenting both as pending possibilities.
 */
function buildSteps(invoice) {
  const status = Number(invoice?.status ?? 0);
  const wasTokenized = Number(invoice?.discountBps ?? 0) > 0 || status === STATUS.Tokenized;

  const steps = [
    { label: "Created", value: STATUS.Created },
    { label: "Confirmed", value: STATUS.Confirmed },
  ];
  if (wasTokenized) steps.push({ label: "Tokenized", value: STATUS.Tokenized });
  if (status === STATUS.Defaulted) steps.push({ label: "Defaulted", value: STATUS.Defaulted, danger: true });
  else steps.push({ label: "Repaid", value: STATUS.Repaid });

  return steps;
}

/** The status chip, carrying the label as text so colour is never the only signal. */
export function StatusChip({ status, size = "md" }) {
  const s = Number(status);
  const config = {
    0: { cls: "chip-neutral", icon: "clock" },
    1: { cls: "chip-neutral", icon: "check" },
    2: { cls: "chip-primary", icon: "layers" },
    3: { cls: "chip-primary", icon: "check" },
    4: { cls: "chip-danger", icon: "alert" },
  }[s] || { cls: "chip-neutral", icon: "clock" };

  return (
    <span className={`chip ${config.cls}`} style={size === "lg" ? { fontSize: "0.75rem", padding: "0.25rem 0.625rem" } : undefined}>
      <Icon name={config.icon} size={size === "lg" ? 12 : 10} strokeWidth={2.5} />
      {STATUS_LABELS[s] || "Unknown"}
    </span>
  );
}

export default function StatusStepper({ invoice, compact = false }) {
  const steps = buildSteps(invoice);
  const status = Number(invoice?.status ?? 0);
  const currentIdx = Math.max(
    steps.findIndex((s) => s.value === status),
    0
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1" aria-label={`Status: ${STATUS_LABELS[status]}`}>
        {steps.map((step, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const color = step.danger
            ? "var(--color-danger)"
            : done || current
              ? "var(--color-primary)"
              : "var(--color-border-strong)";
          return (
            <motion.span
              key={step.label}
              className="rounded-full"
              style={{ width: current ? "1rem" : "0.3125rem", height: "0.3125rem", background: color }}
              initial={false}
              animate={{ width: current ? "1rem" : "0.3125rem" }}
              transition={MOTION.step}
            />
          );
        })}
      </div>
    );
  }

  return (
    <ol className="flex items-start" aria-label={`Status: ${STATUS_LABELS[status]}`}>
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const current = i === currentIdx;
        const settled = done || current;
        const accent = step.danger ? "var(--color-danger)" : "var(--color-primary)";

        return (
          <li key={step.label} className="flex-1 min-w-0 flex flex-col items-center relative">
            {/* Connector drawn behind the node, filled only up to the current step. */}
            {i > 0 && (
              <span
                className="absolute h-px"
                style={{
                  top: "0.5625rem",
                  right: "50%",
                  width: "100%",
                  background: settled ? accent : "var(--color-border-strong)",
                  transition: "background-color 300ms ease-in-out",
                }}
              />
            )}

            <motion.span
              className="relative z-10 rounded-full flex items-center justify-center"
              style={{
                width: "1.125rem",
                height: "1.125rem",
                background: settled ? accent : "var(--color-background)",
                border: settled ? `1px solid ${accent}` : "1px solid var(--color-border-strong)",
                color: "#0b0d09",
              }}
              initial={false}
              animate={{ scale: current ? [1, 1.12, 1] : 1 }}
              transition={
                current
                  ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                  : MOTION.step
              }
            >
              {done && <Icon name="check" size={10} strokeWidth={3} />}
              {current && !step.danger && <span className="dot" style={{ background: "#0b0d09" }} />}
              {current && step.danger && <Icon name="alert" size={9} strokeWidth={3} />}
            </motion.span>

            <span
              className="mt-2 text-[0.6875rem] text-center leading-tight px-0.5"
              style={{
                color: step.danger && settled
                  ? "var(--color-danger)"
                  : settled
                    ? "var(--color-text-primary)"
                    : "var(--color-text-muted)",
                fontWeight: current ? 600 : 400,
              }}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
