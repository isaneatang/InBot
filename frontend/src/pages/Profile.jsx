import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isAddress } from "viem";
import InvoiceCard from "../components/InvoiceCard";
import TrustedBadge from "../components/TrustedBadge";
import {
  CardGridSkeleton,
  CopyButton,
  EmptyState,
  ErrorState,
  ExplorerLink,
  Icon,
  Money,
  Segmented,
  Skeleton,
  StatTile,
} from "../components/ui";
import { useAllInvoices, useCreditProfile, useCreditProfiles } from "../hooks/useInvoices";
import { useFactoryContract } from "../hooks/useInvoiceFactory";
import { useWallet } from "../hooks/useNetwork";
import { useQuery } from "@tanstack/react-query";
import { explorerAddressUrl, sameAddress, truncateAddress } from "../lib/format";
import { TRUSTED_MAX_DEFAULTS, TRUSTED_MIN_REPAID } from "../config/network";

export default function Profile() {
  const { address: raw } = useParams();
  const address = raw || "";
  const { address: connected } = useWallet();
  const c = useFactoryContract();
  const [tab, setTab] = useState("buyer");

  const valid = isAddress(address);
  const profile = useCreditProfile(valid ? address : undefined);
  const book = useAllInvoices();

  const asSeller = useMemo(
    () => (book.data || []).filter((inv) => sameAddress(inv.seller, address)),
    [book.data, address]
  );
  const asBuyer = useMemo(
    () => (book.data || []).filter((inv) => sameAddress(inv.buyer, address)),
    [book.data, address]
  );

  /** Investor positions for an arbitrary address, so anyone can research a counterparty. */
  const invested = useQuery({
    queryKey: ["profileInvested", address.toLowerCase(), book.data?.length ?? 0],
    enabled: valid && !!book.data,
    queryFn: async () => {
      const contributions = await Promise.all(
        book.data.map((inv) => c.investorContribution(inv.id, address).catch(() => 0n))
      );
      // An investor who already claimed has a zeroed contribution, so the invoice is also
      // counted when this address appears in its recorded investor list.
      const settled = await Promise.all(
        book.data.map(async (inv, i) => {
          if (contributions[i] > 0n) return { ...inv, contribution: contributions[i] };
          if (inv.status !== 3 && inv.status !== 4) return null;
          if (Number(inv.discountBps) === 0) return null;
          const list = await c.getInvestors(inv.id).catch(() => []);
          return list.some((a) => sameAddress(a, address)) ? { ...inv, contribution: 0n } : null;
        })
      );
      return settled.filter(Boolean);
    },
  });

  const counterparties = useMemo(
    () => [...asSeller, ...asBuyer, ...(invested.data || [])].flatMap((inv) => [inv.buyer, inv.seller]),
    [asSeller, asBuyer, invested.data]
  );
  const { data: profiles = {} } = useCreditProfiles(counterparties);

  if (!valid) {
    return (
      <EmptyState
        icon="alert"
        title="That is not a valid wallet address"
        body="Profile pages are addressed by a full 0x wallet address."
        action={
          <Link to="/marketplace" className="btn btn-outline">
            Back to marketplace
          </Link>
        }
      />
    );
  }

  if (profile.isError) {
    return <ErrorState error={profile.error} onRetry={profile.refetch} />;
  }

  const data = profile.data;
  const isSelf = sameAddress(connected, address);
  const remaining = Math.max(TRUSTED_MIN_REPAID - (data?.onTime ?? 0), 0);

  const tabs = [
    { key: "buyer", label: "As buyer", count: asBuyer.length },
    { key: "seller", label: "As seller", count: asSeller.length },
    { key: "investor", label: "As investor", count: invested.data?.length ?? 0 },
  ];

  const totals = {
    owed: asBuyer
      .filter((inv) => inv.status === 1 || inv.status === 2)
      .reduce((acc, inv) => acc + BigInt(inv.faceValue), 0n),
    issued: asSeller.reduce((acc, inv) => acc + BigInt(inv.faceValue), 0n),
    invested: (invested.data || []).reduce((acc, inv) => acc + BigInt(inv.contribution ?? 0n), 0n),
  };

  return (
    <div className="space-y-6">
      {/* Identity */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {profile.isLoading ? (
              <Skeleton className="h-8 w-48 mb-2" />
            ) : (
              <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                <h1 className="text-xl sm:text-2xl font-semibold break-all">
                  {data?.username || truncateAddress(address, 8, 6)}
                </h1>
                {data?.trusted && <TrustedBadge />}
                {isSelf && <span className="chip chip-neutral">This is you</span>}
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-xs sm:text-sm text-text-secondary break-all">{address}</span>
              <CopyButton value={address} label="" />
              <ExplorerLink path={explorerAddressUrl(address)} className="text-xs text-text-secondary">
                Explorer
              </ExplorerLink>
            </div>
          </div>

          {isSelf && (
            <Link to="/settings" className="btn btn-outline btn-sm flex-shrink-0">
              <Icon name="settings" size={13} />
              Manage
            </Link>
          )}
        </div>

        <p className="text-xs text-text-muted mt-4 leading-relaxed max-w-2xl">
          {data?.trusted ? (
            <>
              Trusted was granted automatically after at least {TRUSTED_MIN_REPAID} on-time repayments
              with no more than {TRUSTED_MAX_DEFAULTS} defaults. No person can grant or remove it.{" "}
              <Link to="/docs#trusted" className="underline underline-offset-2 hover:text-text-primary">
                How the badge works
              </Link>
              .
            </>
          ) : (
            <>
              This address has not earned the Trusted badge.{" "}
              {remaining > 0 && (
                <>
                  {remaining} more on-time repayment{remaining === 1 ? "" : "s"} would qualify it,
                  provided it records no defaults.{" "}
                </>
              )}
              <Link to="/docs#trusted" className="underline underline-offset-2 hover:text-text-primary">
                How the badge works
              </Link>
              .
            </>
          )}
        </p>
      </section>

      {/* Credit record. Stacks vertically on phones so the full labels are never cramped. */}
      <section>
        <h2 className="font-semibold mb-3">Credit record</h2>
        {profile.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatTile label="On-time payments" value={data?.onTime ?? 0} icon="check" />
            <StatTile label="Late payments" value={data?.late ?? 0} icon="clock" />
            <StatTile
              label="Defaults"
              value={data?.defaults ?? 0}
              tone={(data?.defaults ?? 0) > 0 ? "danger" : "default"}
              icon="alert"
            />
          </div>
        )}
      </section>

      {/* Activity totals */}
      {!book.isLoading && (
        <section className="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <div className="text-lg font-semibold">
              <Money value={totals.issued} />
            </div>
            <div className="stat-label">Total invoiced as seller</div>
          </div>
          <div>
            <div className="text-lg font-semibold" style={{ color: totals.owed > 0n ? "var(--color-accent-warn)" : undefined }}>
              <Money value={totals.owed} />
            </div>
            <div className="stat-label">Currently owed as buyer</div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              <Money value={totals.invested} />
            </div>
            <div className="stat-label">Open investment</div>
          </div>
        </section>
      )}

      {/* Role tabs, all three */}
      <section>
        <div className="mb-4">
          <Segmented items={tabs} value={tab} onChange={setTab} id="profile-roles" />
        </div>

        {book.isError ? (
          <ErrorState error={book.error} onRetry={book.refetch} />
        ) : book.isLoading ? (
          <CardGridSkeleton count={3} />
        ) : tab === "buyer" ? (
          <Grid
            invoices={asBuyer}
            profiles={profiles}
            counterparty="seller"
            empty={{
              title: "No invoices have been addressed to this wallet",
              body: "Nothing has been billed to this address, so it has no buyer history yet.",
            }}
          />
        ) : tab === "seller" ? (
          <Grid
            invoices={asSeller}
            profiles={profiles}
            counterparty="buyer"
            empty={{
              title: "This wallet has not issued any invoices",
              body: "It has never acted as a seller on this platform.",
            }}
          />
        ) : invested.isLoading ? (
          <CardGridSkeleton count={3} />
        ) : (
          <Grid
            invoices={invested.data || []}
            profiles={profiles}
            counterparty="both"
            empty={{
              title: "This wallet has not invested in any invoices",
              body: "It has never bought a share of a tokenized invoice.",
            }}
          />
        )}
      </section>
    </div>
  );
}

function Grid({ invoices, profiles, counterparty, empty }) {
  if (invoices.length === 0) {
    return <EmptyState icon="inbox" title={empty.title} body={empty.body} />;
  }
  return (
    <div className="grid-cards">
      {invoices.map((inv) => (
        <InvoiceCard key={inv.id} id={inv.id} invoice={inv} counterparty={counterparty} profiles={profiles} />
      ))}
    </div>
  );
}
