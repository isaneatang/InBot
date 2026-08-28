import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Callout, Icon, PageHeader } from "../components/ui";
import {
  ACTIVE_NETWORK,
  MAX_DISCOUNT_BPS,
  MIN_DISCOUNT_BPS,
  PLATFORM_FEE_BPS,
  TRUSTED_MAX_DEFAULTS,
  TRUSTED_MIN_REPAID,
} from "../config/network";

const SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "fees", label: "Fees" },
  { id: "tokenizing", label: "Tokenizing and yield" },
  { id: "staking", label: "First-loss staking" },
  { id: "defaults", label: "Defaults" },
  { id: "trusted", label: "Trusted badge" },
  { id: "immutability", label: "Immutability" },
  { id: "risk", label: "Risk disclosure" },
];

export default function Documentation() {
  const [active, setActive] = useState(SECTIONS[0].id);

  /** Highlights the section currently in view in the sidebar. */
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div>
      <PageHeader
        title="Documentation"
        subtitle="How the platform works for each role, with worked numbers, and what it does not protect you from."
      />

      {/* Mobile section navigation. */}
      <div className="lg:hidden mb-6">
        <label htmlFor="doc-nav" className="label mb-1.5">
          Jump to section
        </label>
        <select
          id="doc-nav"
          className="input"
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            scrollTo(e.target.value);
          }}
        >
          {SECTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Desktop sticky sidebar. */}
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-0.5" aria-label="Sections">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="block px-3 py-1.5 rounded text-sm transition-colors"
                style={{
                  color: active === s.id ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                  background: active === s.id ? "var(--color-surface-elevated)" : "transparent",
                  fontWeight: active === s.id ? 500 : 400,
                }}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="lg:col-span-3 space-y-10">
          <Section id="how-it-works" title="How it works">
            <P>
              An invoice is a record inside a single contract, not a separate token or contract per
              invoice. It moves through five states: Created, Confirmed, Tokenized, and then either
              Repaid or Defaulted.
            </P>

            <Role title="For sellers">
              You create an invoice against a buyer's wallet address. Once the buyer confirms it and
              sets a due date, you can wait for direct payment or tokenize the invoice to raise cash
              immediately. Tokenizing sells fractional shares to investors at a price you choose,
              between {MIN_DISCOUNT_BPS / 100} and {MAX_DISCOUNT_BPS / 100} percent of face value. You
              receive each investor's payment the moment they buy in.
            </Role>

            <Role title="For buyers">
              You review each invoice before it becomes binding, and you choose the repayment due date
              yourself at the moment you confirm. Paying on or before that date builds a permanent
              public record. The contract cannot force you to pay, but a default is recorded against
              your address forever and is visible to everyone.
            </Role>

            <Role title="For investors">
              You buy a share of a tokenized invoice below its face value. If the buyer repays, you
              claim your proportional share of the repayment net of the platform fee. Your return is
              the gap between what you paid and what you receive. If the buyer defaults, you recover
              only the seller's first-loss stake, and nothing at all where no stake was posted.
            </Role>

            <P>
              Money is never pushed to many parties in one transaction. After settlement each investor
              and the seller calls their own claim function. This keeps gas predictable and means one
              party cannot block everyone else.
            </P>
          </Section>

          <Section id="fees" title="Fees">
            <P>
              The platform takes {(PLATFORM_FEE_BPS / 100).toFixed(1)} percent of every settled
              payment. It is deducted from the amount the buyer pays, before anything is distributed.
              This rate and its recipient are fixed in the deployed contract and cannot be changed by
              anyone.
            </P>
            <P>Claiming a username costs a one-time fee of 1 USDT. There are no other fees.</P>

            <Worked
              title="A 10,000 USDT invoice paid directly"
              rows={[
                ["Buyer pays", "10,000.00 USDT"],
                [`Platform fee at ${(PLATFORM_FEE_BPS / 100).toFixed(1)} percent`, `${((10000 * PLATFORM_FEE_BPS) / 10000).toFixed(2)} USDT`],
                ["Seller claims", "9,950.00 USDT"],
              ]}
            />
          </Section>

          <Section id="tokenizing" title="Tokenizing and yield">
            <P>
              The discount is expressed as the share of face value an investor pays. A rate of 85
              percent means an investor pays 85 USDT to receive 100 USDT of face value at repayment.
              A lower rate raises less cash for the seller but offers a higher yield, so it fills
              faster.
            </P>
            <P>
              An invoice does not have to sell in full. Whatever percentage goes unsold stays with the
              seller, who claims that share of the repayment themselves.
            </P>

            <Worked
              title="A 10,000 USDT invoice tokenized at 85 percent, 60 percent sold"
              rows={[
                ["Investor pays for 60 percent of face", "5,100.00 USDT"],
                ["Seller receives that immediately", "5,100.00 USDT"],
                ["Buyer later repays face value", "10,000.00 USDT"],
                [`Platform fee at ${(PLATFORM_FEE_BPS / 100).toFixed(1)} percent`, "50.00 USDT"],
                ["Net available to distribute", "9,950.00 USDT"],
                ["Investor claims 60 percent of net", "5,970.00 USDT"],
                ["Investor gross return", "17.06 percent"],
                ["Seller claims the unsold 40 percent", "3,980.00 USDT"],
              ]}
            />

            <P>
              Because every share is calculated by integer division, the sum of all claims can fall a
              few units short of the net repayment. That remainder is swept to the fee recipient by a
              permissionless function that only becomes callable once every rightful claim has
              settled. It cannot be used to take anything else.
            </P>
          </Section>

          <Section id="staking" title="First-loss staking">
            <P>
              When tokenizing, a seller may lock additional USDT as a first-loss buffer. If the buyer
              repays, the stake returns to the seller in full alongside their share. If the buyer
              defaults, the stake is released to the investors instead.
            </P>
            <P>
              The entire stake goes to investors, shared in proportion to what each of them bought
              relative to one another. A partially sold invoice does not scale the stake down: the
              buffer exists to absorb investor losses, so all of it reaches investors.
            </P>

            <Worked
              title="A default with a stake, 40 percent of the invoice sold"
              rows={[
                ["Invoice face value", "10,000.00 USDT"],
                ["Sold to investors", "40 percent, split 30 and 10"],
                ["Seller stake", "3,000.00 USDT"],
                ["Buyer defaults, stake is released", "3,000.00 USDT"],
                ["Investor holding 30 percent claims", "2,250.00 USDT"],
                ["Investor holding 10 percent claims", "750.00 USDT"],
                ["Seller recovers", "Nothing beyond their earlier proceeds"],
              ]}
            />

            <P>
              Only the seller may stake against their own invoice. There is no third-party
              underwriting market, which keeps the incentive aligned: staking is a seller putting
              their own money behind their own claim about their own buyer.
            </P>
            <P>
              One exception exists. If an invoice was tokenized with a stake but attracted no
              investors at all, the stake was never needed to protect anyone, so it returns to the
              seller on default rather than being forfeited.
            </P>
          </Section>

          <Section id="defaults" title="Defaults">
            <P>
              Once the due date passes without repayment, anyone may call the function that records the
              default. This is deliberately permissionless: it writes down a fact that is already true
              on-chain and requires no privileged party to observe it.
            </P>
            <P>
              A default increments a permanent counter against the buyer's address and disqualifies
              them from the Trusted badge. There is no on-chain recovery mechanism beyond the seller's
              optional stake. The contract provides no debt collection, no arbitration and no legal
              remedy.
            </P>
          </Section>

          <Section id="trusted" title="Trusted badge">
            <P>
              The Trusted badge is granted by the contract itself, based purely on repayment history.
              It is checked automatically on every repayment.
            </P>
            <ul className="space-y-2 my-4">
              {[
                `At least ${TRUSTED_MIN_REPAID} repayments made on or before the due date.`,
                `No more than ${TRUSTED_MAX_DEFAULTS} defaults recorded.`,
                "Tied to a wallet address, not a username, and not transferable.",
                "Granted once, on the repayment that first crosses the threshold.",
              ].map((point) => (
                <li key={point} className="flex gap-2.5 text-sm text-text-secondary">
                  <span style={{ color: "var(--color-primary)" }} className="flex-shrink-0 mt-0.5">
                    <Icon name="check" size={13} strokeWidth={2.5} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <P>
              No address, including the deployer, can grant or revoke it. There is no role, no
              allowlist and no override. This is the only trust signal the contract issues: any form of
              business identity or document verification is deliberately out of scope and is not built
              into it.
            </P>
          </Section>

          <Section id="immutability" title="Immutability">
            <P>
              The contract has no owner, no admin role, no upgrade path and no pause function. Every
              parameter is fixed at deployment: the payment token, the fee rate, the fee recipient, the
              discount bounds and the Trusted thresholds.
            </P>
            <P>
              This is a deliberate trade. Nothing can be corrected after deployment, including a bug.
              In exchange, no party can change the rules underneath a position you have already taken.
            </P>
            <dl className="space-y-2.5 mt-4">
              <div className="row">
                <dt>Active network</dt>
                <dd>
                  {ACTIVE_NETWORK.label}, chain {ACTIVE_NETWORK.chainId}
                </dd>
              </div>
              <div className="row">
                <dt>Payment token</dt>
                <dd className="font-mono text-xs">{ACTIVE_NETWORK.usdtAddress}</dd>
              </div>
              <div className="row">
                <dt>Discount bounds</dt>
                <dd className="tabular">
                  {MIN_DISCOUNT_BPS / 100} to {MAX_DISCOUNT_BPS / 100} percent of face
                </dd>
              </div>
            </dl>
          </Section>

          {/* Visually distinct, bordered rather than filled, so it draws attention without alarm. */}
          <section id="risk" className="scroll-mt-20">
            <h2 className="text-lg font-semibold mb-4">Risk disclosure</h2>
            <div
              className="rounded-lg p-5 sm:p-6 space-y-4"
              style={{ border: "1px solid color-mix(in srgb, var(--color-accent-warn) 40%, transparent)" }}
            >
              <p className="text-sm font-medium flex items-center gap-2" style={{ color: "var(--color-accent-warn)" }}>
                <Icon name="alert" size={15} />
                Read this in full before committing any funds
              </p>

              {[
                [
                  "This is experimental software.",
                  "It was built as a proof of concept. It has not been audited by a third party and may contain bugs. Because the contract is immutable, a bug cannot be patched.",
                ],
                [
                  "The contract cannot force repayment.",
                  "No smart contract can compel a party to pay in the physical world. If a buyer chooses not to pay, the money is simply not paid.",
                ],
                [
                  "Defaults are possible and are disclosed.",
                  "A default is recorded permanently and visibly on-chain. There is no recovery mechanism beyond the seller's optional first-loss stake, which is frequently absent.",
                ],
                [
                  "You can lose your entire investment.",
                  "An investor in an invoice with no stake recovers nothing if the buyer defaults. This is the expected behaviour, not a failure, and it is priced into the discount.",
                ],
                [
                  "There is no regulatory protection.",
                  "This is not a licensed financial institution and is not subject to investor protection rules or deposit guarantees. Tokenized receivables may be treated as securities in some jurisdictions.",
                ],
                [
                  "The contract provides no legal recourse.",
                  "There is no arbitration, dispute resolution or debt collection mechanism. Any remedy would have to be pursued entirely outside the platform.",
                ],
                [
                  "Your history is permanent and public.",
                  "Payment records, defaults and invoice descriptions are written on-chain and cannot be edited or deleted by anyone, including you.",
                ],
                [
                  "Deploying to mainnet would not change any of this.",
                  "If this contract is ever deployed to BOT Chain Mainnet, every risk above still applies in exactly the same way.",
                ],
              ].map(([title, body]) => (
                <div key={title}>
                  <p className="text-sm font-medium mb-1">{title}</p>
                  <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <Callout tone="warn">
                If any part of this is unclear, do not use the platform with funds you cannot afford to
                lose.{" "}
                <Link to="/marketplace" className="underline underline-offset-2 hover:text-text-primary">
                  Browsing the marketplace
                </Link>{" "}
                requires no wallet and no funds.
              </Callout>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function P({ children }) {
  return <p className="text-sm text-text-secondary leading-relaxed">{children}</p>;
}

function Role({ title, children }) {
  return (
    <div>
      <p className="text-sm font-medium mb-1">{title}</p>
      <p className="text-sm text-text-secondary leading-relaxed">{children}</p>
    </div>
  );
}

/** A numeric example laid out as rows so the arithmetic can be followed line by line. */
function Worked({ title, rows }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p className="label">{title}</p>
      </div>
      <dl className="divide-border">
        {rows.map(([key, value]) => (
          <div key={key} className="row px-4 py-2.5">
            <dt>{key}</dt>
            <dd className="tabular font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
