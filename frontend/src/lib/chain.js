import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";
import { BOT_MAINNET, BOT_TESTNET, ACTIVE_NETWORK } from "../config/network";

/**
 * Reown project id. Without a real one the WalletConnect relay refuses the session, so the
 * mobile path is advertised as unavailable in the UI rather than failing silently.
 */
export const REOWN_PROJECT_ID = import.meta.env.VITE_REOWN_PROJECT_ID || "";
export const MOBILE_WALLET_AVAILABLE = REOWN_PROJECT_ID.length > 0;

/**
 * Both BOT Chain networks are registered even though only one is active, so that a wallet
 * sitting on the other one is recognised and can be switched rather than reported as an
 * unknown chain.
 */
const networks = ACTIVE_NETWORK.key === "testnet" ? [BOT_TESTNET, BOT_MAINNET] : [BOT_MAINNET, BOT_TESTNET];

/**
 * AppKit owns the wagmi config and the app consumes the very same instance.
 *
 * Creating a second config with createConfig and passing that to WagmiProvider is the
 * mistake this replaces: AppKit would write the connected session into the adapter's own
 * config while every hook in the app read from the other one, so connecting through the
 * mobile or WalletConnect path appeared to do nothing at all.
 */
export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId: REOWN_PROJECT_ID,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: ACTIVE_NETWORK.chain,
  projectId: REOWN_PROJECT_ID,
  enableWalletConnect: MOBILE_WALLET_AVAILABLE,
  features: { analytics: false, email: false, socials: false },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#5cb870",
    "--w3m-color-mix": "#5cb870",
    "--w3m-color-mix-strength": 8,
    "--w3m-border-radius-master": "3px",
    "--w3m-font-family": '"Inter", ui-sans-serif, system-ui, sans-serif',
  },
});

export { ACTIVE_NETWORK };
