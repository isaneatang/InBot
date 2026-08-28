import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { normalizeInvoice, useFactoryContract } from "./useInvoiceFactory";
import { sameAddress } from "../lib/format";

/**
 * The whole invoice book, loaded through the contract's paged getter.
 *
 * Every page and card derives from this one query so the book is fetched once per window
 * rather than once per component. Pagination on the contract side keeps this to a handful of
 * requests, but an indexer would still be the right answer at production scale.
 */
export function useAllInvoices() {
  const c = useFactoryContract();
  return useQuery({
    queryKey: ["invoices", "all"],
    queryFn: () => c.allInvoices(),
    staleTime: 15_000,
  });
}

export function useInvoice(id) {
  const c = useFactoryContract();
  return useQuery({
    queryKey: ["invoice", String(id)],
    queryFn: async () => {
      const row = await c.getInvoice(id);
      return { id: Number(id), ...normalizeInvoice(row) };
    },
    enabled: id !== undefined && id !== null && !Number.isNaN(Number(id)),
  });
}

/**
 * Credit profiles for a set of addresses, fetched as one batch and keyed by lowercase
 * address so cards can look up their counterparty without each firing its own request.
 */
export function useCreditProfiles(addresses) {
  const c = useFactoryContract();
  const key = useMemo(
    () => [...new Set((addresses || []).filter(Boolean).map((a) => a.toLowerCase()))].sort(),
    [addresses]
  );

  return useQuery({
    queryKey: ["creditProfiles", key],
    queryFn: () => c.creditProfiles(key),
    enabled: key.length > 0,
    staleTime: 30_000,
  });
}

export function useCreditProfile(address) {
  const c = useFactoryContract();
  return useQuery({
    queryKey: ["creditProfile", address?.toLowerCase()],
    queryFn: () => c.creditProfile(address),
    enabled: !!address,
  });
}

/**
 * Splits the book into the three roles a single address can hold at once, and works out
 * what is actionable or claimable in each.
 *
 * Roles are derived from contract data rather than any stored preference, because one wallet
 * is routinely a seller on one invoice and a buyer on another.
 */
export function useRoleView(address) {
  const c = useFactoryContract();
  const invoices = useAllInvoices();

  const asSeller = useMemo(
    () => (invoices.data || []).filter((inv) => sameAddress(inv.seller, address)),
    [invoices.data, address]
  );
  const asBuyer = useMemo(
    () => (invoices.data || []).filter((inv) => sameAddress(inv.buyer, address)),
    [invoices.data, address]
  );

  /**
   * Investor positions and every claimable balance in one pass. Grouped into a single query
   * so the dashboard resolves in one loading state instead of three staggered ones.
   */
  const positions = useQuery({
    queryKey: ["positions", address?.toLowerCase(), invoices.data?.length ?? 0],
    enabled: !!address && !!invoices.data,
    staleTime: 15_000,
    queryFn: async () => {
      const book = invoices.data || [];

      const contributions = await Promise.all(
        book.map((inv) => c.investorContribution(inv.id, address).catch(() => 0n))
      );

      const invested = [];
      book.forEach((inv, i) => {
        if (contributions[i] > 0n) invested.push({ ...inv, contribution: contributions[i] });
      });

      // A settled invoice may still owe an investor their share even after the mapping was
      // zeroed on claim, so the contract is asked directly rather than inferred.
      const investorClaims = await Promise.all(
        book
          .filter((inv) => inv.status === 3 || inv.status === 4)
          .map(async (inv) => [inv.id, await c.claimableInvestorShare(inv.id, address).catch(() => 0n)])
      );

      const sellerClaims = await Promise.all(
        asSeller
          .filter((inv) => inv.status === 3 || inv.status === 4)
          .map(async (inv) => [inv.id, await c.claimableSellerShare(inv.id).catch(() => 0n)])
      );

      const investorClaimable = Object.fromEntries(investorClaims.filter(([, v]) => v > 0n));
      const sellerClaimable = Object.fromEntries(sellerClaims.filter(([, v]) => v > 0n));

      const sum = (obj) => Object.values(obj).reduce((acc, v) => acc + v, 0n);

      return {
        invested,
        investorClaimable,
        sellerClaimable,
        totalInvestorClaimable: sum(investorClaimable),
        totalSellerClaimable: sum(sellerClaimable),
        totalInvested: invested.reduce((acc, inv) => acc + inv.contribution, 0n),
      };
    },
  });

  /** Invoices this address must act on next, surfaced ahead of everything else. */
  const actionable = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const items = [];

    for (const inv of asBuyer) {
      if (inv.status === 0) {
        items.push({ invoice: inv, action: "Confirm this invoice and set a due date", tone: "primary" });
      } else if ((inv.status === 1 || inv.status === 2) && Number(inv.dueDate) > now) {
        const due = Number(inv.dueDate) - now;
        if (due < 3 * 86400) {
          items.push({ invoice: inv, action: "Payment due within three days", tone: "warn" });
        }
      }
    }

    for (const inv of asSeller) {
      if (inv.status === 1 && Number(inv.dueDate) > now) {
        items.push({ invoice: inv, action: "Confirmed and ready to tokenize", tone: "primary" });
      }
    }

    return items;
  }, [asBuyer, asSeller]);

  const outstanding = useMemo(() => {
    const owedToSeller = asSeller
      .filter((inv) => inv.status === 1 || inv.status === 2)
      .reduce((acc, inv) => acc + BigInt(inv.faceValue), 0n);
    const owedByBuyer = asBuyer
      .filter((inv) => inv.status === 1 || inv.status === 2)
      .reduce((acc, inv) => acc + BigInt(inv.faceValue), 0n);
    return { owedToSeller, owedByBuyer };
  }, [asSeller, asBuyer]);

  return {
    isLoading: invoices.isLoading,
    isError: invoices.isError,
    error: invoices.error,
    refetch: invoices.refetch,
    asSeller,
    asBuyer,
    positions: positions.data,
    positionsLoading: positions.isLoading,
    actionable,
    outstanding,
    refetchPositions: positions.refetch,
  };
}
