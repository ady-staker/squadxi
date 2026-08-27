"use client";

import { useState } from "react";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// Recovery path for when the wallet's own transaction succeeded but the
// page's automatic detection (useWaitForTransactionReceipt polling the
// browser's RPC) never caught up -- happened for real (a genuine on-chain
// payment that stayed "waiting for confirmation" for 10+ minutes, then
// looked like it never happened after a refresh). The server verifies
// independently against its own RPC either way, so this is never a trust
// shortcut, just a way to trigger that check without waiting on the
// client-side watcher. Pre-fill with the current session's own txHash when
// known so this is a one-click "confirm now"; left blank after a reload
// (local state is gone) so the user can paste it from their wallet's own
// activity/history instead.
export function ManualTxConfirmForm({
  confirmUrl,
  prefillTxHash,
  walletAddress,
  onConfirmed,
}: {
  confirmUrl: string;
  prefillTxHash?: string | null;
  walletAddress: string | undefined;
  onConfirmed: () => void;
}) {
  const [txHash, setTxHash] = useState(prefillTxHash ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = txHash.trim();
    if (!TX_HASH_RE.test(trimmed)) {
      setError("That doesn't look like a valid transaction hash.");
      return;
    }
    if (!walletAddress) {
      setError("Connect your wallet first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(confirmUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: trimmed, walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to confirm.");
      onConfirmed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-paper p-3 text-left">
      <p className="text-xs text-muted">
        Already sent the payment and it&apos;s not showing up? Paste the
        transaction hash from your wallet to confirm it directly.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="0x…"
          className="w-0 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-mono text-ink focus:border-accent focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={submitting || !txHash.trim()}
          className="whitespace-nowrap rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
        >
          {submitting ? "Checking…" : "Confirm"}
        </button>
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}
