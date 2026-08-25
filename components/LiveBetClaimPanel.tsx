"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useChainId,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhoodChainTestnet } from "@/lib/wagmi-config";

type Voucher = {
  claimId: `0x${string}`;
  winner: `0x${string}`;
  amountWei: string;
  signature: `0x${string}`;
  contractAddress: `0x${string}`;
  chainId: number;
};

const CLAIM_ABI = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimId", type: "bytes32" },
      { name: "winner", type: "address" },
      { name: "amountWei", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// Copy of RoleBonusClaimPanel pointed at the parallel live-bet claim routes
// (locked decision 5 in the live-betting plan -- authorized directly against
// LiveBet.userId, no RoleBonusClaim join). Keyed by LiveBet.id, not the
// bytes32 claimId, since the routes take the bet's own id as the URL param.
export function LiveBetClaimPanel({ liveBetId }: { liveBetId: string }) {
  const { address, isConnected } = useAccount();
  const { connect, error: connectError } = useConnect();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [switchingChain, setSwitchingChain] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function requestVoucher() {
    if (!address) return;
    setRequesting(true);
    setVoucherError(null);
    try {
      const res = await fetch(`/api/live-bets/${liveBetId}/claim/voucher`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to get voucher.");
      setVoucher(data);
    } catch (err) {
      setVoucherError(
        err instanceof Error ? err.message : "Failed to get voucher.",
      );
    } finally {
      setRequesting(false);
    }
  }

  // useChainId() can be stale for an unrecognized custom chain (see
  // LiveBetPanel.tsx's identical fix) -- switch unconditionally.
  async function submitClaim() {
    if (!voucher) return;
    if (address?.toLowerCase() !== voucher.winner.toLowerCase()) {
      setVoucher(null);
      setVoucherError(
        "Your connected wallet changed -- please request a new voucher.",
      );
      return;
    }
    setSwitchingChain(true);
    setSwitchError(null);
    try {
      await switchChainAsync({ chainId: voucher.chainId });
      writeContract({
        address: voucher.contractAddress,
        abi: CLAIM_ABI,
        functionName: "claim",
        args: [
          voucher.claimId,
          voucher.winner,
          BigInt(voucher.amountWei),
          voucher.signature,
        ],
        chainId: voucher.chainId,
      });
    } catch (err) {
      setSwitchError(
        err instanceof Error
          ? err.message
          : "Failed to switch to Robinhood Chain testnet.",
      );
    } finally {
      setSwitchingChain(false);
    }
  }

  async function confirmOnServer(hash: `0x${string}`) {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/live-bets/${liveBetId}/claim/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to confirm.");
      setConfirmed(true);
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : "Failed to confirm claim.",
      );
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    if (!isConfirmed || !txHash || confirmed || confirming) return;
    confirmOnServer(txHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash, confirmed, confirming]);

  if (confirmed) {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/10 p-6 text-sm text-ink">
        <p className="font-semibold text-accent">Winnings claimed!</p>
        <p className="mt-1 text-xs text-muted">
          Transaction: <span className="font-mono">{txHash}</span>
        </p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="mb-4 text-sm text-muted">
          Connect a wallet to claim your winnings on Robinhood Chain testnet.
        </p>
        <button
          onClick={() => connect({ connector: injected() })}
          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark"
        >
          Connect wallet
        </button>
        {connectError && (
          <p className="mt-3 text-xs text-loss">
            {connectError.message.includes("not found") ||
            connectError.message.includes("No injected")
              ? "No wallet extension found in this browser."
              : connectError.message}
          </p>
        )}
      </div>
    );
  }

  // Render-time-only prompt; submitClaim() itself always re-confirms the chain.
  if (chainId !== robinhoodChainTestnet.id && !switchingChain) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="mb-4 text-sm text-muted">
          Switch your wallet to Robinhood Chain testnet to continue.
        </p>
        <button
          onClick={async () => {
            setSwitchingChain(true);
            setSwitchError(null);
            try {
              await switchChainAsync({ chainId: robinhoodChainTestnet.id });
            } catch (err) {
              setSwitchError(
                err instanceof Error
                  ? err.message
                  : "Failed to switch to Robinhood Chain testnet.",
              );
            } finally {
              setSwitchingChain(false);
            }
          }}
          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark"
        >
          Switch network
        </button>
        {switchError && <p className="mt-2 text-xs text-loss">{switchError}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <p className="text-sm text-muted">
        Connected as <span className="font-mono text-ink">{address}</span>
      </p>

      {!voucher ? (
        <button
          onClick={requestVoucher}
          disabled={requesting}
          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
        >
          {requesting ? "…" : "Get claim voucher"}
        </button>
      ) : isConfirmed && txHash ? (
        // Once the on-chain claim is mined, never offer to submit it again --
        // if the server-side confirm step fails, retry re-verifies the SAME
        // txHash instead of risking a second on-chain claim() call.
        confirmError ? (
          <button
            onClick={() => confirmOnServer(txHash)}
            disabled={confirming}
            className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {confirming ? "Retrying…" : "Retry confirming claim"}
          </button>
        ) : (
          <p className="text-xs text-muted">Confirming your claim…</p>
        )
      ) : (
        <button
          onClick={submitClaim}
          disabled={switchingChain || isPending || isConfirming}
          className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {switchingChain
            ? "Switching network…"
            : isPending
              ? "Confirm in wallet…"
              : isConfirming
                ? "Waiting for confirmation…"
                : `Claim ${(Number(voucher.amountWei) / 1e18).toFixed(4)} ETH`}
        </button>
      )}

      {voucherError && <p className="text-xs text-loss">{voucherError}</p>}
      {switchError && <p className="text-xs text-loss">{switchError}</p>}
      {writeError && (
        <p className="text-xs text-loss">
          {writeError.message.includes("does not match the target chain")
            ? "Your wallet switched away from Robinhood Chain testnet -- click Claim again to reconnect."
            : writeError.message}
        </p>
      )}
    </div>
  );
}
