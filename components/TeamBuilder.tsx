"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  validateFantasyTeam,
  ROLE_LIMITS,
  SQUAD_SIZE,
  TOTAL_CREDITS,
  MAX_PER_REAL_TEAM,
  type TeamBuilderPlayer,
} from "@/lib/team-builder-rules";

type ApiPlayer = TeamBuilderPlayer & {
  name: string;
  battingSkill: number;
  bowlingSkill: number;
};

type MatchInfo = {
  id: string;
  status: string;
  venue: string;
  scheduledAt: string;
  team1: { id: string; name: string; shortName: string; logo: string } | null;
  team2: { id: string; name: string; shortName: string; logo: string } | null;
};

const ROLE_ORDER = ["WK", "BAT", "BOWL", "AR"];
const ROLE_LABEL: Record<string, string> = {
  WK: "Wicketkeepers",
  BAT: "Batters",
  BOWL: "Bowlers",
  AR: "All-rounders",
};

export function TeamBuilder({ matchId }: { matchId: string }) {
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [players, setPlayers] = useState<ApiPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState<string>("");
  const [viceCaptainId, setViceCaptainId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string[] | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch(`/api/matches/${matchId}/players`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setMatch(data.match);
        setPlayers(data.players);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load match."))
      .finally(() => setLoading(false));
  }, [matchId]);

  const teamById = useMemo(() => {
    const map = new Map<string, { name: string; shortName: string }>();
    if (match?.team1) map.set(match.team1.id, match.team1);
    if (match?.team2) map.set(match.team2.id, match.team2);
    return map;
  }, [match]);

  const pool: TeamBuilderPlayer[] = useMemo(
    () => players.map((p) => ({ id: p.id, teamId: p.teamId, role: p.role, creditValue: p.creditValue })),
    [players]
  );

  const creditsUsed = useMemo(
    () => selected.reduce((sum, id) => sum + (players.find((p) => p.id === id)?.creditValue ?? 0), 0),
    [selected, players]
  );
  const creditsRemaining = TOTAL_CREDITS - creditsUsed;

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { WK: 0, BAT: 0, BOWL: 0, AR: 0 };
    for (const id of selected) {
      const p = players.find((pl) => pl.id === id);
      if (p) counts[p.role] = (counts[p.role] ?? 0) + 1;
    }
    return counts;
  }, [selected, players]);

  const validation = useMemo(
    () => validateFantasyTeam(pool, selected, captainId, viceCaptainId),
    [pool, selected, captainId, viceCaptainId]
  );

  function togglePlayer(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        if (captainId === id) setCaptainId("");
        if (viceCaptainId === id) setViceCaptainId("");
        return prev.filter((p) => p !== id);
      }
      if (prev.length >= SQUAD_SIZE) return prev; // full -- ignore extra picks
      return [...prev, id];
    });
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (!validation.valid) {
      setSubmitError(validation.errors);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/fantasy-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, playerIds: selected, captainId, viceCaptainId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.details ? data.details.join(" ") : data.error ?? "Failed to save team.");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setSubmitError([err instanceof Error ? err.message : "Failed to save team."]);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Loading match…</p>;
  if (loadError) return <p className="text-sm text-loss">{loadError}</p>;
  if (!match) return null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">
          {match.team1?.shortName ?? "?"} vs {match.team2?.shortName ?? "?"}
        </h1>
        <p className="text-sm text-muted">{match.venue}</p>
      </div>

      <div className="sticky top-4 z-10 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-xl font-bold ${creditsRemaining < 0 ? "text-loss" : "text-gold"}`}>
            {creditsRemaining.toFixed(1)}
          </span>
          <span className="text-xs text-muted">credits left</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-ink">{selected.length}</span>
          <span className="text-xs text-muted">/ {SQUAD_SIZE} players</span>
        </div>
        {ROLE_ORDER.map((role) => (
          <span
            key={role}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted"
          >
            {role} {roleCounts[role] ?? 0}/{ROLE_LIMITS[role].min}-{ROLE_LIMITS[role].max}
          </span>
        ))}
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
          max {MAX_PER_REAL_TEAM}/team
        </span>
      </div>

      {ROLE_ORDER.map((role) => (
        <div key={role}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            {ROLE_LABEL[role]}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {players
              .filter((p) => p.role === role)
              .map((p) => {
                const isSelected = selected.includes(p.id);
                const team = teamById.get(p.teamId);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlayer(p.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                      isSelected
                        ? "border-accent bg-accent/10"
                        : "border-border bg-surface hover:border-accent/50"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-muted">{team?.shortName ?? p.teamId}</p>
                    </div>
                    <span className="text-sm font-semibold text-gold">{p.creditValue.toFixed(1)}</span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      {selected.length === SQUAD_SIZE && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
            Captain &amp; Vice-Captain
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {selected.map((id) => {
              const p = players.find((pl) => pl.id === id);
              if (!p) return null;
              return (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <span className="text-sm text-ink">{p.name}</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCaptainId(id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        captainId === id
                          ? "bg-gold text-paper"
                          : "border border-border text-muted hover:border-gold"
                      }`}
                    >
                      C
                    </button>
                    <button
                      type="button"
                      onClick={() => setViceCaptainId(id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        viceCaptainId === id
                          ? "bg-accent text-paper"
                          : "border border-border text-muted hover:border-accent"
                      }`}
                    >
                      VC
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {submitError && (
        <ul className="list-inside list-disc rounded-xl border border-loss/40 bg-loss/10 p-4 text-sm text-loss">
          {submitError.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !validation.valid}
        className="w-full rounded-full bg-accent px-6 py-3 text-sm font-semibold text-paper transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save team"}
      </button>
    </div>
  );
}
