import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import TrustedBadge from "../components/TrustedBadge";
import TxButton, { useTransaction } from "../components/TxButton";
import InvoiceCard from "../components/InvoiceCard";
import {
  CardGridSkeleton,
  Callout,
  CopyButton,
  EmptyState,
  ExplorerLink,
  Icon,
  Money,
  PageHeader,
  Segmented,
  SectionHeading,
  Skeleton,
  StatTile,
} from "../components/ui";
import { useFactoryContract } from "../hooks/useInvoiceFactory";
import { useCreditProfiles, useRoleView } from "../hooks/useInvoices";
import { useNetworkSwitch, useWallet } from "../hooks/useNetwork";
import { explorerAddressUrl, truncateAddress } from "../lib/format";
import {
  ACTIVE_NETWORK,
  INVOICE_FACTORY_ADDRESS,
  TRUSTED_MAX_DEFAULTS,
  TRUSTED_MIN_REPAID,
  USERNAME_FEE_WEI,
} from "../config/network";

export default function Settings() {
  const { address, isConnected, onCorrectNetwork, profile, refetchProfile } = useWallet();
  const { switchNetwork } = useNetworkSwitch();
  const c = useFactoryContract();
  const view = useRoleView(address);
  const [username, setUsername] = useState("");
  const [tab, setTab] = useState("seller");

  const balances = useQuery({
    queryKey: ["balances", address?.toLowerCase()],
    enabled: !!address,
    queryFn: async () => {
      const [usdt, native] = await Promise.all([c.usdtBalance(address), c.nativeBalance(address)]);
      return { usdt, native };
    },
  });

  const claim = useTransaction({
    onConfirmed: async () => {
      await Promise.all([refetchProfile(), balances.refetch()]);
      setUsername("");
    },
  });

  const counterparties = useMemo(
    () =>
      [...view.asSeller, ...view.asBuyer, ...(view.positions?.invested || [])].flatMap((inv) => [
        inv.buyer,
        inv.seller,
      ]),
    [view.asSeller, view.asBuyer, view.positions]
  );
  const { data: profiles = {} } = useCreditProfiles(counterparties);

  if (!isConnected || !address) {
    return (
      <EmptyState
        icon="wallet"
        title="Connect your wallet to manage your account"
        body="Your username, credit record and activity history are all tied to a wallet address."
      />
    );
  }

  const hasUsername = (profile?.username?.length ?? 0) > 0;
  const trimmed = username.trim();
  const usernameError =
    trimmed.length === 0
      ? ""
      : trimmed.length > 32
        ? "Usernames are at most 32 characters."
        : !/^[a-zA-Z0-9_.-]+$/.test(trimmed)
          ? "Use letters, numbers, underscores, dots or hyphens only."
          : "";
  const usernameValid = trimmed.length >= 1 && !usernameError;
  const canAfford = (balances.data?.usdt ?? 0n) >= USERNAME_FEE_WEI;

  const tabs = [
    { key: "seller", label: "As seller", count: view.asSeller.length },
    { key: "buyer", label: "As buyer", count: view.asBuyer.length },
    { key: "investor", label: "As investor", count: view.positions?.invested.length ?? 0 },
  ];

  const activeList =
    tab === "seller" ? view.asSeller : tab === "buyer" ? view.asBuyer : view.positions?.invested || [];
  const activeCounterparty = tab === "seller" ? "buyer" : tab === "buyer" ? "seller" : "both";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Your account"
        subtitle="Your identity, balances and full history across every role."
        action={
          <Link to={`/profile/${address}`} className="btn btn-outline btn-sm">
            <Icon name="external" size={13} />
            Public view
          </Link>
        }
      />

      {/* Wallet and balances */}
      <section className="card p-5">
        <SectionHeading title="Wallet" className="mb-4" />
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="font-mono text-sm break-all">{address}</span>
          <CopyButton value={address} label="" />
          <ExplorerLink path={explorerAddressUrl(address)} className="text-xs text-text-secondary">
            Explorer
          </ExplorerLink>
        </div>

        {balances.isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="USDT balance"
              value={<Money value={balances.data?.usdt} />}
              icon="coins"
              hint="Used for payments, investments, stakes and the username fee"
            />
            <StatTile
              label={`${ACTIVE_NETWORK.nativeSymbol} balance`}
              value={
                <span className="tabular">
                  {(Number(balances.data?.native ?? 0n) / 1e18).toFixed(4)}
                </span>
              }
              tone={(balances.data?.native ?? 0n) === 0n ? "warn" : "default"}
              icon="activity"
              hint={
                (balances.data?.native ?? 0n) === 0n
                  ? "You need BOT to pay gas. Top up from the faucet."
                  : "Pays gas on every transaction"
              }
            />
          </div>
        )}

        {!onCorrectNetwork && (
          <div className="mt-4">
            <Callout tone="warn" title="Wrong network">
              Balances and actions read from {ACTIVE_NETWORK.label}.
              <button className="btn btn-outline btn-sm mt-3" onClick={switchNetwork}>
                Switch network
              </button>
            </Callout>
          </div>
        )}
      </section>

      {/* Username */}
      <section className="card p-5">
        <SectionHeading
          title="Username"
          description="A public display name, one per address, permanent once claimed."
          className="mb-4"
        />

        {hasUsername ? (
          <div className="panel p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-medium">{profile.username}</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Claimed permanently by this address. It cannot be changed or released.
                </p>
              </div>
              <span className="chip chip-primary">
                <Icon name="check" size={10} strokeWidth={3} />
                Claimed
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 min-w-0">
                <input
                  className={`input font-mono ${usernameError ? "input-error" : ""}`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your-name"
                  maxLength={32}
                  aria-label="Username"
                />
                {usernameError ? (
                  <p className="field-error mt-1">{usernameError}</p>
                ) : (
                  <p className="field-hint mt-1 tabular">{trimmed.length}/32 characters</p>
                )}
              </div>
              <TxButton
                block={false}
                state={claim.state}
                disabled={!usernameValid || !onCorrectNetwork || !canAfford}
                onClick={() =>
                  claim.execute("Claiming username", () =>
                    c.call("claimUsername", [trimmed], { approve: USERNAME_FEE_WEI })
                  )
                }
                pendingLabel="Claiming"
                confirmedLabel="Claimed"
                className="sm:w-auto sm:self-start"
                title={
                  !onCorrectNetwork
                    ? `Switch to ${ACTIVE_NETWORK.label}`
                    : !canAfford
                      ? "You need 1 USDT for the claim fee"
                      : undefined
                }
              >
                Claim for 1 USDT
              </TxButton>
            </div>

            {!canAfford && !balances.isLoading && (
              <p className="field-error">
                Claiming costs 1 USDT and this wallet holds <Money value={balances.data?.usdt} />.
              </p>
            )}

            <p className="text-xs text-text-muted leading-relaxed">
              The one-time 1 USDT fee discourages squatting. It does not buy privacy: your credit
              record is tied to your wallet address, not to your username, so claiming a new name
              cannot hide any history. The first transaction approves USDT spending, the second claims
              the name.
            </p>
          </div>
        )}
      </section>

      {/* Credit record as others see it */}
      <section className="card p-5">
        <SectionHeading
          title="Your credit record"
          description="This is exactly what any other user sees on your public profile."
          className="mb-4"
        />

        <div className="flex items-center gap-2.5 flex-wrap mb-4">
          <span className="font-medium">{profile?.username || truncateAddress(address, 8, 6)}</span>
          {profile?.trusted ? (
            <TrustedBadge small />
          ) : (
            <span className="chip chip-neutral">Not yet Trusted</span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatTile label="On-time" value={profile?.onTime ?? 0} />
          <StatTile label="Late" value={profile?.late ?? 0} />
          <StatTile
            label="Defaults"
            value={profile?.defaults ?? 0}
            tone={(profile?.defaults ?? 0) > 0 ? "danger" : "default"}
          />
        </div>

        <div className="mt-4">
          <Callout tone="warn" title="This record is permanent">
            Your payment history is written to the contract and cannot be altered or hidden by anyone,
            including you and including the deployer. Trusted is granted automatically after{" "}
            {TRUSTED_MIN_REPAID} on-time repayments with no more than {TRUSTED_MAX_DEFAULTS} defaults.
            There is no way to appeal, reset, or buy it.
          </Callout>
        </div>
      </section>

      {/* Full activity across all three roles */}
      <section>
        <SectionHeading
          title="Your activity"
          description="Every invoice this address touches, in each of the three roles."
          className="mb-4"
        />
        <div className="mb-4">
          <Segmented items={tabs} value={tab} onChange={setTab} id="settings-roles" />
        </div>

        {view.isLoading || (tab === "investor" && view.positionsLoading) ? (
          <CardGridSkeleton count={3} />
        ) : activeList.length === 0 ? (
          <EmptyState
            icon="inbox"
            title={
              tab === "seller"
                ? "You have not issued any invoices"
                : tab === "buyer"
                  ? "No invoices have been addressed to you"
                  : "You have not invested in any invoices"
            }
            body={
              tab === "seller"
                ? "Create one to start building a seller history."
                : tab === "buyer"
                  ? "A seller must issue an invoice to your address before it appears here."
                  : "Buy a share of a tokenized invoice on the marketplace to start a position."
            }
            action={
              tab === "seller" ? (
                <Link to="/create" className="btn btn-primary">
                  Create an invoice
                </Link>
              ) : tab === "investor" ? (
                <Link to="/marketplace" className="btn btn-primary">
                  Browse the marketplace
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="grid-cards">
            {activeList.map((inv) => (
              <InvoiceCard
                key={inv.id}
                id={inv.id}
                invoice={inv}
                counterparty={activeCounterparty}
                profiles={profiles}
                claimable={
                  tab === "seller"
                    ? view.positions?.sellerClaimable?.[inv.id]
                    : tab === "investor"
                      ? view.positions?.investorClaimable?.[inv.id]
                      : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Network reference */}
      <section className="card p-5">
        <SectionHeading title="Network" className="mb-4" />
        <dl className="space-y-2.5">
          <div className="row">
            <dt>Active network</dt>
            <dd>
              {ACTIVE_NETWORK.label} (chain {ACTIVE_NETWORK.chainId})
            </dd>
          </div>
          <div className="row">
            <dt>Factory contract</dt>
            <dd>
              <ExplorerLink path={explorerAddressUrl(INVOICE_FACTORY_ADDRESS)} className="font-mono text-xs">
                {truncateAddress(INVOICE_FACTORY_ADDRESS, 10, 8)}
              </ExplorerLink>
            </dd>
          </div>
          <div className="row">
            <dt>Payment token</dt>
            <dd>
              <ExplorerLink path={explorerAddressUrl(ACTIVE_NETWORK.usdtAddress)} className="font-mono text-xs">
                USDT {truncateAddress(ACTIVE_NETWORK.usdtAddress, 8, 6)}
              </ExplorerLink>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
