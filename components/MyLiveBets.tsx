"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";

type Bet = {
  id: string;
  matchId: string;
  matchStatus: string | null;
  matchLabel: string;
  sideTeamName: string;
  stakeCents: number;
  oddsMultiplier: string;
  status: string;
  outcome: "WON" | "LOST" | "VOID" | null;
  payoutCents: number;
  claimable: boolean;
};

function paymentLabel(status: string): string {
  if (status === "COMPLETED") return "Confirmed";
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

function outcomeClass(outcome: Bet["outcome"]): string {
  if (outcome === "WON") return "text-win";
  if (outcome === "LOST") return "text-loss";
  return "text-muted";
}

export function MyLiveBets() {
  const [bets, setBets] = useState<Bet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/my/live-bets", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => (data.error ? setError(data.error) : setBets(data.bets)))
      .catch(() => setError("Failed to load your live bets."));
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!bets) return <p className="text-sm text-muted">Loading…</p>;
  if (bets.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        You haven't placed any live bets yet. Bet on a match while it's live
        from its match page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {bets.map((b) => (
        <div key={b.id} className="flex flex-col gap-1.5">
          <Link
            href={`/matches/${b.matchId}/live`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-accent/50"
          >
            <div>
              <p className="font-medium text-ink">{b.matchLabel}</p>
              <p className="text-xs text-muted">
                Bet on {b.sideTeamName} · {Number(b.oddsMultiplier).toFixed(2)}x
              </p>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-xs text-muted">Stake</p>
                <p className="font-semibold text-ink">
                  ${(b.stakeCents / 100).toFixed(2)}
                </p>
              </div>
              {b.outcome && (
                <div>
                  <p className="text-xs text-muted">Result</p>
                  <p className={`font-semibold ${outcomeClass(b.outcome)}`}>
                    {b.outcome}
                  </p>
                </div>
              )}
              {b.payoutCents > 0 && (
                <div>
                  <p className="text-xs text-muted">Payout</p>
                  <p className="font-semibold text-gold">
                    ${(b.payoutCents / 100).toFixed(2)}
                  </p>
                </div>
              )}
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                {paymentLabel(b.status)}
              </span>
            </div>
          </Link>
          {b.claimable && (
            <Link
              href={`/live-bets/claim/${b.id}`}
              className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold text-gold transition hover:border-gold"
            >
              You won — claim your Robinhood Chain payout →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
