import { PLATFORM_FEE_BPS, TRUSTED_MIN_REPAID, TRUSTED_MAX_DEFAULTS, MIN_DISCOUNT_BPS, MAX_DISCOUNT_BPS } from "../config/network";

const SECTIONS = [
  { id: "how-it-works", label: "How It Works" },
  { id: "fees", label: "Fees" },
  { id: "staking", label: "Staking" },
  { id: "trusted", label: "Trusted Badge" },
  { id: "risk", label: "Risk Disclosure" },
];

function Example({ title, lines }) {
  return (
    <div className="rounded-xl p-4 mt-3 text-sm" style={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)" }}>
      <div className="label mb-2">{title}</div>
      {lines.map((l, i) => <p key={i} className="text-text-secondary mb-1">{l}</p>)}
    </div>
  );
}

export default function Documentation() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <aside className="lg:sticky lg:top-20 h-fit">
        <nav className="card p-3 space-y-0.5">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}
              className="block px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="lg:col-span-3 space-y-8">
        <section id="how-it-works" className="card p-6">
          <h2 className="text-lg font-semibold mb-3">How It Works</h2>
          <p className="text-sm text-text-secondary mb-4 leading-relaxed">Invoice Ledger lets a seller issue an on-chain invoice that a buyer confirms and repays. If the seller wants cash before the due date, they can sell fractional shares of the unpaid invoice to investors at a discount. Repayment is distributed proportionally and automatically.</p>

          <div className="space-y-4 text-sm">
            <div><span className="font-medium">For sellers.</span> <span className="text-text-secondary">Create an invoice to a buyer. Once the buyer confirms and sets a due date, you can either wait for direct payment or tokenize the invoice and raise cash now at a discount. You receive the discounted proceeds immediately. Optional first-loss staking lets you signal confidence in your buyer.</span></div>
            <div><span className="font-medium">For buyers.</span> <span className="text-text-secondary">You review and confirm each invoice, setting your own due date. Pay before that date to keep a clean, permanent on-time record that earns the Trusted badge. The contract cannot force you to pay, but your history is public forever.</span></div>
            <div><span className="font-medium">For investors.</span> <span className="text-text-secondary">You buy a share of an invoice at a discount to its face value. If the buyer repays, you receive your proportional share of the full amount. Your return is the gap between the discounted price and the face value. If the buyer defaults, you may recover the seller's stake if one was posted, otherwise nothing.</span></div>
          </div>
        </section>

        <section id="fees" className="card p-6">
          <h2 className="text-lg font-semibold mb-3">Fees</h2>
          <p className="text-sm text-text-secondary mb-2 leading-relaxed">The platform charges a fixed fee of {(PLATFORM_FEE_BPS / 100).toFixed(1)}% on every settled payment. It is deducted from the amount the buyer pays, before distribution. This fee is immutable after deployment and cannot be changed by anyone.</p>
          <p className="text-sm text-text-secondary mb-2">Claiming a username costs a one-time fee of 1 USDT.</p>
          <Example
            title="Worked example: 10,000 USDT invoice, paid directly"
            lines={[
              `Buyer pays 10,000.00 USDT.`,
              `Platform fee: 10,000 x ${PLATFORM_FEE_BPS} / 10000 = ${(10000 * PLATFORM_FEE_BPS / 10000).toFixed(2)} USDT.`,
              `Seller receives 9,950.00 USDT after claiming.`,
            ]}
          />
        </section>

        <section id="staking" className="card p-6">
          <h2 className="text-lg font-semibold mb-3">First-Loss Staking</h2>
          <p className="text-sm text-text-secondary mb-2 leading-relaxed">At tokenization, the seller may optionally lock up additional USDT as a first-loss buffer. If the buyer defaults, this stake is used to compensate investors before they take any loss. If the buyer repays, the seller gets their stake back in full.</p>
          <Example
            title="Worked example: default with a stake"
            lines={[
              `Invoice face value 10,000 USDT, 50% sold to investors, seller stakes 2,000 USDT.`,
              `Buyer defaults. The 2,000 USDT stake is the only pool available to investors.`,
              `Investors split the 2,000 USDT proportional to their purchased share.`,
              `The seller keeps their earlier discounted proceeds but does not get the stake back.`,
            ]}
          />
        </section>

        <section id="trusted" className="card p-6">
          <h2 className="text-lg font-semibold mb-3">Trusted Badge</h2>
          <p className="text-sm text-text-secondary mb-2 leading-relaxed">The Trusted badge is granted entirely automatically by the contract based on a buyer's on-chain repayment record. No person, including the deployer, can grant or remove it.</p>
          <ul className="list-disc pl-5 text-sm text-text-secondary space-y-1">
            <li>At least {TRUSTED_MIN_REPAID} on-time repayments.</li>
            <li>No more than {TRUSTED_MAX_DEFAULTS} defaults.</li>
            <li>It applies to a wallet address, not a username, and cannot be transferred.</li>
          </ul>
        </section>

        <section id="risk" className="card p-6" style={{ borderColor: "rgba(212,168,67,0.3)", borderWidth: "1px" }}>
          <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--color-accent-warn)" }}>Risk Disclosure</h2>
          <div className="space-y-3 text-sm text-text-secondary">
            <p><span className="font-medium text-text-primary">This is experimental testnet software.</span> It is a proof of concept built for a hackathon. It has not been audited and may contain bugs.</p>
            <p><span className="font-medium text-text-primary">The contract cannot force repayment.</span> No smart contract can compel a buyer to pay in the physical world. If a buyer defaults, the money owed is simply not paid.</p>
            <p><span className="font-medium text-text-primary">Defaults are possible and disclosed.</span> A default is recorded permanently and visibly on-chain. There is no recovery mechanism beyond the optional seller stake.</p>
            <p><span className="font-medium text-text-primary">No regulatory protection.</span> This is not a licensed financial institution and is not subject to investor protection rules. Tokenized debt may raise securities law questions in some jurisdictions.</p>
            <p><span className="font-medium text-text-primary">No legal recourse from the contract.</span> The contract provides no legal remedy. Any dispute resolution would have to happen entirely outside of it.</p>
            <p><span className="font-medium text-text-primary">Mainnet does not change the risks.</span> If this is ever deployed to BOT Chain Mainnet, the fundamental risks above remain unchanged.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
