"use client";

import { useEffect, useState } from "react";

type MatchRow = {
  id: string;
  status: string;
  venue: string;
  currentEventSequence: number;
  totalEvents: number;
  team1: string;
  team2: string;
};

function AdvanceButton({ matchId, onDone }: { matchId: string; onDone: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance(byN: number) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/matches/${matchId}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ byN }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to advance.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          onClick={() => advance(6)}
          disabled={submitting}
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-accent-dark disabled:opacity-50"
        >
          {submitting ? "…" : "Advance +1 over"}
        </button>
        <button
          onClick={() => advance(500)}
          disabled={submitting}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:text-ink disabled:opacity-50"
        >
          Finish match
        </button>
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}

export function AdminMatchesPanel() {
  const [matches, setMatches] = useState<MatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/matches", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load matches.");
      setMatches(json.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load matches.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!matches) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">Match</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Progress</th>
            <th className="px-3 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id} className="border-t border-border">
              <td className="px-3 py-2 text-ink">
                {m.team1} vs {m.team2}
                <span className="ml-2 text-xs text-muted">{m.venue}</span>
              </td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                    m.status === "LIVE"
                      ? "bg-accent/15 text-accent"
                      : m.status === "COMPLETED"
                        ? "bg-gold/15 text-gold"
                        : "bg-border text-muted"
                  }`}
                >
                  {m.status}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted">
                {m.currentEventSequence}/{m.totalEvents || "?"}
              </td>
              <td className="px-3 py-2 text-right">
                {m.status === "COMPLETED" ? (
                  <span className="text-xs text-muted">Done</span>
                ) : (
                  <AdvanceButton matchId={m.id} onDone={load} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
