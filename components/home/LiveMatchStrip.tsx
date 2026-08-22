"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TeamCrest } from "./TeamCrest";

type Team = { id: string; name: string; shortName: string; logo: string };
type MatchRow = {
  id: string;
  status: string;
  venue: string;
  scheduledAt: string;
  team1: Team | null;
  team2: Team | null;
};

function StatusPill({ status }: { status: string }) {
  if (status === "LIVE") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
        Live
      </span>
    );
  }
  if (status === "UPCOMING") {
    return (
      <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold">
        Upcoming
      </span>
    );
  }
  return (
    <span className="rounded-full bg-border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
      Final
    </span>
  );
}

export function LiveMatchStrip() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);

  useEffect(() => {
    fetch("/api/matches")
      .then((res) => res.json())
      .then((data) => setMatches(data.matches ?? []))
      .catch(() => setMatches([]));
  }, []);

  if (!matches) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 w-64 shrink-0 animate-pulse rounded-2xl border border-border bg-surface"
          />
        ))}
      </div>
    );
  }

  const order = { LIVE: 0, UPCOMING: 1, COMPLETED: 2 } as const;
  const sorted = [...matches].sort(
    (a, b) =>
      (order[a.status as keyof typeof order] ?? 3) -
      (order[b.status as keyof typeof order] ?? 3),
  );

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex gap-3 pb-2">
        {sorted.map((m) => (
          <Link
            key={m.id}
            href={
              m.status === "UPCOMING"
                ? `/matches/${m.id}`
                : `/matches/${m.id}/live`
            }
            className="flex w-64 shrink-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/50 hover:bg-surface/80"
          >
            <div className="flex items-center justify-between">
              <StatusPill status={m.status} />
              <span className="truncate text-[11px] text-muted">{m.venue}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center gap-1">
                <TeamCrest
                  shortName={m.team1?.shortName ?? "?"}
                  logo={m.team1?.logo ?? "?"}
                  size="sm"
                />
                <span className="text-xs font-semibold text-ink">
                  {m.team1?.shortName ?? "?"}
                </span>
              </div>
              <span className="font-display text-xs uppercase tracking-wide text-muted">
                vs
              </span>
              <div className="flex flex-col items-center gap-1">
                <TeamCrest
                  shortName={m.team2?.shortName ?? "?"}
                  logo={m.team2?.logo ?? "?"}
                  size="sm"
                />
                <span className="text-xs font-semibold text-ink">
                  {m.team2?.shortName ?? "?"}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
