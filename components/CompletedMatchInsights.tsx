"use client";

import { useEffect, useState } from "react";

type Insights = {
  isSample: boolean;
  totalEntries: number;
  totalBets: number;
  totalWageredCents: number;
  teamBetSplit: { teamId: string; shortName: string; betCount: number }[];
  topPlayers: {
    id: string;
    name: string;
    role: string;
    teamShortName: string;
    pickPct: number;
  }[];
  topPerformer: {
    name: string;
    teamShortName: string;
    role: string;
    fantasyPoints: number;
    isReal: boolean;
  } | null;
  prizePoolCents: number;
  winner: {
    displayName: string;
    walletAddress: string | null;
    prizeCents: number;
  } | null;
};

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortWallet(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

// Two-bar categorical comparison -- chart-a/chart-b (validated pair, see
// globals.css) since the brand's primary/tertiary hues fail the dataviz
// skill's CVD lightness-band check on this dark surface.
function TeamSplitChart({ split }: { split: Insights["teamBetSplit"] }) {
  const max = Math.max(...split.map((s) => s.betCount), 1);
  const barColors = ["bg-chart-a", "bg-chart-b"];
  return (
    <div className="flex flex-col gap-3">
      {split.map((s, i) => (
        <div key={s.teamId} className="group flex items-center gap-3">
          <span className="w-10 shrink-0 text-xs font-semibold text-muted">
            {s.shortName}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-border">
            <div
              title={`${s.shortName}: ${s.betCount} bets`}
              className={`h-full rounded-full ${barColors[i % 2]} transition-all`}
              style={{ width: `${(s.betCount / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-semibold text-ink">
            {s.betCount}
          </span>
        </div>
      ))}
    </div>
  );
}

// Single-hue magnitude ramp (primary) -- rank conveyed by bar length, not
// color, so no categorical CVD pairing is needed for this one.
function TopPlayersChart({ players }: { players: Insights["topPlayers"] }) {
  const max = Math.max(...players.map((p) => p.pickPct), 1);
  return (
    <div className="flex flex-col gap-3">
      {players.map((p) => (
        <div key={p.id} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-xs font-medium text-ink">
            {p.name}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-border">
            <div
              title={`${p.name} (${p.role}, ${p.teamShortName}): picked in ${p.pickPct}% of teams`}
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(p.pickPct / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-xs font-semibold text-ink">
            {p.pickPct}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function CompletedMatchInsights({ matchId }: { matchId: string }) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/matches/${matchId}/insights`)
      .then((res) => res.json())
      .then((data) => (data.error ? setError(true) : setInsights(data)))
      .catch(() => setError(true));
  }, [matchId]);

  if (error) return null;
  if (!insights) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-border bg-surface"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Match Insights
        </h2>
        {insights.isSample && (
          <span
            title="This match had no real entries or bets, so these numbers are illustrative, not actual activity."
            className="rounded-full border border-caution/40 bg-caution/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-caution"
          >
            Sample data
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total bets" value={String(insights.totalBets)} />
        <StatTile
          label="Contest entries"
          value={String(insights.totalEntries)}
        />
        <StatTile
          label="Total wagered"
          value={usd(insights.totalWageredCents)}
        />
        <StatTile label="Prize pool" value={usd(insights.prizePoolCents)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">
            Betting split by side
          </p>
          <TeamSplitChart split={insights.teamBetSplit} />
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">
            Most picked players
          </p>
          <TopPlayersChart players={insights.topPlayers} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {insights.topPerformer && (
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-2 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Top performer
              </p>
              {!insights.topPerformer.isReal && (
                <span className="rounded-full border border-caution/40 bg-caution/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-caution">
                  Estimated
                </span>
              )}
            </div>
            <p className="font-display text-xl font-bold text-ink">
              {insights.topPerformer.name}
            </p>
            <p className="mt-1 text-sm text-muted">
              {insights.topPerformer.teamShortName} &middot;{" "}
              {insights.topPerformer.role}
            </p>
            <p className="mt-3 text-2xl font-bold text-secondary">
              {insights.topPerformer.fantasyPoints.toFixed(1)}
              <span className="ml-1 text-xs font-normal text-muted">
                fantasy pts
              </span>
            </p>
          </div>
        )}

        {insights.winner && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">🏆</span>
              <p className="text-xs font-semibold uppercase tracking-wide text-gold">
                Contest winner
              </p>
            </div>
            <p className="font-display text-lg font-bold text-ink">
              {insights.winner.displayName}
            </p>
            <p className="mt-1 font-mono text-xs text-muted">
              {insights.winner.walletAddress
                ? shortWallet(insights.winner.walletAddress)
                : "Payout wallet pending"}
            </p>
            <p className="mt-3 text-2xl font-bold text-gold">
              {usd(insights.winner.prizeCents)}
              <span className="ml-1 text-xs font-normal text-muted">won</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
