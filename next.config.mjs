/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi's connector barrel file statically imports a handful of optional
    // wallet SDKs (peerDependenciesMeta: optional). We only need the core
    // injected/WalletConnect/Coinbase/Base/Safe/MetaMask connectors that are
    // installed; "accounts" backs the Tempo-chain connector, which is not a
    // chain CoinVoyage supports, so it's stubbed out rather than installing
    // its own (large) dependency chain. Carried over verbatim from the other
    // apps in this repo family -- same wallet SDK dependency tree, required
    // for `next build` to succeed even though this app's checkout never
    // renders PayButton/WalletProvider (server-side createInvoice(), like
    // dental-site).
    config.resolve.alias = {
      ...config.resolve.alias,
      accounts: false,
      "@base-org/account": false,
    };
    return config;
  },
};

export default nextConfig;
