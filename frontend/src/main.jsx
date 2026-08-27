import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { BrowserRouter } from "react-router-dom";
import { wagmiConfig } from "./lib/chain";
import { ACTIVE_NETWORK } from "./config/network";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || "YOUR_REOWN_PROJECT_ID";

const wagmiAdapter = new WagmiAdapter({
  networks: [ACTIVE_NETWORK.chain],
  projectId,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks: [ACTIVE_NETWORK.chain],
  projectId,
  themeMode: "dark",
  themeVariables: {
    "--w3m-color-mix": "#6b9b6e",
    "--w3m-color-mix-strength": 20,
    "--w3m-accent": "#6b9b6e",
    "--w3m-background-color": "#12140f",
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);