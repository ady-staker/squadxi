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

export function RoleBonusClaimPanel({ claimId }: { claimId: string }) {
  const { address, isConnected } = useAccount();
  const { connect, error: connectError } = useConnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
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
  const [confirmError, setConfirmError] = useState<string | null>(null);

  async function requestVoucher() {
    if (!address) return;
    setRequesting(true);
    setVoucherError(null);
    try {
      const res = await fetch(`/api/robinhood/claim/${claimId}/voucher`, {
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

  function submitClaim() {
    if (!voucher) return;
    // stale voucher guard -- account may have switched since requesting it
    if (address?.toLowerCase() !== voucher.winner.toLowerCase()) {
      setVoucher(null);
      setVoucherError(
        "Your connected wallet changed -- please request a new voucher.",
      );
      return;
    }
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
  }

  useEffect(() => {
    if (!isConfirmed || !txHash || confirmed) return;
    (async () => {
      try {
        const res = await fetch(`/api/robinhood/claim/${claimId}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to confirm.");
        setConfirmed(true);
      } catch (err) {
        setConfirmError(
          err instanceof Error ? err.message : "Failed to confirm claim.",
        );
      }
    })();
  }, [isConfirmed, txHash, confirmed, claimId]);

  if (confirmed) {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/10 p-6 text-sm text-ink">
        <p className="font-semibold text-accent">Bonus claimed!</p>
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
          Connect a wallet to claim your bonus on Robinhood Chain testnet.
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

  if (chainId !== robinhoodChainTestnet.id) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="mb-4 text-sm text-muted">
          Switch your wallet to Robinhood Chain testnet to continue.
        </p>
        <button
          onClick={() => switchChain({ chainId: robinhoodChainTestnet.id })}
          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark"
        >
          Switch network
        </button>
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
      ) : (
        <button
          onClick={submitClaim}
          disabled={isPending || isConfirming}
          className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending
            ? "Confirm in wallet…"
            : isConfirming
              ? "Waiting for confirmation…"
              : `Claim ${(Number(voucher.amountWei) / 1e18).toFixed(4)} ETH`}
        </button>
      )}

      {voucherError && <p className="text-xs text-loss">{voucherError}</p>}
      {writeError && <p className="text-xs text-loss">{writeError.message}</p>}
      {confirmError && <p className="text-xs text-loss">{confirmError}</p>}
    </div>
  );
}
