"use client";

import { useEffect, useState } from "react";
import { LiveBetPanel } from "@/components/LiveBetPanel";
import { CompletedMatchInsights } from "@/components/CompletedMatchInsights";
import { EnteredMatchOverview } from "@/components/EnteredMatchOverview";
import { BallByBallFeed, type FeedEvent } from "@/components/BallByBallFeed";
import { MatchStageTracker } from "@/components/MatchStageTracker";

type InningsSummary = {
  innings: number;
  runs: number;
  wickets: number;
  legalBalls: number;
};
type LeaderboardRow = {
  userId: string;
  displayName: string;
  fantasyTeamName: string;
  totalPoints: number;
  rank: number;
};
type Team = { id: string; shortName: string; name: string };
type MyBet = {
  id: string;
  sideTeamId: string;
  stakeCents: number;
  oddsMultiplier: string;
};
type LiveData = {
  myBets: MyBet[];
  match: {
    id: string;
    status: string;
    currentEventSequence: number;
    totalEvents: number;
    winnerTeamId: string | null;
    team1: Team | null;
    team2: Team | null;
    odds: { team1Multiplier: number; team2Multiplier: number } | null;
  };
  innings: InningsSummary[];
  recentEvents: FeedEvent[];
  leaderboard: LeaderboardRow[];
};

const POLL_MS = 6000;

function formatOvers(legalBalls: number): string {
  const overs = Math.floor(legalBalls / 6);
  const balls = legalBalls % 6;
  return `${overs}.${balls}`;
}

export function LiveMatchView({ matchId }: { matchId: string }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/matches/${matchId}/live`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled) {
          if (json.error) setError(json.error);
          else {
            setData(json);
            setError(null);
          }
        }
      } catch {
        if (!cancelled) setError("Failed to load live data.");
      }
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [matchId]);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  const progressPct =
    data.match.totalEvents > 0
      ? Math.round(
          (data.match.currentEventSequence / data.match.totalEvents) * 100,
        )
      : 0;

  const winner =
    data.match.status === "COMPLETED" && data.match.winnerTeamId
      ? [data.match.team1, data.match.team2].find(
          (t) => t?.id === data.match.winnerTeamId,
        )
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              data.match.status === "LIVE"
                ? "bg-accent/15 text-accent"
                : data.match.status === "COMPLETED"
                  ? "bg-gold/15 text-gold"
                  : "bg-border text-muted"
            }`}
          >
            {data.match.status === "LIVE" ? "● Live" : data.match.status}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <MatchStageTracker status={data.match.status} innings={data.innings} />

      <EnteredMatchOverview matchId={matchId} />

      {data.innings.length === 0 ? (
        <p className="text-sm text-muted">No play revealed yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.innings.map((inn) => (
            <div
              key={`${inn.innings}-${inn.runs}-${inn.wickets}`}
              className="animate-score-flash rounded-xl border border-border bg-surface p-4"
            >
              <p className="text-xs uppercase tracking-wide text-muted">
                Innings {inn.innings}
              </p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {inn.runs}/{inn.wickets}
                <span className="ml-2 text-sm font-normal text-muted">
                  ({formatOvers(inn.legalBalls)} ov)
                </span>
              </p>
            </div>
          ))}
        </div>
      )}

      {data.match.status !== "UPCOMING" && (
        <BallByBallFeed events={data.recentEvents} />
      )}

      {data.match.status === "COMPLETED" && (
        <>
          <div className="rounded-2xl border border-gold/40 bg-gold/5 px-6 py-8 text-center animate-rise-in">
            <p className="text-xs font-semibold uppercase tracking-wide text-gold">
              Result
            </p>
            <p className="mt-2 font-display text-2xl font-bold text-ink sm:text-3xl">
              {winner ? `${winner.name} won` : "Match complete"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {data.innings.length === 2 &&
                `${data.innings[0].runs}/${data.innings[0].wickets} vs ${data.innings[1].runs}/${data.innings[1].wickets}`}
            </p>
          </div>
          <CompletedMatchInsights matchId={data.match.id} />
        </>
      )}

      {data.match.status === "LIVE" &&
        data.match.team1 &&
        data.match.team2 &&
        data.match.odds && (
          <LiveBetPanel
            key={data.match.id}
            matchId={data.match.id}
            team1={data.match.team1}
            team2={data.match.team2}
            odds={data.match.odds}
            existingBets={data.myBets}
          />
        )}

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Leaderboard
        </h2>
        {data.leaderboard.length === 0 ? (
          <p className="text-sm text-muted">
            No fantasy teams for this match yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2">Rank</th>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2">Team</th>
                  <th className="px-4 py-2 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((row) => (
                  <tr
                    key={row.userId}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-2 font-mono text-muted">
                      {row.rank}
                    </td>
                    <td className="px-4 py-2 text-ink">{row.displayName}</td>
                    <td className="px-4 py-2 text-muted">
                      {row.fantasyTeamName}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-accent">
                      {row.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
