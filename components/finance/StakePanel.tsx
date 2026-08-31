"use client";

import { useEffect, useState } from "react";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type PoolState = {
  totalPoolValueWei: string;
  totalLoanedWei: string;
  availableLiquidityWei: string;
  sharePrice: number;
};
type Position = {
  id: string;
  principalWei: string;
  currentValueWei: string | null;
  stakedAt: string;
  withdrawnAt: string | null;
  withdrawnValueWei: string | null;
};

function formatEth(wei: string): string {
  return (Number(wei) / 1e18).toFixed(4);
}

function WithdrawForm({
  positionId,
  onDone,
}: {
  positionId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/stake/${positionId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toAddress: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to withdraw.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to withdraw.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-900 hover:text-blue-900"
      >
        Withdraw
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x..."
          className="w-56 rounded border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={submitting || !ADDRESS_RE.test(address.trim())}
          className="rounded bg-blue-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "…" : "Confirm"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function StakePanel() {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);

  async function loadMine() {
    const res = await fetch("/api/stake");
    if (res.status === 401) {
      setSignedIn(false);
      setPositions([]);
      return;
    }
    const data = await res.json();
    setPositions(data.positions ?? []);
  }

  useEffect(() => {
    fetch("/api/pool")
      .then((r) => r.json())
      .then(setPool);
    loadMine();
  }, []);

  if (!pool) return <p className="text-sm text-slate-500">Loading…</p>;

  const activePositions = (positions ?? []).filter((p) => !p.withdrawnAt);
  const closedPositions = (positions ?? []).filter((p) => p.withdrawnAt);

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h2 className="font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-900">
          How staking works -- in full
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 text-sm leading-relaxed text-slate-700 sm:grid-cols-2">
          <p>
            <span className="font-semibold text-slate-900">How you earn:</span>{" "}
            when a borrower repays interest, it's added directly to the pool's
            value, raising the price of every share -- including yours,
            automatically, no claim needed.
          </p>
          <p>
            <span className="font-semibold text-slate-900">The risk:</span> your
            principal is not guaranteed. If a loan defaults, the unpaid amount
            is written off against the pool -- every staker's share value drops,
            including yours.
          </p>
          <p>
            <span className="font-semibold text-slate-900">Liquidity:</span> you
            can withdraw anytime, but only up to the pool's currently available
            (non-loaned) balance.
          </p>
          <p>
            <span className="font-semibold text-slate-900">
              Where you stake from:
            </span>{" "}
            choose "Stake" instead of "Collect" when claiming a contest prize or
            live-bet payout -- never automatic.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-6 border-t border-slate-200 pt-4 text-sm">
          <p>
            Pool value:{" "}
            <span className="font-semibold text-slate-900">
              {formatEth(pool.totalPoolValueWei)} ETH
            </span>
          </p>
          <p>
            Current share price:{" "}
            <span className="font-semibold text-slate-900">
              {pool.sharePrice.toFixed(6)}
            </span>
          </p>
          <p>
            Available to withdraw pool-wide:{" "}
            <span className="font-semibold text-slate-900">
              {formatEth(pool.availableLiquidityWei)} ETH
            </span>
          </p>
        </div>
      </section>

      {!signedIn ? (
        <p className="text-sm text-slate-500">
          Sign in on SquadXI to see your stake.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-4 font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-900">
              My stake
            </h2>
            {activePositions.length === 0 ? (
              <p className="text-sm text-slate-500">
                No active stake positions. Choose "Stake" when claiming a prize
                to get started.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {activePositions.map((p) => {
                  const earned =
                    p.currentValueWei !== null
                      ? BigInt(p.currentValueWei) - BigInt(p.principalWei)
                      : BigInt(0);
                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatEth(p.currentValueWei ?? p.principalWei)} ETH
                        </p>
                        <p className="text-xs text-slate-500">
                          Staked {formatEth(p.principalWei)} ETH ·{" "}
                          {earned >= BigInt(0) ? "+" : ""}
                          {formatEth(earned.toString())} ETH earned
                        </p>
                      </div>
                      <WithdrawForm positionId={p.id} onDone={loadMine} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {closedPositions.length > 0 && (
            <section>
              <h2 className="mb-4 font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-900">
                Past positions
              </h2>
              <div className="flex flex-col gap-3">
                {closedPositions.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 text-sm text-slate-600"
                  >
                    <p>
                      Staked {formatEth(p.principalWei)} ETH, withdrew{" "}
                      {formatEth(p.withdrawnValueWei ?? "0")} ETH
                    </p>
                    <p className="text-xs text-slate-400">
                      {p.withdrawnAt &&
                        new Date(p.withdrawnAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
