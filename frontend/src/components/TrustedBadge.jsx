import { Link } from "react-router-dom";
import { Icon } from "./ui";
import { TRUSTED_MIN_REPAID, TRUSTED_MAX_DEFAULTS } from "../config/network";

const EXPLANATION =
  `Trusted is granted automatically by the contract after at least ${TRUSTED_MIN_REPAID} on-time repayments ` +
  `with no more than ${TRUSTED_MAX_DEFAULTS} defaults. No person can grant or remove it.`;

/**
 * The Trusted badge. Always links to the documentation section that defines the criteria,
 * so the signal is never left unexplained.
 */
export default function TrustedBadge({ small = false, asLink = true }) {
  const content = (
    <span
      className="chip chip-primary"
      style={small ? { fontSize: "0.625rem", padding: "0.125rem 0.4375rem" } : undefined}
      title={EXPLANATION}
    >
      <Icon name="check" size={small ? 9 : 11} strokeWidth={3} />
      Trusted
    </span>
  );

  if (!asLink) return content;

  return (
    <Link to="/docs#trusted" aria-label={EXPLANATION} className="inline-flex">
      {content}
    </Link>
  );
}
