"use client";

import { useEffect, useState } from "react";

type BetRow = {
  id: string;
  matchLabel: string;
  displayName: string;
  sideTeamName: string;
  stakeCents: number;
  oddsMultiplier: string;
  paymentMethod: "coinvoyage" | "testnet_eth";
  status: string;
  outcome: "WON" | "LOST" | "VOID" | null;
  payoutCents: number;
  claimedAt: string | null;
  createdAt: string;
};

function outcomeBadgeClass(outcome: BetRow["outcome"]): string {
  if (outcome === "WON") return "bg-win/15 text-win";
  if (outcome === "LOST") return "bg-loss/15 text-loss";
  if (outcome === "VOID") return "bg-caution/15 text-caution";
  return "bg-border text-muted";
}

export function AdminLiveBetsPanel() {
  const [bets, setBets] = useState<BetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/live-bets", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setBets(data.bets);
      })
      .catch(() => setError("Failed to load live bets."));
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!bets) return <p className="text-sm text-muted">Loading…</p>;
  if (bets.length === 0) {
    return <p className="text-sm text-muted">No live bets placed yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">Match</th>
            <th className="px-3 py-2">Bettor</th>
            <th className="px-3 py-2">Side</th>
            <th className="px-3 py-2">Stake</th>
            <th className="px-3 py-2">Odds</th>
            <th className="px-3 py-2">Method</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Outcome</th>
            <th className="px-3 py-2">Payout</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((b) => (
            <tr key={b.id} className="border-t border-border">
              <td className="px-3 py-2 text-ink">{b.matchLabel}</td>
              <td className="px-3 py-2 text-ink">{b.displayName}</td>
              <td className="px-3 py-2 text-muted">{b.sideTeamName}</td>
              <td className="px-3 py-2 text-ink">
                ${(b.stakeCents / 100).toFixed(2)}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-gold">
                {Number(b.oddsMultiplier).toFixed(2)}x
              </td>
              <td className="px-3 py-2 text-xs text-muted">
                {b.paymentMethod === "testnet_eth"
                  ? "Testnet ETH"
                  : "CoinVoyage"}
              </td>
              <td className="px-3 py-2 text-xs text-muted">{b.status}</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${outcomeBadgeClass(b.outcome)}`}
                >
                  {b.outcome ?? "PENDING"}
                </span>
              </td>
              <td className="px-3 py-2 text-ink">
                {b.payoutCents > 0
                  ? `$${(b.payoutCents / 100).toFixed(2)}${b.claimedAt ? " (claimed)" : ""}`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
