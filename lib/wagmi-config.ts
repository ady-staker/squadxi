import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";

// Matches lib/robinhood-chain.ts's ROBINHOOD_TESTNET_CHAIN_ID -- kept as a
// separate constant since this file is client-side (bundled into the
// browser) and that one is server-only.
//
// The RPC URL matters more than it looks: this is what the browser polls
// via useWaitForTransactionReceipt to detect a payment/claim confirming.
// The previous URL (a shared, public "/v2/demo" Alchemy endpoint) caused a
// real incident -- a genuine on-chain payment stayed stuck on "waiting for
// confirmation" for 10+ minutes because that endpoint never served the
// receipt back to the browser in time, even though the transaction itself
// had already succeeded. This is now the same official Robinhood Chain
// testnet RPC the server already uses (lib/robinhood-chain.ts's
// resolveRobinhoodConfig, admin-configurable, currently pointed here too).
export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
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
