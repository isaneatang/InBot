import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import StatusStepper, { StatusChip } from "../components/StatusStepper";
import TrustedBadge from "../components/TrustedBadge";
import TxButton, { useTransaction } from "../components/TxButton";
import {
  AddressLink,
  Callout,
  CopyButton,
  CreditSummary,
  EmptyState,
  ExplorerLink,
  FundingMeter,
  Icon,
  Money,
  Skeleton,
} from "../components/ui";
import { useFactoryContract } from "../hooks/useInvoiceFactory";
import { useCreditProfile, useInvoice } from "../hooks/useInvoices";
import { useNetworkSwitch, useWallet } from "../hooks/useNetwork";
import {
  dayOffsetTimestamp,
  explorerAddressUrl,
  formatBps,
  formatDateTime,
  fromDateInputValue,
  parseUnits,
  relativeDue,
  sameAddress,
  toDateInputValue,
} from "../lib/format";
import {
  ACTIVE_NETWORK,
  MAX_DISCOUNT_BPS,
  MIN_DISCOUNT_BPS,
  PLATFORM_FEE_BPS,
} from "../config/network";

const DISCOUNT_PRESETS = [5000, 6000, 7000, 7500, 8000, 8500, 9000, 9500, 9900];
const TERM_PRESETS = [7, 14, 30, 60, 90];

