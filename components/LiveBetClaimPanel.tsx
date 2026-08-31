"use client";

import { useState } from "react";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// Same relayed one-step claim as ContestPrizeClaimPanel.tsx -- see that
// component and lib/robinhood-chain.ts's relayClaim for the full rationale.
export function LiveBetClaimPanel({ liveBetId }: { liveBetId: string }) {
  const [walletAddress, setWalletAddress] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ txHash?: string } | null>(null);

  const addressValid = ADDRESS_RE.test(walletAddress.trim());

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/live-bets/${liveBetId}/claim/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: walletAddress.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send payout.");
      setResult({ txHash: data.txHash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send payout.");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/10 p-6 text-sm text-ink">
        <p className="font-semibold text-accent">Winnings sent!</p>
        <p className="mt-1 text-xs text-muted">
          Sent to <span className="font-mono">{walletAddress.trim()}</span>
        </p>
        {result.txHash && (
          <p className="mt-1 text-xs text-muted">
            Transaction: <span className="font-mono">{result.txHash}</span>
          </p>
        )}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-6">
        <p className="text-sm text-ink">
          Double-check this address before sending -- there's no way to reverse
          a payout to the wrong wallet:
        </p>
        <p className="rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm text-ink">
          {walletAddress.trim()}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Confirm and send"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={submitting}
            className="text-xs text-muted underline hover:text-ink"
          >
            Go back
          </button>
        </div>
        {error && <p className="text-xs text-loss">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
      <label className="text-sm text-muted" htmlFor="bet-wallet-address">
        Wallet address to receive your winnings (Robinhood Chain testnet)
      </label>
      <input
        id="bet-wallet-address"
        value={walletAddress}
        onChange={(e) => setWalletAddress(e.target.value)}
        placeholder="0x..."
        className="rounded-lg border border-border bg-paper px-3 py-2 font-mono text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
      />
      <button
        onClick={() => setConfirming(true)}
        disabled={!addressValid}
        className="self-start rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
      >
        Continue
      </button>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}
