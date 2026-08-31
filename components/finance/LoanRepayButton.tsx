"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useConnectors,
  useChainId,
  useSwitchChain,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { WagmiProviders } from "@/components/providers/WagmiProviders";
import { robinhoodChainTestnet } from "@/lib/wagmi-config";
import { describeChainSwitchError } from "@/lib/wallet-errors";
import { forceWalletAccountPicker } from "@/lib/wallet-connect";

// Repayment is the one action in SQXI Finance that genuinely needs a
// connected wallet -- unlike Collect/Stake (server-relayed) or loan
// disbursement (admin-relayed), this is money moving FROM the user, which
// only their own wallet can authorize. Sends amountWei directly to the
// contract address (see lib/pool.ts's recordRepayment), then reports the
// txHash + amount for server-side verification via verifyTestnetTransfer.
function LoanRepayFlow({
  loanId,
  contractAddress,
  amountWei,
  onRepaid,
}: {
  loanId: string;
  contractAddress: `0x${string}`;
  amountWei: string;
  onRepaid: () => void;
}) {
  const { address, isConnected } = useAccount();
  const { connect, error: connectError } = useConnect();
  const connectors = useConnectors();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const {
    sendTransaction,
    data: txHash,
    isPending,
    error: sendError,
  } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Gates the auto-confirm effect to one attempt per mined tx -- without
  // this, confirming flipping true->false on a FAILED attempt re-satisfies
  // the effect's own dependencies and retries forever. A manual retry
  // click bypasses this by calling confirmOnServer() directly.
  const [autoAttempted, setAutoAttempted] = useState(false);

  async function connectWallet() {
    const connector = connectors[0];
    if (!connector) return;
    await forceWalletAccountPicker(connector);
    connect({ connector });
  }

  async function pay() {
    setSwitching(true);
    setSwitchError(null);
    try {
      await switchChainAsync({ chainId: robinhoodChainTestnet.id });
      sendTransaction({
        to: contractAddress,
        value: BigInt(amountWei),
        chainId: robinhoodChainTestnet.id,
      });
    } catch (err) {
      setSwitchError(describeChainSwitchError(err));
    } finally {
      setSwitching(false);
    }
  }

  async function confirmOnServer() {
    if (!txHash) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/loans/${loanId}/repay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash, amountWei }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to record repayment.");
      setDone(true);
      onRepaid();
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : "Failed to record repayment.",
      );
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    if (!isConfirmed || !txHash || autoAttempted) return;
    setAutoAttempted(true);
    confirmOnServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirmed, txHash, autoAttempted]);

  if (done) {
    return <p className="text-sm font-semibold text-blue-700">Repaid!</p>;
  }

  if (isConfirmed && txHash && confirmError) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={confirmOnServer}
          disabled={confirming}
          className="rounded bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {confirming ? "Retrying…" : "Retry confirming repayment"}
        </button>
        <p className="text-xs text-red-600">{confirmError}</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button
        onClick={connectWallet}
        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-900 hover:text-blue-900"
      >
        Connect wallet to repay
      </button>
    );
  }
  if (chainId !== robinhoodChainTestnet.id && !switching) {
    return (
      <button
        onClick={pay}
        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-900 hover:text-blue-900"
      >
        Switch network to repay
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={pay}
        disabled={switching || isPending || isConfirming || confirming}
        className="rounded bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {switching
          ? "Switching…"
          : isPending
            ? "Confirm in wallet…"
            : isConfirming || confirming
              ? "Confirming…"
              : `Repay ${(Number(amountWei) / 1e18).toFixed(4)} ETH`}
      </button>
      {(switchError || sendError) && (
        <p className="text-xs text-red-600">
          {switchError ?? sendError?.message}
        </p>
      )}
    </div>
  );
}

export function LoanRepayButton(props: {
  loanId: string;
  contractAddress: `0x${string}`;
  amountWei: string;
  onRepaid: () => void;
}) {
  return (
    <WagmiProviders>
      <LoanRepayFlow {...props} />
    </WagmiProviders>
  );
}
