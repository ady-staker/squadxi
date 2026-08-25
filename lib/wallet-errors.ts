// Phantom (and some other wallets) block switching to ANY unrecognized
// testnet chain until the wallet's own "Testnet Mode" setting is turned on
// -- wagmi/viem surface this as a generic "not connected to the requested
// chain" error with no distinct error code, so string-match it here to give
// a specific instruction instead of the raw viem error text.
export function describeChainSwitchError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (message.includes("not connected to the requested chain")) {
    return (
      "Your wallet is blocking testnet networks. If you're using Phantom, " +
      'open its Settings -> Developer Settings and turn on "Testnet Mode", ' +
      "then try again."
    );
  }
  return message || "Failed to switch to Robinhood Chain testnet.";
}
