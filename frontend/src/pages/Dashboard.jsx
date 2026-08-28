import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import InvoiceCard from "../components/InvoiceCard";
import TrustedBadge from "../components/TrustedBadge";
import TxButton, { useTransaction } from "../components/TxButton";
import {
  CardGridSkeleton,
  Callout,
  EmptyState,
  ErrorState,
  Icon,
  Money,
  PageHeader,
  Segmented,
  SectionHeading,
  StatRowSkeleton,
  StatTile,
} from "../components/ui";
import { useCreditProfiles, useRoleView } from "../hooks/useInvoices";
import { useFactoryContract } from "../hooks/useInvoiceFactory";
import { useNetworkSwitch, useWallet } from "../hooks/useNetwork";
import { ACTIVE_NETWORK, TRUSTED_MIN_REPAID } from "../config/network";

export default function Dashboard() {
  const { address, isConnected, onCorrectNetwork, profile, refetchProfile } = useWallet();
  const { switchNetwork } = useNetworkSwitch();
  const c = useFactoryContract();
  const view = useRoleView(address);
  const [tab, setTab] = useState("seller");

  const counterparties = useMemo(() => {
    const set = [];
    for (const inv of [...view.asSeller, ...view.asBuyer, ...(view.positions?.invested || [])]) {
      set.push(inv.buyer, inv.seller);
    }
    return set;
  }, [view.asSeller, view.asBuyer, view.positions]);

  const { data: profiles = {} } = useCreditProfiles(counterparties);

  const refresh = async () => {
    await Promise.all([view.refetch(), view.refetchPositions(), refetchProfile()]);
  };

  const claimAll = useTransaction({ onConfirmed: refresh });

  if (!isConnected) {
    return (
      <EmptyState
        icon="wallet"
        title="Connect your wallet to see your dashboard"
        body="Your invoices, positions and claimable balances are derived from your address, so there is nothing to show until a wallet is connected."
        action={
          <Link to="/marketplace" className="btn btn-outline">
            Browse the marketplace instead
          </Link>
        }
      />
    );
  }

  if (view.isError) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState
          error={view.error}
          onRetry={view.refetch}
          wrongNetwork={!onCorrectNetwork}
          networkLabel={ACTIVE_NETWORK.label}
          onSwitchNetwork={switchNetwork}
        />
      </>
    );
  }

  const positions = view.positions;
  const totalClaimable = (positions?.totalInvestorClaimable ?? 0n) + (positions?.totalSellerClaimable ?? 0n);

  const tabs = [
    { key: "seller", label: "As seller", count: view.asSeller.length },
    { key: "buyer", label: "As buyer", count: view.asBuyer.length },
    { key: "investor", label: "As investor", count: positions?.invested.length ?? 0 },
  ];

  /** Claims every settled position in sequence, so a user with several is not clicking through each. */
  const runClaimAll = () =>
    claimAll.execute("Claiming all settled balances", async () => {
      const jobs = [
        ...Object.keys(positions?.sellerClaimable || {}).map((id) => ({ fn: "claimSellerShare", id })),
        ...Object.keys(positions?.investorClaimable || {}).map((id) => ({ fn: "claimInvestorShare", id })),
      ];
      let last = null;
      for (const job of jobs) {
        last = await c.call(job.fn, [BigInt(job.id)]);
      }
      return last;
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Every role this address holds, derived from on-chain activity."
        action={
          <>
            <button className="btn btn-outline btn-sm" onClick={refresh} title="Reload from chain">
              <Icon name="refresh" size={13} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <Link to="/create" className="btn btn-primary btn-sm">
              <Icon name="plus" size={14} />
              New invoice
            </Link>
          </>
        }
      />

      {/* Portfolio summary. Claimable leads because it is the only figure that needs an action. */}
      {view.isLoading || view.positionsLoading ? (
        <StatRowSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile
            label="Claimable now"
            value={<Money value={totalClaimable} animate />}
            tone={totalClaimable > 0n ? "primary" : "default"}
            icon="arrowDown"
            hint={totalClaimable > 0n ? "Settled funds waiting for you to withdraw" : "Nothing is settled and unclaimed"}
          />
          <StatTile
            label="Receivable outstanding"
            value={<Money value={view.outstanding.owedToSeller} />}
            icon="trend"
            hint="Face value of your unpaid invoices as seller"
          />
          <StatTile
            label="Payable outstanding"
            value={<Money value={view.outstanding.owedByBuyer} />}
            tone={view.outstanding.owedByBuyer > 0n ? "warn" : "default"}
            icon="arrowUp"
            hint="Face value you owe as buyer"
          />
          <StatTile
            label="Deployed as investor"
            value={<Money value={positions?.totalInvested ?? 0n} />}
            icon="coins"
            hint="Total you have paid into invoice shares"
          />
        </div>
      )}

      {totalClaimable > 0n && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-4 flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: "color-mix(in srgb, var(--color-primary) 32%, transparent)" }}
        >
          <div className="flex items-start gap-3 min-w-0">
            <span style={{ color: "var(--color-primary)" }} className="mt-0.5 flex-shrink-0">
              <Icon name="arrowDown" size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                <Money value={totalClaimable} /> is settled and ready to withdraw
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Across{" "}
                {Object.keys(positions?.sellerClaimable || {}).length +
                  Object.keys(positions?.investorClaimable || {}).length}{" "}
                invoice
                {Object.keys(positions?.sellerClaimable || {}).length +
                  Object.keys(positions?.investorClaimable || {}).length ===
                1
                  ? ""
                  : "s"}
                . Each claim is a separate transaction.
              </p>
            </div>
          </div>
          <TxButton
            state={claimAll.state}
            onClick={runClaimAll}
            disabled={!onCorrectNetwork}
            block={false}
            size="sm"
            pendingLabel="Claiming"
            confirmedLabel="Claimed"
            title={onCorrectNetwork ? undefined : `Switch to ${ACTIVE_NETWORK.label} to claim`}
          >
            Claim all
          </TxButton>
        </motion.div>
      )}

      {/* What needs doing next, ahead of the full lists. */}
      {view.actionable.length > 0 && (
        <section>
          <SectionHeading title="Needs your attention" className="mb-3" />
          <div className="card divide-border">
            {view.actionable.map(({ invoice, action, tone }) => (
              <Link
                key={`${invoice.id}-${action}`}
                to={`/invoice/${invoice.id}`}
                className="flex items-center gap-3 p-3.5 transition-colors hover:bg-surface-elevated first:rounded-t-[10px] last:rounded-b-[10px]"
              >
                <span
                  className="dot flex-shrink-0"
                  style={{ background: tone === "warn" ? "var(--color-accent-warn)" : "var(--color-primary)" }}
                />
                <span className="font-mono text-xs text-text-muted flex-shrink-0">#{invoice.id}</span>
                <span className="text-sm flex-1 min-w-0 truncate">{action}</span>
                <span className="text-sm tabular flex-shrink-0 hidden sm:inline">
                  <Money value={invoice.faceValue} />
                </span>
                <Icon name="chevronRight" size={14} className="text-text-muted flex-shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Own credit record, shown to the buyer role but relevant across all three. */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold">Your credit record</h2>
              {profile?.trusted && <TrustedBadge small />}
            </div>
            <p className="text-sm text-text-secondary max-w-lg leading-relaxed">
              Permanently tied to this wallet address. Nobody, including you, can alter or hide it.
              {!profile?.trusted && (
                <>
                  {" "}
                  {Math.max(TRUSTED_MIN_REPAID - (profile?.onTime ?? 0), 0)} more on-time repayment
                  {TRUSTED_MIN_REPAID - (profile?.onTime ?? 0) === 1 ? "" : "s"} earns the Trusted badge.
                </>
              )}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 w-full sm:w-auto sm:min-w-[16rem]">
            {[
              { label: "On-time", value: profile?.onTime ?? 0, danger: false },
              { label: "Late", value: profile?.late ?? 0, danger: false },
              { label: "Defaults", value: profile?.defaults ?? 0, danger: (profile?.defaults ?? 0) > 0 },
            ].map((cell) => (
              <div key={cell.label} className="panel px-3 py-2.5 text-center">
                <div
                  className="text-xl font-semibold tabular"
                  style={{ color: cell.danger ? "var(--color-danger)" : "var(--color-text-primary)" }}
                >
                  {cell.value}
                </div>
                <div className="text-xs text-text-secondary mt-0.5">{cell.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role tabs. Derived from data, never from a stored role choice. */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Segmented items={tabs} value={tab} onChange={setTab} id="dashboard-roles" />
          {tab === "seller" && view.asSeller.length > 0 && (
            <p className="text-xs text-text-secondary">
              Tokenize a confirmed invoice to raise cash before its due date.
            </p>
          )}
        </div>

        {view.isLoading ? (
          <CardGridSkeleton count={3} />
        ) : tab === "seller" ? (
          <RoleGrid
            invoices={view.asSeller}
            profiles={profiles}
            counterparty="buyer"
            claimable={positions?.sellerClaimable}
            empty={
              <EmptyState
                icon="inbox"
                title="You have not created any invoices yet"
                body="Issue an invoice to a buyer. Once they confirm it and set a due date, you can either wait for payment or tokenize it for cash now."
                action={
                  <Link to="/create" className="btn btn-primary">
                    <Icon name="plus" size={14} />
                    Create your first invoice
                  </Link>
                }
              />
            }
          />
        ) : tab === "buyer" ? (
          <RoleGrid
            invoices={view.asBuyer}
            profiles={profiles}
            counterparty="seller"
            empty={
              <EmptyState
                icon="inbox"
                title="No invoices are addressed to you yet"
                body="When a seller issues an invoice to this wallet address it will appear here for you to confirm, along with a due date you choose yourself."
                action={
                  <Link to="/docs#how-it-works" className="btn btn-outline">
                    How confirmation works
                  </Link>
                }
              />
            }
          />
        ) : (
          <RoleGrid
            invoices={positions?.invested || []}
            profiles={profiles}
            counterparty="both"
            claimable={positions?.investorClaimable}
            loading={view.positionsLoading}
            empty={
              <EmptyState
                icon="coins"
                title="You have not invested in any invoices yet"
                body="Tokenized invoices are sold at a discount to face value. Your return is the gap between what you pay and what the buyer repays."
                action={
                  <Link to="/marketplace" className="btn btn-primary">
                    <Icon name="store" size={14} />
                    Browse the marketplace
                  </Link>
                }
              />
            }
            footer={
              <Callout tone="warn" title="Investor risk">
                If a buyer defaults you recover only the seller's first-loss stake, split between
                investors. Where no stake was posted, you recover nothing. This is disclosed, priced
                into the discount, and not insured.
              </Callout>
            }
          />
        )}
      </section>
    </div>
  );
}

function RoleGrid({ invoices, profiles, counterparty, claimable = {}, empty, loading, footer }) {
  if (loading) return <CardGridSkeleton count={3} />;
  if (invoices.length === 0) return empty;

  return (
    <div className="space-y-4">
      <div className="grid-cards">
        {invoices.map((inv) => (
          <InvoiceCard
            key={inv.id}
            id={inv.id}
            invoice={inv}
            counterparty={counterparty}
            profiles={profiles}
            claimable={claimable[inv.id]}
            footnote={inv.contribution !== undefined ? `You paid $${Number(inv.contribution) / 1e6}` : undefined}
          />
        ))}
      </div>
      {footer}
    </div>
  );
}