export default function InvoiceDetail() {
  const { id } = useParams();
  const invoiceId = Number(id);
  const { address, isConnected, onCorrectNetwork, canWrite } = useWallet();
  const { switchNetwork } = useNetworkSwitch();
  const c = useFactoryContract();

  const invoiceQuery = useInvoice(invoiceId);
  const inv = invoiceQuery.data;

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    await Promise.all([invoiceQuery.refetch(), position.refetch(), investors.refetch()]);
  };
  const tx = useTransaction({ onConfirmed: refresh });

  const buyerProfile = useCreditProfile(inv?.buyer);
  const sellerProfile = useCreditProfile(inv?.seller);

  const position = useQuery({
    queryKey: ["position", id, address?.toLowerCase()],
    enabled: !!inv && !!address,
    queryFn: async () => {
      const [contribution, percentage, claimable] = await Promise.all([
        c.investorContribution(invoiceId, address),
        c.investorPercentage(invoiceId, address),
        c.claimableInvestorShare(invoiceId, address),
      ]);
      return { contribution, percentageBps: Number(percentage), claimable, hasInvested: contribution > 0n };
    },
  });

  const investors = useQuery({
    queryKey: ["investors", id],
    enabled: !!inv && Number(inv.discountBps) > 0,
    queryFn: async () => {
      const addresses = await c.getInvestors(invoiceId);
      const rows = await Promise.all(
        addresses.map(async (who) => ({
          address: who,
          percentageBps: Number(await c.investorPercentage(invoiceId, who).catch(() => 0n)),
        }))
      );
      return rows;
    },
  });

  const sellerClaimable = useQuery({
    queryKey: ["sellerClaimable", id],
    enabled: !!inv && (inv.status === 3 || inv.status === 4),
    queryFn: () => c.claimableSellerShare(invoiceId),
  });

  if (Number.isNaN(invoiceId)) {
    return <EmptyState icon="alert" title="That is not a valid invoice id" action={<Link to="/marketplace" className="btn btn-outline">Back to marketplace</Link>} />;
  }

  if (invoiceQuery.isLoading) return <DetailSkeleton />;

  if (invoiceQuery.isError || !inv) {
    return (
      <EmptyState
        icon="alert"
        title={`Invoice #${invoiceId} could not be loaded`}
        body="It may not exist on this network, or the RPC endpoint did not respond. Invoice ids start at 0."
        action={
          <button className="btn btn-outline" onClick={invoiceQuery.refetch}>
            <Icon name="refresh" size={14} />
            Try again
          </button>
        }
      />
    );
  }

  const status = inv.status;
  const isBuyer = sameAddress(address, inv.buyer);
  const isSeller = sameAddress(address, inv.seller);
  const overdue = status !== 3 && status !== 4 && Number(inv.dueDate) > 0 && now > Number(inv.dueDate);
  const fullySold = Number(inv.totalSoldPercentageBps) >= 10000;
  const wasTokenized = Number(inv.discountBps) > 0;
  const due = relativeDue(inv.dueDate, now);

  const fee = (BigInt(inv.faceValue) * BigInt(PLATFORM_FEE_BPS)) / 10000n;
  const remainingBps = 10000 - Number(inv.totalSoldPercentageBps);
  const remainingCost = wasTokenized
    ? (BigInt(inv.faceValue) * BigInt(remainingBps) * BigInt(inv.discountBps)) / 100000000n
    : 0n;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-semibold font-mono">Invoice #{invoiceId}</h1>
            <StatusChip status={status} size="lg" />
            {Number(inv.stakedAmount) > 0 && (
              <span className="chip chip-primary">
                <Icon name="coins" size={11} strokeWidth={2.5} />
                Staked
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1.5">
            Created {formatDateTime(inv.createdAt)}
          </p>
        </div>
        <button className="btn btn-outline btn-sm flex-shrink-0" onClick={refresh}>
          <Icon name="refresh" size={13} />
          Refresh
        </button>
      </div>

      {/* On mobile the stepper and actions stack; from lg they sit side by side. */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {/* Progress and headline figures */}
          <section className="card p-5">
            <StatusStepper invoice={inv} />

            <div className="grid grid-cols-2 gap-4 mt-7 pt-5" style={{ borderTop: "1px solid var(--color-border)" }}>
              <div>
                <p className="label mb-1">Face value</p>
                <p className="text-2xl font-semibold tracking-tight">
                  <Money value={inv.faceValue} />
                </p>
                <p className="text-xs text-text-muted mt-1">
                  Platform fee <Money value={fee} /> at {(PLATFORM_FEE_BPS / 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="label mb-1">{status === 4 ? "Recovery pool" : "Repaid, net of fee"}</p>
                <p className="text-2xl font-semibold tracking-tight" style={{ color: status === 4 ? "var(--color-danger)" : undefined }}>
                  <Money value={inv.repaidAmount} animate />
                </p>
                {status === 4 && (
                  <p className="text-xs text-text-muted mt-1">
                    {inv.stakeConsumed ? "Seller stake, shared between investors" : "Nothing recovered"}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5">
              <p className="label mb-1.5">Description</p>
              <p className="text-sm leading-relaxed">{inv.description || "No description was provided."}</p>
            </div>
          </section>

          {/* Countdown */}
          <Countdown due={due} status={status} dueDate={inv.dueDate} />

          {/* Funding, only once tokenized */}
          {wasTokenized && (
            <section className="card p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="font-semibold">Funding</h2>
                <span className="chip chip-neutral">
                  Sold at {formatBps(inv.discountBps)} of face
                </span>
              </div>

              <FundingMeter
                soldBps={inv.totalSoldPercentageBps}
                label="Sold to investors"
                remaining={status === 2 ? remainingCost : undefined}
              />

              <dl className="mt-5 space-y-2.5">
                <div className="row">
                  <dt>Investors pay per 100 of face</dt>
                  <dd className="tabular">{formatBps(inv.discountBps)}</dd>
                </div>
                <div className="row">
                  <dt>Implied gross yield if repaid</dt>
                  <dd className="tabular" style={{ color: "var(--color-primary)" }}>
                    {(((10000 / Number(inv.discountBps)) - 1) * 100).toFixed(2)}%
                  </dd>
                </div>
                <div className="row">
                  <dt>Seller first-loss stake</dt>
                  <dd className="tabular">
                    {Number(inv.stakedAmount) > 0 ? <Money value={inv.stakedAmount} /> : "None posted"}
                  </dd>
                </div>
                {Number(inv.stakedAmount) > 0 && (
                  <div className="row">
                    <dt>Stake status</dt>
                    <dd>
                      {inv.stakeConsumed ? (
                        <span style={{ color: "var(--color-danger)" }}>Consumed to cover investors</span>
                      ) : status === 3 ? (
                        "Returned to seller on claim"
                      ) : (
                        "Locked in the contract"
                      )}
                    </dd>
                  </div>
                )}
              </dl>

              {Number(inv.stakedAmount) === 0 && status === 2 && (
                <div className="mt-4">
                  <Callout tone="warn" title="No first-loss stake on this invoice">
                    If the buyer defaults, investors recover nothing. The discount is the only
                    compensation for that risk.
                  </Callout>
                </div>
              )}
            </section>
          )}

          {/* Parties */}
          <section className="card p-5">
            <h2 className="font-semibold mb-4">Parties</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Party
                role="Seller"
                address={inv.seller}
                profile={sellerProfile.data}
                loading={sellerProfile.isLoading}
                isYou={isSeller}
              />
              <Party
                role="Buyer"
                address={inv.buyer}
                profile={buyerProfile.data}
                loading={buyerProfile.isLoading}
                isYou={isBuyer}
                note="The buyer owes the face value. Their record is the main thing an investor is pricing."
              />
            </div>
          </section>

          {/* Investors */}
          {wasTokenized && (
            <section className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Investors</h2>
                <span className="text-sm text-text-secondary tabular">
                  {investors.data?.length ?? 0}
                </span>
              </div>
              {investors.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ) : (investors.data || []).length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Nobody has invested in this invoice yet. The full share is still available.
                </p>
              ) : (
                <ul className="space-y-1">
                  {investors.data.map((row) => (
                    <li key={row.address} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="flex items-center gap-2 min-w-0">
                        <AddressLink address={row.address} className="text-sm" />
                        {sameAddress(row.address, address) && (
                          <span className="chip chip-primary">You</span>
                        )}
                      </span>
                      <span className="tabular text-text-secondary flex-shrink-0">
                        {row.percentageBps === 0 ? "Claimed" : `${formatBps(row.percentageBps)} of face`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Ledger */}
          <section className="card p-5">
            <h2 className="font-semibold mb-4">Record</h2>
            <dl className="space-y-2.5">
              <div className="row">
                <dt>Created</dt>
                <dd className="tabular">{formatDateTime(inv.createdAt)}</dd>
              </div>
              <div className="row">
                <dt>Confirmed by buyer</dt>
                <dd className="tabular">{Number(inv.confirmedAt) > 0 ? formatDateTime(inv.confirmedAt) : "Not yet"}</dd>
              </div>
              <div className="row">
                <dt>Due date</dt>
                <dd className="tabular">{Number(inv.dueDate) > 0 ? formatDateTime(inv.dueDate) : "Set at confirmation"}</dd>
              </div>
              <div className="row">
                <dt>Claims settled</dt>
                <dd className="tabular">{Number(inv.claimsMade)}</dd>
              </div>
              <div className="row">
                <dt>Contract</dt>
                <dd>
                  <ExplorerLink path={explorerAddressUrl(ACTIVE_NETWORK.usdtAddress)} className="font-mono text-xs">
                    USDT
                  </ExplorerLink>
                </dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Action panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="lg:sticky lg:top-20 space-y-6">
            <ActionPanel
              inv={inv}
              invoiceId={invoiceId}
              now={now}
              isBuyer={isBuyer}
              isSeller={isSeller}
              isConnected={isConnected}
              canWrite={canWrite}
              onCorrectNetwork={onCorrectNetwork}
              switchNetwork={switchNetwork}
              overdue={overdue}
              fullySold={fullySold}
              remainingBps={remainingBps}
              remainingCost={remainingCost}
              position={position.data}
              sellerClaimable={sellerClaimable.data}
              tx={tx}
              c={c}
            />

            {position.data?.hasInvested && (
              <section className="card p-5">
                <h2 className="font-semibold mb-4">Your position</h2>
                <dl className="space-y-2.5">
                  <div className="row">
                    <dt>You paid</dt>
                    <dd className="tabular">
                      <Money value={position.data.contribution} />
                    </dd>
                  </div>
                  <div className="row">
                    <dt>Share of face value</dt>
                    <dd className="tabular">{formatBps(position.data.percentageBps)}</dd>
                  </div>
                  <div className="row">
                    <dt>Face value entitlement</dt>
                    <dd className="tabular">
                      <Money
                        value={(BigInt(inv.faceValue) * BigInt(position.data.percentageBps)) / 10000n}
                      />
                    </dd>
                  </div>
                  {position.data.claimable > 0n && (
                    <div className="row" style={{ color: "var(--color-primary)" }}>
                      <dt style={{ color: "inherit" }}>Claimable now</dt>
                      <dd className="tabular font-semibold">
                        <Money value={position.data.claimable} />
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Countdown                                                                 */
/* ------------------------------------------------------------------------- */

function Countdown({ due, status, dueDate }) {
  if (Number(dueDate) === 0) {
    return (
      <section className="card p-5">
        <p className="label mb-2">Repayment deadline</p>
        <p className="text-sm text-text-secondary">
          The buyer sets the due date when they confirm this invoice. Until then it cannot be paid or
          tokenized.
        </p>
      </section>
    );
  }

  if (status === 3) {
    return (
      <section className="card p-5" style={{ borderColor: "color-mix(in srgb, var(--color-primary) 30%, transparent)" }}>
        <div className="flex items-center gap-2.5">
          <span style={{ color: "var(--color-primary)" }}>
            <Icon name="check" size={17} strokeWidth={2.5} />
          </span>
          <div>
            <p className="text-sm font-medium">Repaid in full</p>
            <p className="text-xs text-text-secondary mt-0.5">Settled before the due date.</p>
          </div>
        </div>
      </section>
    );
  }

  if (status === 4) {
    return (
      <section className="card p-5" style={{ borderColor: "color-mix(in srgb, var(--color-danger) 32%, transparent)" }}>
        <div className="flex items-center gap-2.5">
          <span style={{ color: "var(--color-danger)" }}>
            <Icon name="alert" size={17} />
          </span>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--color-danger)" }}>
              Defaulted
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              The due date passed without repayment. This is recorded permanently against the buyer.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const color =
    due.urgency === "overdue"
      ? "var(--color-danger)"
      : due.urgency === "urgent"
        ? "var(--color-accent-warn)"
        : "var(--color-text-primary)";

  const cells = due.parts
    ? [
        { value: due.parts.days, label: "days" },
        { value: due.parts.hours, label: "hours" },
        { value: due.parts.minutes, label: "min" },
        { value: due.parts.seconds, label: "sec" },
      ]
    : null;

  return (
    <section
      className="card p-5"
      style={due.overdue ? { borderColor: "color-mix(in srgb, var(--color-danger) 32%, transparent)" } : undefined}
    >
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="label">Time until due</p>
        <span className="text-xs" style={{ color }}>
          {due.label}
        </span>
      </div>

      {cells ? (
        <div className="grid grid-cols-4 gap-2">
          {cells.map((cell) => (
            <div key={cell.label} className="panel py-2.5 text-center">
              <div className="text-xl font-semibold tabular" style={{ color }}>
                {String(cell.value).padStart(2, "0")}
              </div>
              <div className="text-[0.625rem] uppercase tracking-wide text-text-secondary mt-0.5">
                {cell.label}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-lg font-semibold" style={{ color }}>
          {due.label}
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------------- */
/* Party                                                                     */
/* ------------------------------------------------------------------------- */

function Party({ role, address, profile, loading, isYou, note }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <p className="label">{role}</p>
        {isYou && <span className="chip chip-primary">You</span>}
        {profile?.trusted && <TrustedBadge small />}
      </div>

      <div className="flex items-center gap-1 mb-1">
        <AddressLink address={address} username={profile?.username} className="text-sm font-medium" />
      </div>
      <div className="flex items-center gap-1 mb-3">
        <span className="font-mono text-xs text-text-muted break-all">{address}</span>
        <CopyButton value={address} label="" className="flex-shrink-0" />
      </div>

      {loading ? <Skeleton className="h-14 w-full" /> : <CreditSummary profile={profile} size="sm" />}

      {note && <p className="text-xs text-text-muted mt-2.5 leading-snug">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Action panel                                                              */
/* ------------------------------------------------------------------------- */

function ActionPanel({
  inv,
  invoiceId,
  now,
  isBuyer,
  isSeller,
  isConnected,
  canWrite,
  onCorrectNetwork,
  switchNetwork,
  overdue,
  fullySold,
  remainingBps,
  remainingCost,
  position,
  sellerClaimable,
  tx,
  c,
}) {
  const status = inv.status;

  // Buyers pick their own repayment deadline. Defaulting to 30 days out is a starting point,
  // never a value silently committed on their behalf.
  const [dueDateInput, setDueDateInput] = useState(() => toDateInputValue(dayOffsetTimestamp(30)));
  const [discount, setDiscount] = useState(8500);
  const [stake, setStake] = useState("");
  const [investAmount, setInvestAmount] = useState("");

  const dueTimestamp = fromDateInputValue(dueDateInput);
  const dueValid = dueTimestamp > now;

  const stakeWei = parseUnits(stake);
  const investWei = parseUnits(investAmount);

  const proceeds = useMemo(
    () => (BigInt(inv.faceValue) * BigInt(discount)) / 10000n,
    [inv.faceValue, discount]
  );

  /** Previewed against the contract so the figure shown cannot drift from what is recorded. */
  const quote = useQuery({
    queryKey: ["quote", invoiceId, investWei.toString()],
    enabled: status === 2 && investWei > 0n,
    queryFn: () => c.quoteInvestment(invoiceId, investWei),
  });

  const quotedBps = Number(quote.data ?? 0);
  const investTooLarge = quotedBps > remainingBps;
  const faceEntitlement = (BigInt(inv.faceValue) * BigInt(quotedBps)) / 10000n;
  const investValid = investWei > 0n && quotedBps > 0 && !investTooLarge;

  if (!isConnected) {
    return (
      <section className="card p-5">
        <h2 className="font-semibold mb-2">Actions</h2>
        <p className="text-sm text-text-secondary">
          Connect a wallet to confirm, pay, tokenize, invest in or claim from this invoice. Everything
          on this page is readable without connecting.
        </p>
      </section>
    );
  }

  const gate = !onCorrectNetwork;
  const gateNote = gate ? `Switch to ${ACTIVE_NETWORK.label} to sign` : undefined;

  const actions = [];

  if (status === 0 && isBuyer) {
    actions.push({
      key: "confirm",
      label: "Confirm and set due date",
      valid: dueValid,
      form: (
        <div className="space-y-3">
          <div>
            <label htmlFor="due-date" className="label mb-1.5">
              Repayment due date
            </label>
            <input
              id="due-date"
              type="date"
              className={`input ${dueDateInput && !dueValid ? "input-error" : ""}`}
              value={dueDateInput}
              min={toDateInputValue(dayOffsetTimestamp(0))}
              onChange={(e) => setDueDateInput(e.target.value)}
            />
            {dueDateInput && !dueValid ? (
              <p className="field-error mt-1">Pick a date in the future.</p>
            ) : (
              <p className="field-hint mt-1">
                Falls due at 23:59 local time. You choose this, not the seller, and it cannot be
                changed afterwards.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TERM_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setDueDateInput(toDateInputValue(dayOffsetTimestamp(days)))}
              >
                {days}d
              </button>
            ))}
          </div>
          <Callout tone="warn">
            Confirming makes this invoice binding on-chain and lets the seller tokenize it. Missing the
            date you set records a default against your address permanently.
          </Callout>
        </div>
      ),
      run: () => c.call("confirmInvoice", [BigInt(invoiceId), BigInt(dueTimestamp)]),
    });
  }

  if (status === 1 && isBuyer && !overdue) {
    actions.push({
      key: "pay",
      label: "Pay in full",
      valid: true,
      form: (
        <dl className="panel p-3 space-y-2 mb-3">
          <div className="row">
            <dt>You pay</dt>
            <dd className="tabular font-medium">
              <Money value={inv.faceValue} />
            </dd>
          </div>
          <div className="row">
            <dt>Approval needed</dt>
            <dd className="text-xs text-text-secondary">USDT spend, once per wallet</dd>
          </div>
        </dl>
      ),
      run: () => c.call("payDirect", [BigInt(invoiceId)], { approve: BigInt(inv.faceValue) }),
    });
  }

  if (status === 1 && isSeller && !overdue) {
    actions.push({
      key: "tokenize",
      label: "Tokenize this invoice",
      valid: discount >= MIN_DISCOUNT_BPS && discount <= MAX_DISCOUNT_BPS,
      form: (
        <div className="space-y-3">
          <div>
            <label htmlFor="discount" className="label mb-1.5">
              Price investors pay, as a share of face
            </label>
            <select
              id="discount"
              className="input"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
            >
              {DISCOUNT_PRESETS.map((d) => (
                <option key={d} value={d}>
                  {d / 100}% of face value
                </option>
              ))}
            </select>
            <p className="field-hint mt-1">
              A lower price raises less cash but fills faster, because the investor yield is higher.
            </p>
          </div>

          <div>
            <label htmlFor="stake" className="label mb-1.5">
              First-loss stake, optional
            </label>
            <input
              id="stake"
              type="text"
              inputMode="decimal"
              className="input tabular"
              placeholder="0.00"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
            />
            <p className="field-hint mt-1">
              Locked USDT that goes to investors if the buyer defaults. Returned in full if they pay.
            </p>
          </div>

          <dl className="panel p-3 space-y-2">
            <div className="row">
              <dt>Raised if fully subscribed</dt>
              <dd className="tabular font-medium">
                <Money value={proceeds} />
              </dd>
            </div>
            <div className="row">
              <dt>Cost of the discount</dt>
              <dd className="tabular">
                <Money value={BigInt(inv.faceValue) - proceeds} />
              </dd>
            </div>
            {stakeWei > 0n && (
              <div className="row">
                <dt>Locked as stake now</dt>
                <dd className="tabular">
                  <Money value={stakeWei} />
                </dd>
              </div>
            )}
          </dl>
        </div>
      ),
      run: () =>
        c.call("tokenizeInvoice", [BigInt(invoiceId), BigInt(discount), stakeWei], { approve: stakeWei }),
    });
  }

  if (status === 2 && isBuyer && !overdue) {
    actions.push({
      key: "repay",
      label: "Repay in full",
      valid: true,
      form: (
        <dl className="panel p-3 space-y-2 mb-3">
          <div className="row">
            <dt>You pay</dt>
            <dd className="tabular font-medium">
              <Money value={inv.faceValue} />
            </dd>
          </div>
          <div className="row">
            <dt>Distributed to</dt>
            <dd className="text-xs text-text-secondary">Investors and the seller, by share</dd>
          </div>
        </dl>
      ),
      run: () => c.call("repayTokenized", [BigInt(invoiceId)], { approve: BigInt(inv.faceValue) }),
    });
  }

  if (status === 2 && !fullySold && !overdue && !isBuyer) {
    actions.push({
      key: "invest",
      label: "Invest",
      valid: investValid,
      form: (
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="invest" className="label">
                Amount to invest, USDT
              </label>
              <button
                type="button"
                className="text-xs hover:underline"
                style={{ color: "var(--color-primary)" }}
                onClick={() => setInvestAmount((Number(remainingCost) / 1e6).toFixed(2))}
              >
                Fund the rest
              </button>
            </div>
            <input
              id="invest"
              type="text"
              inputMode="decimal"
              className={`input tabular ${investTooLarge ? "input-error" : ""}`}
              placeholder="0.00"
              value={investAmount}
              onChange={(e) => setInvestAmount(e.target.value)}
            />
            {investTooLarge ? (
              <p className="field-error mt-1">
                That is more than the {formatBps(remainingBps)} still available.
              </p>
            ) : (
              <p className="field-hint mt-1">
                <Money value={remainingCost} /> would buy the remaining {formatBps(remainingBps)}.
              </p>
            )}
          </div>

          {investWei > 0n && !investTooLarge && quotedBps > 0 && (
            <motion.dl
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel p-3 space-y-2"
            >
              <div className="row">
                <dt>Share of face value bought</dt>
                <dd className="tabular font-medium">{formatBps(quotedBps)}</dd>
              </div>
              <div className="row">
                <dt>You receive if repaid</dt>
                <dd className="tabular font-medium" style={{ color: "var(--color-primary)" }}>
                  <Money value={(faceEntitlement * (10000n - BigInt(PLATFORM_FEE_BPS))) / 10000n} />
                </dd>
              </div>
              <div className="row">
                <dt>Gross return</dt>
                <dd className="tabular" style={{ color: "var(--color-primary)" }}>
                  {(
                    (Number((faceEntitlement * (10000n - BigInt(PLATFORM_FEE_BPS))) / 10000n) /
                      Number(investWei) -
                      1) *
                    100
                  ).toFixed(2)}
                  %
                </dd>
              </div>
              <div className="row">
                <dt>Recovery if buyer defaults</dt>
                <dd className="tabular" style={{ color: Number(inv.stakedAmount) > 0 ? undefined : "var(--color-danger)" }}>
                  {Number(inv.stakedAmount) > 0 ? "Share of the stake" : "Nothing"}
                </dd>
              </div>
            </motion.dl>
          )}
        </div>
      ),
      run: () => c.call("invest", [BigInt(invoiceId), investWei], { approve: investWei }),
    });
  }

  if ((status === 1 || status === 2) && overdue) {
    actions.push({
      key: "default",
      label: "Record the default",
      valid: true,
      variant: "danger",
      form: (
        <Callout tone="danger" title="This is permanent">
          Anyone may record a default once the due date has passed, because it only writes down a fact
          already true on-chain. It marks the buyer's record and, where the invoice was tokenized with
          a stake, releases that stake to investors.
        </Callout>
      ),
      run: () => c.call("markDefault", [BigInt(invoiceId)]),
    });
  }

  if (status === 3 && isSeller && !inv.sellerHasClaimed) {
    actions.push({
      key: "sellerClaim",
      label: "Claim your share",
      valid: true,
      form:
        sellerClaimable !== undefined ? (
          <dl className="panel p-3 space-y-2 mb-3">
            <div className="row">
              <dt>Claimable</dt>
              <dd className="tabular font-medium" style={{ color: "var(--color-primary)" }}>
                <Money value={sellerClaimable} />
              </dd>
            </div>
            <div className="row">
              <dt>Unsold share of face</dt>
              <dd className="tabular">{formatBps(10000 - Number(inv.totalSoldPercentageBps))}</dd>
            </div>
          </dl>
        ) : null,
      run: () => c.call("claimSellerShare", [BigInt(invoiceId)]),
    });
  }

  if (status === 4 && isSeller && !inv.stakeConsumed && Number(inv.stakedAmount) > 0 && !inv.sellerHasClaimed) {
    actions.push({
      key: "stakeBack",
      label: "Reclaim your stake",
      valid: true,
      form: (
        <p className="text-sm text-text-secondary mb-3">
          Nobody invested in this invoice, so your stake was never needed to protect anyone. It
          returns to you in full.
        </p>
      ),
      run: () => c.call("claimSellerShare", [BigInt(invoiceId)]),
    });
  }

  if ((status === 3 || status === 4) && position?.claimable > 0n) {
    actions.push({
      key: "investorClaim",
      label: status === 4 ? "Claim from the stake" : "Claim your return",
      valid: true,
      form: (
        <dl className="panel p-3 space-y-2 mb-3">
          <div className="row">
            <dt>Claimable</dt>
            <dd className="tabular font-medium" style={{ color: "var(--color-primary)" }}>
              <Money value={position.claimable} />
            </dd>
          </div>
          <div className="row">
            <dt>Against a contribution of</dt>
            <dd className="tabular">
              <Money value={position.contribution} />
            </dd>
          </div>
        </dl>
      ),
      run: () => c.call("claimInvestorShare", [BigInt(invoiceId)]),
    });
  }

  return (
    <section className="card p-5">
      <h2 className="font-semibold mb-4">Actions</h2>

      {gate && (
        <div className="mb-4">
          <Callout tone="warn" title="Wrong network">
            Signing is blocked while your wallet is on another chain.
            <button className="btn btn-outline btn-sm mt-3" onClick={switchNetwork}>
              Switch to {ACTIVE_NETWORK.label}
            </button>
          </Callout>
        </div>
      )}

      {actions.length === 0 ? (
        <NoActions
          status={status}
          isBuyer={isBuyer}
          isSeller={isSeller}
          overdue={overdue}
          fullySold={fullySold}
          hasClaimed={inv.sellerHasClaimed}
        />
      ) : (
        <div className="space-y-6">
          {actions.map((action, index) => (
            <div key={action.key} className={index > 0 ? "pt-6" : ""} style={index > 0 ? { borderTop: "1px solid var(--color-border)" } : undefined}>
              {action.form}
              <TxButton
                className={action.form ? "mt-3" : ""}
                state={tx.state}
                variant={action.variant || "primary"}
                disabled={gate || !action.valid || tx.isPending}
                title={gateNote}
                onClick={() => tx.execute(action.label, action.run)}
                pendingLabel="Waiting for chain"
              >
                {action.label}
              </TxButton>
            </div>
          ))}
        </div>
      )}

      <SweepDust inv={inv} invoiceId={invoiceId} c={c} tx={tx} gate={gate} />
    </section>
  );
}

/** Explains why nothing is available rather than showing an empty panel. */
function NoActions({ status, isBuyer, isSeller, overdue, fullySold, hasClaimed }) {
  let message;
  if (status === 0 && !isBuyer) message = "Waiting for the buyer to confirm this invoice and set a due date.";
  else if (status === 1 && !isBuyer && !isSeller) message = "This invoice is confirmed but has not been tokenized, so there is nothing to invest in.";
  else if (status === 2 && fullySold) message = "This invoice is fully subscribed. No further investment is possible.";
  else if (status === 2 && overdue) message = "The due date has passed. Anyone can now record the default.";
  else if (status === 3 && isSeller && hasClaimed) message = "You have already claimed your share of this invoice.";
  else if (status === 3) message = "This invoice is settled. Only investors and the seller with an unclaimed balance can act.";
  else if (status === 4) message = "This invoice defaulted. There is nothing further for you to claim.";
  else message = "Nothing is available for your role at this stage.";

  return <p className="text-sm text-text-secondary">{message}</p>;
}

/**
 * Dust sweep. Only surfaced when there is genuinely something to sweep, so it does not read
 * like an admin control sitting on every settled invoice.
 */
function SweepDust({ inv, invoiceId, c, tx, gate }) {
  const dust = useQuery({
    queryKey: ["dust", invoiceId, Number(inv.claimsMade)],
    enabled: inv.status === 3 || inv.status === 4,
    queryFn: () => c.sweepableDust(invoiceId),
  });

  if (!dust.data || dust.data === 0n) return null;

  return (
    <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--color-border)" }}>
      <p className="label mb-1.5">Leftover dust</p>
      <p className="text-xs text-text-secondary mb-3 leading-relaxed">
        Integer division left <Money value={dust.data} /> unallocated after every claim settled.
        Anyone may sweep it to the fee recipient. This cannot run while a claim is outstanding and can
        only ever move rounding remainders.
      </p>
      <TxButton
        state={tx.state}
        variant="outline"
        size="sm"
        disabled={gate}
        onClick={() => tx.execute("Sweeping dust", () => c.call("sweepDust", [BigInt(invoiceId)]))}
      >
        Sweep <Money value={dust.data} />
      </TxButton>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          <div className="card p-5">
            <Skeleton className="h-5 w-full mb-7" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>
          <div className="card p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="card p-5">
            <Skeleton className="h-5 w-24 mb-4" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
