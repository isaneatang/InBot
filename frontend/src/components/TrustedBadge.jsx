export default function TrustedBadge({ small = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-primary/20 border border-primary text-primary ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
      title="Trusted: earned automatically after at least 5 on-time repayments and no defaults. See Documentation."
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Trusted
    </span>
  );
}