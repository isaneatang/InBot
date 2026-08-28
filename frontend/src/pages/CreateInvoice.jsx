import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAddress } from "viem";
import { useQuery } from "@tanstack/react-query";
import TxButton, { useTransaction } from "../components/TxButton";
import TrustedBadge from "../components/TrustedBadge";
import { Callout, CreditSummary, EmptyState, Icon, Money, PageHeader, Skeleton } from "../components/ui";
import { useFactoryContract } from "../hooks/useInvoiceFactory";
import { useNetworkSwitch, useWallet } from "../hooks/useNetwork";
import { formatMoneyFixed, parseUnits, sameAddress } from "../lib/format";
import { ACTIVE_NETWORK, PLATFORM_FEE_BPS } from "../config/network";

const MAX_DESCRIPTION = 280;

export default function CreateInvoice() {
  const navigate = useNavigate();
  const { address, isConnected, onCorrectNetwork } = useWallet();
  const { switchNetwork } = useNetworkSwitch();
  const c = useFactoryContract();

  const [buyer, setBuyer] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const amountWei = parseUnits(amount);

  const buyerError = useMemo(() => {
    if (!buyer) return "";
    if (!isAddress(buyer)) return "That is not a valid wallet address.";
    if (sameAddress(buyer, address)) return "You cannot invoice your own wallet address.";
    return "";
  }, [buyer, address]);

  const amountError = useMemo(() => {
    if (!amount) return "";
    if (!/^\d*\.?\d*$/.test(amount.trim())) return "Enter a plain number, for example 1500.00";
    if (amountWei === 0n) return "Enter an amount greater than zero.";
    return "";
  }, [amount, amountWei]);

  const descriptionError = description.length > MAX_DESCRIPTION ? "Description is too long." : "";

  const valid =
    isAddress(buyer) &&
    !buyerError &&
    amountWei > 0n &&
    !amountError &&
    description.trim().length > 0 &&
    !descriptionError;

  /** Shows the buyer's on-chain record before the invoice is sent, not after. */
  const buyerProfile = useQuery({
    queryKey: ["creditProfile", buyer.toLowerCase()],
    enabled: isAddress(buyer) && !sameAddress(buyer, address),
    queryFn: () => c.creditProfile(buyer),
  });

  const tx = useTransaction({
    onConfirmed: async () => {
      const total = Number(await c.nextInvoiceId());
      navigate(`/invoice/${total - 1}`);
    },
  });

  if (!isConnected) {
    return (
      <EmptyState
        icon="wallet"
        title="Connect your wallet to create an invoice"
        body="The connected address becomes the seller on the invoice and receives the proceeds."
        action={
          <Link to="/docs#how-it-works" className="btn btn-outline">
            Read how it works first
          </Link>
        }
      />
    );
  }

  const fee = (amountWei * BigInt(PLATFORM_FEE_BPS)) / 10000n;

  return (
    <div className="max-w-xl mx-auto">
      <PageHeader
        title="Create invoice"
        subtitle="You are the seller. The buyer confirms it and sets their own due date before anything is payable."
      />

      <div className="space-y-5">
        <section className="card p-5 space-y-5">
          <div>
            <label htmlFor="buyer" className="label mb-1.5">
              Buyer wallet address
            </label>
            <input
              id="buyer"
              className={`input font-mono ${buyerError ? "input-error" : ""}`}
              placeholder="0x..."
              autoComplete="off"
              spellCheck={false}
              value={buyer}
              onChange={(e) => setBuyer(e.target.value.trim())}
            />
            {buyerError ? (
              <p className="field-error mt-1">{buyerError}</p>
            ) : (
              <p className="field-hint mt-1">
                The invoice is binding on this address only. Check it carefully, it cannot be changed.
              </p>
            )}
          </div>

          {/* Counterparty risk, surfaced before submission. */}
          {isAddress(buyer) && !buyerError && (
            <div className="panel p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="label">This buyer's record</p>
                {buyerProfile.data?.trusted && <TrustedBadge small />}
              </div>
              {buyerProfile.isLoading ? (
                <Skeleton className="h-14 w-full" />
              ) : (
                <>
                  <CreditSummary profile={buyerProfile.data} size="sm" />
                  {buyerProfile.data && buyerProfile.data.onTime === 0 && buyerProfile.data.defaults === 0 && (
                    <p className="field-hint mt-2.5">
                      No history on this platform yet. That is neither good nor bad, only unknown.
                    </p>
                  )}
                  {(buyerProfile.data?.defaults ?? 0) > 0 && (
                    <p className="field-error mt-2.5">
                      This address has defaulted {buyerProfile.data.defaults} time
                      {buyerProfile.data.defaults === 1 ? "" : "s"} before.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <label htmlFor="amount" className="label mb-1.5">
              Amount, USDT
            </label>
            <input
              id="amount"
              className={`input tabular ${amountError ? "input-error" : ""}`}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {amountError ? (
              <p className="field-error mt-1">{amountError}</p>
            ) : (
              <p className="field-hint mt-1">The full face value the buyer owes, before the platform fee.</p>
            )}
          </div>

          <div>
            <label htmlFor="description" className="label mb-1.5">
              Description
            </label>
            <textarea
              id="description"
              className={`input ${descriptionError ? "input-error" : ""}`}
              rows={3}
              maxLength={MAX_DESCRIPTION}
              placeholder="What is this invoice for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex items-baseline justify-between mt-1">
              <p className="field-hint">Stored publicly on-chain. Do not include private details.</p>
              <p className="field-hint tabular flex-shrink-0">
                {description.length}/{MAX_DESCRIPTION}
              </p>
            </div>
          </div>
        </section>

        {/* Live preview of exactly what gets submitted. */}
        <section className="card p-5">
          <p className="label mb-3">What will be submitted</p>
          <dl className="space-y-2.5">
            <div className="row">
              <dt>Seller</dt>
              <dd className="font-mono text-xs">{address}</dd>
            </div>
            <div className="row">
              <dt>Buyer</dt>
              <dd className="font-mono text-xs">{isAddress(buyer) ? buyer : "Not set"}</dd>
            </div>
            <div className="row">
              <dt>Face value</dt>
              <dd className="tabular font-medium">
                {amountWei > 0n ? <Money value={amountWei} /> : "Not set"}
              </dd>
            </div>
            <div className="row">
              <dt>Platform fee at settlement</dt>
              <dd className="tabular">{amountWei > 0n ? <Money value={fee} /> : "-"}</dd>
            </div>
            <div className="row">
              <dt>You receive if paid directly</dt>
              <dd className="tabular font-medium" style={{ color: amountWei > 0n ? "var(--color-primary)" : undefined }}>
                {amountWei > 0n ? `$${formatMoneyFixed(amountWei - fee)}` : "-"}
              </dd>
            </div>
            <div className="row">
              <dt>Description</dt>
              <dd className="text-xs">{description.trim() || "Not set"}</dd>
            </div>
            <div className="row">
              <dt>Due date</dt>
              <dd className="text-xs text-text-secondary">Chosen by the buyer at confirmation</dd>
            </div>
          </dl>
        </section>

        {!onCorrectNetwork && (
          <Callout tone="warn" title="Wrong network">
            You are connected to another chain. Switch to {ACTIVE_NETWORK.label} to submit.
            <button className="btn btn-outline btn-sm mt-3" onClick={switchNetwork}>
              Switch network
            </button>
          </Callout>
        )}

        <TxButton
          size="lg"
          state={tx.state}
          disabled={!valid || !onCorrectNetwork}
          onClick={() =>
            tx.execute("Creating invoice", () =>
              c.call("createInvoice", [buyer, amountWei, description.trim()])
            )
          }
          pendingLabel="Creating"
          confirmedLabel="Created, opening it now"
        >
          <Icon name="plus" size={15} />
          Create invoice
        </TxButton>

        <p className="text-xs text-text-muted text-center leading-relaxed">
          Creating an invoice costs only gas. No USDT moves until the buyer pays, or until you tokenize
          it and an investor buys in.
        </p>
      </div>
    </div>
  );
}
