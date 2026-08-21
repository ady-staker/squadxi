"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
  if (!matches) return <p className="text-sm text-muted">Loading…</p>;

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    matches: matches.filter((m) => m.status === status),
  })).filter((g) => g.matches.length > 0);

  return (
    <div className="flex flex-col gap-10">
      {grouped.map((g) => (
        <div key={g.status}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {STATUS_LABEL[g.status]}
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
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 transition hover:border-accent/50"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {m.team1?.shortName ?? "?"} vs {m.team2?.shortName ?? "?"}
                  </p>
                  <p className="text-xs text-muted">{m.venue}</p>
                </div>
                {g.status === "LIVE" && (
                  <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
                    ● Live
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
