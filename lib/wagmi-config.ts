import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

// Matches lib/robinhood-chain.ts's ROBINHOOD_TESTNET_CHAIN_ID -- kept as a
// separate constant since this file is client-side (bundled into the
// browser) and that one is server-only.
export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://robinhood-testnet.g.alchemy.com/v2/demo"] },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [robinhoodChainTestnet],
  connectors: [injected()],
  transports: {
    [robinhoodChainTestnet.id]: http(),
  },
});
