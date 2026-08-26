"use client";

import { useEffect, useState } from "react";

type PlayerSummary = {
  id: string;
  name: string;
  role: string;
  creditValue: number;
  battingSkill: number;
  bowlingSkill: number;
  teamId: string;
};
type TeamSummary = {
  id: string;
  name: string;
  shortName: string;
  logo: string;
  captain: PlayerSummary | null;
  viceCaptain: PlayerSummary | null;
};
type MyTeam = {
  id: string;
  name: string;
  captain: PlayerSummary | null;
  viceCaptain: PlayerSummary | null;
};
type ContestFill = {
  id: string;
  name: string;
  currentEntries: number;
  maxEntries: number;
  prizePoolCents: number;
  status: string;
};
type Summary = {
  entered: boolean;
  match?: {
    scheduledAt: string;
    status: string;
    team1: TeamSummary | null;
    team2: TeamSummary | null;
  };
  myTeams?: MyTeam[];
  contests?: ContestFill[];
};

const POLL_MS = 5000;

// Ticks independently of the data poll -- the countdown shouldn't visibly
// stall for up to POLL_MS between network refreshes.
function useCountdown(targetIso: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  if (!targetIso) return null;
  const diffMs = new Date(targetIso).getTime() - now;
  if (diffMs <= 0) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

function PlayerCard({
  label,
  player,
}: {
  label: string;
  player: PlayerSummary | null;
}) {
  if (!player) return null;
  return (
    <div className="rounded-lg border border-border bg-paper p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm font-semibold text-ink">{player.name}</p>
      <p className="text-xs text-muted">
        {player.role} &middot; {player.creditValue.toFixed(1)} credits
      </p>
    </div>
  );
}

export function EnteredMatchOverview({ matchId }: { matchId: string }) {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/matches/${matchId}/entered-summary`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // Transient poll failure -- next interval tick retries.
      }
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [matchId]);

  const countdown = useCountdown(data?.match?.scheduledAt);

  if (!data?.entered || !data.match) return null;

  const contests = data.contests ?? [];
  const totalCurrent = contests.reduce((sum, c) => sum + c.currentEntries, 0);
  const totalMax = contests.reduce((sum, c) => sum + c.maxEntries, 0);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-accent/30 bg-accent/5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          You&apos;re in!
        </p>
        {contests.length > 0 && (
          <p className="text-xs text-muted">
            <span className="font-semibold text-ink">
              {totalCurrent}/{totalMax}
            </span>{" "}
            entered so far
          </p>
        )}
      </div>

      {countdown && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Match starts in
          </p>
          <div className="flex items-center gap-5">
            {[
              { label: "days", value: countdown.days },
              { label: "hrs", value: countdown.hours },
              { label: "min", value: countdown.minutes },
              { label: "sec", value: countdown.seconds },
            ].map((u) => (
              <div key={u.label} className="text-center">
                <p className="font-display text-3xl font-bold text-ink">
                  {String(u.value).padStart(2, "0")}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-muted">
                  {u.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[data.match.team1, data.match.team2].map(
          (team) =>
            team && (
              <div
                key={team.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {team.shortName} leadership
                </p>
                <div className="flex flex-col gap-2">
                  <PlayerCard label="Captain" player={team.captain} />
                  <PlayerCard label="Vice-captain" player={team.viceCaptain} />
                </div>
              </div>
            ),
        )}
      </div>

      {data.myTeams && data.myTeams.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Your picks
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.myTeams.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-gold/30 bg-gold/5 p-4"
              >
                <p className="mb-2 text-xs font-semibold text-ink">{t.name}</p>
                <div className="flex flex-col gap-2">
                  <PlayerCard label="Your captain (2x)" player={t.captain} />
                  <PlayerCard
                    label="Your vice-captain (1.5x)"
                    player={t.viceCaptain}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
