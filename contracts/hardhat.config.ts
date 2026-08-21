import { defineConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

// Robinhood Chain testnet: confirmed live, EVM-compatible Arbitrum Orbit L2.
// Chain ID 46630, ETH gas. See docs.robinhood.com/chain -- no deploy key is
// wired in here yet (Phase 3, needs the user present to fund and approve).
const ROBINHOOD_TESTNET_CHAIN_ID = 46630;

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: "0.8.28",
  networks: {
    robinhoodTestnet: {
      type: "http",
      chainType: "l1",
      url:
        process.env.ROBINHOOD_TESTNET_RPC_URL ??
        "https://rpc.testnet.chain.robinhood.com",
      chainId: ROBINHOOD_TESTNET_CHAIN_ID,
      accounts: process.env.ROBINHOOD_DEPLOYER_PRIVATE_KEY
        ? [process.env.ROBINHOOD_DEPLOYER_PRIVATE_KEY]
        : [],
    },
  },
});
