"use client";

import { useEffect, useState } from "react";

type PlatformSettings = {
  bettingFrozen: boolean;
  bettingFrozenMessage: string | null;
  defaultRakeBps: number;
  defaultMinEntriesToRun: number;
  defaultRoleBonusBps: number;
  minLiveBetStakeCents: number;
  maxLiveBetStakeCents: number;
};

// bps <-> percent-input helpers, same rounding convention as the rake field
// already accepted by app/api/admin/contests.
function bpsToPercentInput(bps: number): string {
  return (bps / 100).toString();
}
function percentInputToBps(input: string): number {
  return Math.round(Number(input) * 100);
}

export function AdminPlatformSettingsPanel() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [form, setForm] = useState<{
    bettingFrozen: boolean;
    bettingFrozenMessage: string;
    defaultRakePercent: string;
    defaultMinEntriesToRun: string;
    defaultRoleBonusPercent: string;
    minStakeDollars: string;
    maxStakeDollars: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/platform", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: PlatformSettings) => {
        setSettings(data);
        setForm({
          bettingFrozen: data.bettingFrozen,
          bettingFrozenMessage: data.bettingFrozenMessage ?? "",
          defaultRakePercent: bpsToPercentInput(data.defaultRakeBps),
          defaultMinEntriesToRun: data.defaultMinEntriesToRun.toString(),
          defaultRoleBonusPercent: bpsToPercentInput(data.defaultRoleBonusBps),
          minStakeDollars: (data.minLiveBetStakeCents / 100).toString(),
          maxStakeDollars: (data.maxLiveBetStakeCents / 100).toString(),
        });
      })
      .catch(() => setError("Failed to load platform settings."));
  }, []);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bettingFrozen: form.bettingFrozen,
          bettingFrozenMessage: form.bettingFrozenMessage.trim() || null,
          defaultRakeBps: percentInputToBps(form.defaultRakePercent),
          defaultMinEntriesToRun: Math.round(
            Number(form.defaultMinEntriesToRun),
          ),
          defaultRoleBonusBps: percentInputToBps(form.defaultRoleBonusPercent),
          minLiveBetStakeCents: Math.round(Number(form.minStakeDollars) * 100),
          maxLiveBetStakeCents: Math.round(Number(form.maxStakeDollars) * 100),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      setSettings(data);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings || !form) {
    return <p className="text-sm text-muted">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="max-w-2xl space-y-6 rounded-xl border border-border bg-surface p-4">
      <div
        className={`rounded-lg border p-4 ${form.bettingFrozen ? "border-loss/40 bg-loss/10" : "border-border"}`}
      >
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            checked={form.bettingFrozen}
            onChange={(e) =>
              setForm({ ...form, bettingFrozen: e.target.checked })
            }
          />
          Freeze new entries, league joins, and live bets sitewide
        </label>
        <p className="mt-1 text-xs text-muted">
          Existing claims and payouts still go through -- this only blocks new
          money coming in. Use during an incident or before a risky deploy.
        </p>
        {form.bettingFrozen && (
          <input
            type="text"
            placeholder="Message shown to users (optional)"
            value={form.bettingFrozenMessage}
            onChange={(e) =>
              setForm({ ...form, bettingFrozenMessage: e.target.value })
            }
            className="mt-3 w-full rounded-lg border border-border bg-paper px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
          />
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">
          New-contest defaults
        </h3>
        <p className="mb-3 text-xs text-muted">
          Prefilled when an admin creates a contest without overriding these
          fields.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-muted">
            Rake %
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.defaultRakePercent}
              onChange={(e) =>
                setForm({ ...form, defaultRakePercent: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-border bg-paper px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
          <label className="text-xs text-muted">
            Min entries to run
            <input
              type="number"
              min="2"
              step="1"
              value={form.defaultMinEntriesToRun}
              onChange={(e) =>
                setForm({ ...form, defaultMinEntriesToRun: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-border bg-paper px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
          <label className="text-xs text-muted">
            Role bonus %
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.defaultRoleBonusPercent}
              onChange={(e) =>
                setForm({ ...form, defaultRoleBonusPercent: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-border bg-paper px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">
          Live-bet stake bounds
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted">
            Min stake ($)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.minStakeDollars}
              onChange={(e) =>
                setForm({ ...form, minStakeDollars: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-border bg-paper px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
          <label className="text-xs text-muted">
            Max stake ($)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={form.maxStakeDollars}
              onChange={(e) =>
                setForm({ ...form, maxStakeDollars: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-border bg-paper px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {error && <p className="text-xs text-loss">{error}</p>}
        {saved && !error && <p className="text-xs text-secondary">Saved.</p>}
      </div>
    </div>
  );
}
