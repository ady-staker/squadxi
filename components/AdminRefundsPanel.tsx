"use client";

import { useEffect, useState } from "react";

type RefundRow = {
  contestEntryId: string;
  displayName: string;
  email: string | null;
  contestName: string | null;
  entryFeeCents: number;
  coinvoyageOrderId: string | null;
  createdAt: string;
};

function RefundButton({
  contestEntryId,
  onDone,
}: {
  contestEntryId: string;
  onDone: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/contest-entries/${contestEntryId}/refund`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refund failed.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-full bg-caution px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
      >
        Refund
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">
          Send a real refund via CoinVoyage?
        </span>
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-full bg-caution px-3 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Refunding…" : "Confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}

export function AdminRefundsPanel() {
  const [rows, setRows] = useState<RefundRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/refund-queue", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok)
        throw new Error(json.error ?? "Failed to load refund queue.");
      setRows(json.entries);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load refund queue.",
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!rows) return <p className="text-sm text-muted">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        No voided-contest refunds waiting for review.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">Contest</th>
            <th className="px-3 py-2">Amount</th>
            <th className="px-3 py-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.contestEntryId} className="border-t border-border">
              <td className="px-3 py-2 text-ink">{r.displayName}</td>
              <td className="px-3 py-2 text-muted">{r.contestName ?? "—"}</td>
              <td className="px-3 py-2 font-semibold text-caution">
                ${(r.entryFeeCents / 100).toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right">
                <RefundButton contestEntryId={r.contestEntryId} onDone={load} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
