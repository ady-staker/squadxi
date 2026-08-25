import type { Connector } from "wagmi";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

// connect() alone reuses an already-authorized account; this EIP-2255
// call forces MetaMask/Phantom-class wallets to show their picker again.
export async function forceWalletAccountPicker(
  connector: Connector,
): Promise<void> {
  try {
    const provider = (await connector.getProvider()) as
      Eip1193Provider | undefined;
    await provider?.request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Unsupported or dismissed -- connect() still proceeds either way.
  }
}
