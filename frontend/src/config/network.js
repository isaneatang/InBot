import { defineChain } from "viem";

export const BOT_TESTNET = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrl: "https://rpc.bohr.life",
  rpcUrls: { default: { http: ["https://rpc.bohr.life"] } },
  blockExplorers: { default: { name: "BOTScan Testnet", url: "https://scan.bohr.life" } },
});

export const BOT_MAINNET = defineChain({
  id: 677,
  name: "BOT Chain Mainnet",
  networkName: "BOT",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.botchain.ai"] } },
  blockExplorers: { default: { name: "BOTScan", url: "https://scan.botchain.ai" } },
});

export const NETWORKS = {
  testnet: {
    key: "testnet",
    label: "BOT Testnet",
    chain: BOT_TESTNET,
    chainId: 968,
    rpcUrl: "https://rpc.bohr.life",
    explorerUrl: "https://scan.bohr.life",
    nativeSymbol: "BOT",
    usdtAddress: "0x75edC9335175Fc0552D51D48439F229c10420fe3",
  },
  mainnet: {
    key: "mainnet",
    label: "BOT Mainnet",
    chain: BOT_MAINNET,
    chainId: 677,
    rpcUrl: "https://rpc.botchain.ai",
    explorerUrl: "https://scan.botchain.ai",
    nativeSymbol: "BOT",
    usdtAddress: "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C",
  },
};

// Single switch. Change this value to "mainnet" to repoint the entire application.
export const ACTIVE_NETWORK_KEY = "testnet";
export const ACTIVE_NETWORK = NETWORKS[ACTIVE_NETWORK_KEY];

// Updated with the deployed contract address after deployment (see steps.txt).
export const INVOICE_FACTORY_ADDRESS = "0x1e6c1FD4a91Eefd68b22d70574d263FBe617a7be";

export const USDT_DECIMALS = 6;
export const PLATFORM_FEE_BPS = 50;
export const USERNAME_FEE_WEI = 10n ** 6n;
export const TRUSTED_MIN_REPAID = 5;
export const TRUSTED_MAX_DEFAULTS = 0;
export const MIN_DISCOUNT_BPS = 5000;
export const MAX_DISCOUNT_BPS = 9900;