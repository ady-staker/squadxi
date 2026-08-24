"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TeamCrest } from "@/components/home/TeamCrest";

type Team = { id: string; name: string; shortName: string; logo: string };
type MatchRow = {
  id: string;
  status: string;
  venue: string;
  format: string;
  scheduledAt: string;
  team1: Team | null;
  team2: Team | null;
};

function formatScheduledAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_ORDER = ["LIVE", "UPCOMING", "COMPLETED"];
const STATUS_LABEL: Record<string, string> = {
  LIVE: "Live now",
  UPCOMING: "Upcoming",
  COMPLETED: "Completed",
};

export function MatchList() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/matches")
      .then((res) => res.json())
      .then((data) =>
        data.error ? setError(data.error) : setMatches(data.matches),
      )
      .catch(() => setError("Failed to load matches."));
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!matches) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-xl border border-border bg-surface"
          />
        ))}
      </div>
    );
  }

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    matches: matches.filter((m) => m.status === status),
  })).filter((g) => g.matches.length > 0);

  if (grouped.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
        No matches on the board yet -- check back soon.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {grouped.map((g) => (
        <div key={g.status}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
            {STATUS_LABEL[g.status]}
            <span className="rounded-full bg-border px-2 py-0.5 text-[11px] text-muted">
              {g.matches.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {g.matches.map((m) => (
              <Link
                key={m.id}
                href={
                  m.status === "UPCOMING"
                    ? `/matches/${m.id}`
                    : `/matches/${m.id}/live`
                }
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-primary/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                    <TeamCrest
                      shortName={m.team1?.shortName ?? "?"}
                      logo={m.team1?.logo ?? "?"}
                      size="sm"
                    />
                    <TeamCrest
                      shortName={m.team2?.shortName ?? "?"}
                      logo={m.team2?.logo ?? "?"}
                      size="sm"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-ink">
                      {m.team1?.shortName ?? "?"} vs {m.team2?.shortName ?? "?"}
                    </p>
                    <p className="text-xs text-muted">
                      {m.format} &middot; {m.venue} &middot;{" "}
                      {formatScheduledAt(m.scheduledAt)}
                    </p>
                  </div>
                </div>
                {g.status === "LIVE" && (
                  <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" />
                    Live
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
