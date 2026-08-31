"use client";

import { useEffect, useState } from "react";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type ClaimInfo = { claimAmountWei: string; claimed: boolean; staked: boolean };
type PoolState = {
  totalPoolValueWei: string;
  totalSharesIssued: string;
  totalLoanedWei: string;
  availableLiquidityWei: string;
  sharePrice: number;
};

function formatEth(wei: string | bigint): string {
  return (Number(wei) / 1e18).toFixed(4);
}

// Same relayed Collect / bookkeeping-only Stake fork as
// ContestPrizeClaimPanel.tsx -- see that component, lib/robinhood-chain.ts's
// relayClaim, and lib/pool.ts for the full rationale.
export function LiveBetClaimPanel({ liveBetId }: { liveBetId: string }) {
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "collect" | "stake">("choose");

  const [walletAddress, setWalletAddress] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectResult, setCollectResult] = useState<{
    txHash?: string;
  } | null>(null);
  const [staking, setStaking] = useState(false);
  const [stakeError, setStakeError] = useState<string | null>(null);
  const [staked, setStaked] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/live-bets/${liveBetId}/claim`).then((r) => r.json()),
      fetch(`/api/pool`).then((r) => r.json()),
    ])
      .then(([claimData, poolData]) => {
        if (claimData.error) setLoadError(claimData.error);
        else setInfo(claimData);
        setPool(poolData);
      })
      .catch(() => setLoadError("Failed to load claim details."));
  }, [liveBetId]);

  const addressValid = ADDRESS_RE.test(walletAddress.trim());

  async function submitCollect() {
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
      setCollectResult({ txHash: data.txHash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send payout.");
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitStake() {
    setStaking(true);
    setStakeError(null);
    try {
      const res = await fetch(`/api/live-bets/${liveBetId}/claim/stake`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to stake.");
      setStaked(true);
    } catch (err) {
      setStakeError(err instanceof Error ? err.message : "Failed to stake.");
    } finally {
      setStaking(false);
    }
  }

  if (loadError) return <p className="text-sm text-loss">{loadError}</p>;
  if (!info || !pool) return <p className="text-sm text-muted">Loading…</p>;

  if (info.claimed || collectResult) {
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/10 p-6 text-sm text-ink">
        <p className="font-semibold text-accent">Winnings sent!</p>
        {collectResult?.txHash && (
          <p className="mt-1 text-xs text-muted">
            Transaction:{" "}
            <span className="font-mono">{collectResult.txHash}</span>
          </p>
        )}
      </div>
    );
  }
  if (info.staked || staked) {
    return (
      <div className="rounded-2xl border border-gold/40 bg-gold/10 p-6 text-sm text-ink">
        <p className="font-semibold text-gold">Staked into the pool!</p>
        <p className="mt-1 text-xs text-muted">
          Your position now earns a share of loan interest as it's repaid.
        </p>
      </div>
    );
  }

  const amountEth = formatEth(info.claimAmountWei);

  if (mode === "choose") {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm font-semibold text-ink">
            Collect {amountEth} ETH
          </p>
          <p className="text-xs text-muted">
            Sent automatically to a wallet address you provide.
          </p>
          <button
            onClick={() => setMode("collect")}
            className="mt-auto self-start rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark"
          >
            Collect
          </button>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-6">
          <p className="text-sm font-semibold text-gold">Stake into the pool</p>
          <p className="text-xs text-muted">
            Current pool: {formatEth(pool.totalPoolValueWei)} ETH · share price{" "}
            {pool.sharePrice.toFixed(4)}. Earn a share of loan interest as it's
            repaid -- see the full breakdown before you confirm.
          </p>
          <button
            onClick={() => setMode("stake")}
            className="mt-auto self-start rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold text-gold transition hover:border-gold"
          >
            Stake instead
          </button>
        </div>
      </div>
    );
  }

  if (mode === "stake") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-6">
        <p className="text-sm font-semibold text-gold">
          Stake {amountEth} ETH into the pool
        </p>
        <div className="rounded-lg border border-border bg-paper p-4 text-xs text-muted">
          <p>
            Current pool value:{" "}
            <span className="text-ink">
              {formatEth(pool.totalPoolValueWei)} ETH
            </span>
          </p>
          <p>
            Current share price:{" "}
            <span className="text-ink">{pool.sharePrice.toFixed(6)}</span>
          </p>
          <p>
            You'd stake: <span className="text-ink">{amountEth} ETH</span>
          </p>
          <p className="mt-2 text-muted">
            No loans have been made from the pool yet, so there's no interest
            being earned right now -- your share price won't move until
            borrowing opens. Once it does, 100% of interest collected flows back
            to stakers pro-rata, automatically, via share price. Full mechanics:
            /finance/loans.
          </p>
          <p className="mt-2 text-caution">
            Staking isn't risk-free: your principal isn't guaranteed. If a
            borrower defaults, the loss is absorbed across all current stakers'
            share price -- including yours.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={submitStake}
            disabled={staking}
            className="rounded-full bg-gold px-4 py-2 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
          >
            {staking ? "Staking…" : "Confirm stake"}
          </button>
          <button
            onClick={() => setMode("choose")}
            disabled={staking}
            className="text-xs text-muted underline hover:text-ink"
          >
            Go back
          </button>
        </div>
        {stakeError && <p className="text-xs text-loss">{stakeError}</p>}
      </div>
    );
  }

  // mode === "collect"
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
            onClick={submitCollect}
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
      <div className="flex items-center gap-3">
        <button
          onClick={() => setConfirming(true)}
          disabled={!addressValid}
          className="self-start rounded-full bg-accent px-4 py-2 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
        >
          Continue
        </button>
        <button
          onClick={() => setMode("choose")}
          className="text-xs text-muted underline hover:text-ink"
        >
          Go back
        </button>
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}
