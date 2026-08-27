import { createConfig, http } from "wagmi";
import { BOT_MAINNET, BOT_TESTNET, ACTIVE_NETWORK } from "../config/network";

export const wagmiConfig = createConfig({
  chains: [BOT_TESTNET, BOT_MAINNET],
  transports: {
    [BOT_TESTNET.id]: http(BOT_TESTNET.rpcUrls.default.http[0]),
    [BOT_MAINNET.id]: http(BOT_MAINNET.rpcUrls.default.http[0]),
  },
});

export { ACTIVE_NETWORK };