import { useCallback, useMemo, useState } from "react";
import { useAccount, useChainId, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { useAppKit } from "@reown/appkit/react";
import { ACTIVE_NETWORK } from "../config/network";
import { MOBILE_WALLET_AVAILABLE } from "../lib/chain";
import { useFactoryContract } from "./useInvoiceFactory";

export { MOBILE_WALLET_AVAILABLE };

/**
 * Wallet identity, network correctness, and the claimed username in one place.
 *
 * The chain id is taken from the connector rather than the config default, because a wallet
 * sitting on a chain the app does not know about must still be reported accurately so the
 * wrong-network gate can fire.
 */
export function useWallet() {
  const { address, isConnected, isConnecting, isReconnecting, chainId: accountChainId, connector } = useAccount();
  const configChainId = useChainId();
  const chainId = accountChainId ?? (isConnected ? configChainId : undefined);
  const c = useFactoryContract();

  const profile = useQuery({
    queryKey: ["creditProfile", address?.toLowerCase()],
    queryFn: () => c.creditProfile(address),
    enabled: !!address && isConnected,
  });

  const onCorrectNetwork = isConnected && chainId === ACTIVE_NETWORK.chainId;

  return {
    address,
    isConnected,
    isConnecting: isConnecting || isReconnecting,
    connector,
    chainId,
    onCorrectNetwork,
    /** True only when the wallet is connected and able to sign for this app. */
    canWrite: isConnected && onCorrectNetwork,
    username: profile.data?.username || "",
    profile: profile.data,
    refetchProfile: profile.refetch,
  };
}

/**
 * Adds or switches to the active BOT Chain network.
 *
 * wagmi's switchChain is tried first because it routes through the connector and works for
 * WalletConnect sessions as well as injected wallets. If the wallet reports it does not
 * know the chain, the raw EIP-3085 request supplies the full definition so the user gets an
 * add prompt rather than a dead end.
 */
export function useNetworkSwitch() {
  const { switchChainAsync } = useSwitchChain();
  const { connector } = useAccount();
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const switchNetwork = useCallback(async () => {
    setStatus("pending");
    setMessage("");

    const chainParams = {
      chainId: `0x${ACTIVE_NETWORK.chainId.toString(16)}`,
      chainName: ACTIVE_NETWORK.chain.name,
      nativeCurrency: { name: "BOT", symbol: ACTIVE_NETWORK.nativeSymbol, decimals: 18 },
      rpcUrls: [ACTIVE_NETWORK.rpcUrl],
      blockExplorerUrls: [ACTIVE_NETWORK.explorerUrl],
    };

    try {
      await switchChainAsync({ chainId: ACTIVE_NETWORK.chainId });
      setStatus("success");
      return true;
    } catch (switchError) {
      const code = switchError?.cause?.code ?? switchError?.code;
      const unknownChain =
        code === 4902 ||
        /unrecognized chain|unknown chain|not been added|chain .* not found/i.test(
          switchError?.message || ""
        );

      if (!unknownChain) {
        if (code === 4001) {
          setStatus("idle");
          return false;
        }
        setStatus("error");
        setMessage("Your wallet refused the switch. Select BOT Chain manually in your wallet.");
        return false;
      }

      try {
        const provider = await connector?.getProvider?.();
        const target = provider ?? window.ethereum;
        if (!target?.request) {
          setStatus("error");
          setMessage("Add BOT Chain manually in your wallet, then reload this page.");
          return false;
        }
        await target.request({ method: "wallet_addEthereumChain", params: [chainParams] });
        await target
          .request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainParams.chainId }] })
          .catch(() => {});
        setStatus("success");
        return true;
      } catch (addError) {
        if ((addError?.code ?? 0) === 4001) {
          setStatus("idle");
          return false;
        }
        setStatus("error");
        setMessage("Could not add BOT Chain automatically. Add it manually in your wallet.");
        return false;
      }
    }
  }, [switchChainAsync, connector]);

  return { switchNetwork, status, message, isPending: status === "pending" };
}

/**
 * Wallet connection.
 *
 * Injected wallets are discovered through EIP-6963 so every extension the browser announces
 * is offered by name, rather than guessing at a single window.ethereum provider. Reown
 * AppKit remains the secondary path for mobile pairing and anything the injected route does
 * not cover.
 */
export function useWalletConnection() {
  const { connectAsync } = useConnect();
  const connectors = useConnectors();
  const { disconnect } = useDisconnect();
  const { open: openAppKit } = useAppKit();
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState("");

  /** Announced browser extension wallets, de-duplicated by name. */
  const injectedWallets = useMemo(() => {
    const seen = new Set();
    return connectors
      .filter((connector) => connector.type === "injected" && connector.id !== "injected")
      .filter((connector) => {
        const key = connector.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [connectors]);

  /**
   * Falls back to the generic injected connector when no wallet announced itself, which is
   * the case in older extensions and several wallet in-app browsers.
   */
  const fallbackInjected = useMemo(
    () => connectors.find((connector) => connector.id === "injected"),
    [connectors]
  );

  const hasInjected = injectedWallets.length > 0 || (fallbackInjected && typeof window !== "undefined" && !!window.ethereum);

  const connectInjected = useCallback(
    async (connector) => {
      const target = connector || injectedWallets[0] || fallbackInjected;
      if (!target) {
        setError("No browser wallet detected. Install one, or use the mobile option.");
        return false;
      }
      setPendingId(target.uid || target.id);
      setError("");
      try {
        await connectAsync({ connector: target, chainId: ACTIVE_NETWORK.chainId });
        return true;
      } catch (err) {
        const code = err?.cause?.code ?? err?.code;
        if (code !== 4001) {
          setError(err?.shortMessage || "Could not connect to that wallet. Try again.");
        }
        return false;
      } finally {
        setPendingId(null);
      }
    },
    [connectAsync, injectedWallets, fallbackInjected]
  );

  const connectMobile = useCallback(() => {
    if (!MOBILE_WALLET_AVAILABLE) {
      setError("Mobile wallet connection needs a Reown project id to be configured.");
      return;
    }
    setError("");
    openAppKit();
  }, [openAppKit]);

  return {
    injectedWallets,
    fallbackInjected,
    hasInjected,
    connectInjected,
    connectMobile,
    disconnect,
    pendingId,
    error,
    mobileAvailable: MOBILE_WALLET_AVAILABLE,
  };
}
