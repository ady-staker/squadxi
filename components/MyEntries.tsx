"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";

type Entry = {
  id: string;
  matchId: string;
  matchStatus: string | null;
  name: string;
  kind: "contest" | "league";
  fantasyTeamName: string;
  totalPoints: number;
  paymentStatus: string;
  rank: number | null;
  prizeCents: number;
  roleBonus: { claimId: string; role: string; status: string } | null;
};

function paymentLabel(status: string): string {
  if (status === "NONE" || status === "COMPLETED") return "Confirmed";
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? status;
}

export function MyEntries() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/my/entries", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) =>
        data.error ? setError(data.error) : setEntries(data.entries),
      )
      .catch(() => setError("Failed to load your entries."));
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!entries) return <p className="text-sm text-muted">Loading…</p>;
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        You haven't joined any leagues or contests yet.{" "}
        <Link href="/matches" className="text-accent underline">
          Browse matches
        </Link>{" "}
        to get started.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <div key={e.id} className="flex flex-col gap-1.5">
          <Link
            href={
              e.matchStatus === "UPCOMING"
                ? `/matches/${e.matchId}`
                : `/matches/${e.matchId}/live`
            }
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition hover:border-accent/50"
          >
            <div>
              <p className="font-medium text-ink">
                {e.name}{" "}
                <span className="text-xs uppercase tracking-wide text-muted">
                  {e.kind}
                </span>
              </p>
              <p className="text-xs text-muted">{e.fantasyTeamName}</p>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <p className="text-xs text-muted">Points</p>
                <p className="font-semibold text-accent">{e.totalPoints}</p>
              </div>
              {e.rank && (
                <div>
                  <p className="text-xs text-muted">Rank</p>
                  <p className="font-semibold text-ink">#{e.rank}</p>
                </div>
              )}
              {e.prizeCents > 0 && (
                <div>
                  <p className="text-xs text-muted">Prize</p>
                  <p className="font-semibold text-gold">
                    ${(e.prizeCents / 100).toFixed(2)}
                  </p>
                </div>
              )}
              <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
                {paymentLabel(e.paymentStatus)}
              </span>
            </div>
          </Link>
          {e.roleBonus && e.roleBonus.status !== "CLAIMED" && (
            <Link
              href={`/claim/${e.roleBonus.claimId}`}
              className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold text-gold transition hover:border-gold"
            >
              You won Best {e.roleBonus.role} — claim your Robinhood Chain bonus
              →
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
