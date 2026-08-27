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

function CreateContestForm({
  matchId,
  onDone,
}: {
  matchId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Head to Head");
  const [entryFee, setEntryFee] = useState("5.00");
  const [maxEntries, setMaxEntries] = useState("10");
  const [roleBonusPct, setRoleBonusPct] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const entryFeeCents = Math.round(parseFloat(entryFee) * 100);
    const maxEntriesNum = parseInt(maxEntries, 10);
    const roleBonusBps = Math.round(parseFloat(roleBonusPct) * 100);
    if (!Number.isInteger(entryFeeCents) || entryFeeCents <= 0) {
      setError("Entry fee must be a positive dollar amount.");
      return;
    }
    if (!Number.isInteger(maxEntriesNum) || maxEntriesNum < 2) {
      setError("Max entries must be at least 2.");
      return;
    }
    if (
      !Number.isInteger(roleBonusBps) ||
      roleBonusBps < 0 ||
      roleBonusBps > 10000
    ) {
      setError("Role bonus % must be between 0 and 100.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/contests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          name,
          entryFeeCents,
          maxEntries: maxEntriesNum,
          roleBonusBps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create contest.");
      setOpen(false);
      onDone();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create contest.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-primary hover:text-ink"
      >
        + Contest
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-28 rounded-lg border border-border bg-paper px-2 py-1 text-xs text-ink"
        />
        <input
          value={entryFee}
          onChange={(e) => setEntryFee(e.target.value)}
          placeholder="Fee $"
          className="w-16 rounded-lg border border-border bg-paper px-2 py-1 text-xs text-ink"
        />
        <input
          value={maxEntries}
          onChange={(e) => setMaxEntries(e.target.value)}
          placeholder="Max"
          className="w-14 rounded-lg border border-border bg-paper px-2 py-1 text-xs text-ink"
        />
        <input
          value={roleBonusPct}
          onChange={(e) => setRoleBonusPct(e.target.value)}
          placeholder="RH %"
          title="% of the prize pool carved out for Robinhood Chain role bonuses"
          className="w-14 rounded-lg border border-border bg-paper px-2 py-1 text-xs text-ink"
        />
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {submitting ? "…" : "Create"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-full border border-border px-2 py-1.5 text-xs text-muted transition hover:text-ink"
        >
          ×
        </button>
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}

function AdvanceButton({
  matchId,
  onDone,
}: {
  matchId: string;
  onDone: () => void;
}) {
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
          className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {submitting ? "…" : "Advance +1 over"}
        </button>
        <button
          onClick={() => advance(500)}
          disabled={submitting}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-primary hover:text-ink disabled:opacity-50"
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
                      ? "bg-loss/15 text-loss"
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
                <div className="flex flex-col items-end gap-2">
                  {m.status === "UPCOMING" && (
                    <CreateContestForm matchId={m.id} onDone={load} />
                  )}
                  {m.status === "COMPLETED" ? (
                    <span className="text-xs text-muted">Done</span>
                  ) : (
                    <AdvanceButton matchId={m.id} onDone={load} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
