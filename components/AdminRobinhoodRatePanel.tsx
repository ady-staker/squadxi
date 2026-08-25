"use client";

import { useEffect, useState } from "react";

export function AdminRobinhoodRatePanel() {
  const [centsPerTestnetEth, setCentsPerTestnetEth] = useState<number | null>(
    null,
  );
  const [contractConfigured, setContractConfigured] = useState(false);
  const [dollarsInput, setDollarsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings/robinhood-rate", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setCentsPerTestnetEth(data.centsPerTestnetEth);
        setContractConfigured(Boolean(data.contractConfigured));
        if (data.centsPerTestnetEth) {
          setDollarsInput((data.centsPerTestnetEth / 100).toString());
        }
      })
      .catch(() => setError("Failed to load the current rate."));
  }, []);

  async function save() {
    const dollars = Number(dollarsInput);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter a positive dollar amount.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings/robinhood-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centsPerTestnetEth: Math.round(dollars * 100) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      setCentsPerTestnetEth(data.centsPerTestnetEth);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (centsPerTestnetEth === null && !error) {
    return <p className="text-sm text-muted">Loading…</p>;
  }

  const exampleCents = 500; // MIN_STAKE_CENTS / min contest entry fee, for a concrete example
  const exampleEth =
    dollarsInput && Number(dollarsInput) > 0
      ? (exampleCents / 100 / Number(dollarsInput)).toFixed(4)
      : null;

  return (
    <div className="max-w-md rounded-xl border border-border bg-surface p-4">
      {!contractConfigured && (
        <p className="mb-3 text-xs text-caution">
          Robinhood Chain contract address isn&apos;t configured -- this rate
          won&apos;t take effect until it is.
        </p>
      )}
      <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
        Dollars per testnet ETH
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">$</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={dollarsInput}
          onChange={(e) => setDollarsInput(e.target.value)}
          className="w-32 rounded-lg border border-border bg-paper px-2 py-1.5 text-sm text-ink focus:border-primary focus:outline-none"
        />
        <button
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {exampleEth && (
        <p className="mt-2 text-xs text-muted">
          A $5.00 entry/stake would cost {exampleEth} testnet ETH.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-loss">{error}</p>}
      {saved && !error && <p className="mt-2 text-xs text-secondary">Saved.</p>}
    </div>
  );
}
