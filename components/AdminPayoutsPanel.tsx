"use client";

import { useEffect, useState } from "react";

type PayoutRow = {
  payoutId: string;
  source: "contest" | "live-bet";
  displayName: string;
  email: string | null;
  contestName: string | null;
  rank: number | null;
  amountOwedCents: number;
  chain: string | null;
  token: string | null;
  walletAddress: string | null;
  status: "PENDING" | "PAID";
  txNote: string | null;
  createdAt: string;
  paidAt: string | null;
};

type PayoutsResponse = { pending: PayoutRow[]; paid: PayoutRow[] };

function ageFromNow(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "<1h";
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function MarkPaidForm({
  payoutId,
  disabled,
  onDone,
}: {
  payoutId: string;
  disabled: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [txNote, setTxNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/payouts/${payoutId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txNote: txNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to mark paid.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark paid.");
    } finally {
      setSubmitting(false);
    }
  }

  if (disabled) {
    return <span className="text-xs text-muted">Awaiting wallet</span>;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-win px-4 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90"
      >
        Mark paid
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <input
          value={txNote}
          onChange={(e) => setTxNote(e.target.value)}
          placeholder="Tx hash / note (optional)"
          className="w-44 rounded-lg border border-border bg-paper px-2 py-1 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded-full bg-win px-3 py-1.5 text-xs font-semibold text-paper transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Confirm"}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}

export function AdminPayoutsPanel() {
  const [data, setData] = useState<PayoutsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load payouts.");
      setData(json as PayoutsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payouts.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading payout queue…</p>;

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">
          Pending payouts ({data.pending.length})
        </h3>
        {data.pending.length === 0 ? (
          <p className="text-sm text-muted">Nothing owed right now.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Winner</th>
                  <th className="px-3 py-2">Contest / rank</th>
                  <th className="px-3 py-2">Amount owed</th>
                  <th className="px-3 py-2">Wallet</th>
                  <th className="px-3 py-2">Age</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.pending.map((p) => (
                  <tr key={p.payoutId} className="border-t border-border">
                    <td className="px-3 py-2 text-ink">{p.displayName}</td>
                    <td className="px-3 py-2 text-muted">
                      {p.contestName ?? "—"} {p.rank ? `(#${p.rank})` : ""}
                    </td>
                    <td className="px-3 py-2 font-semibold text-win">
                      ${(p.amountOwedCents / 100).toFixed(2)}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-3 py-2 font-mono text-xs text-ink/80"
                      title={p.walletAddress ?? undefined}
                    >
                      {p.walletAddress ?? (
                        <span className="italic text-muted">not provided</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {ageFromNow(p.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <MarkPaidForm
                        payoutId={p.payoutId}
                        disabled={!p.walletAddress}
                        onDone={load}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">
          Paid history ({data.paid.length})
        </h3>
        {data.paid.length === 0 ? (
          <p className="text-sm text-muted">No payouts recorded as paid yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Winner</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Wallet</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Tx note</th>
                </tr>
              </thead>
              <tbody>
                {data.paid.map((p) => (
                  <tr key={p.payoutId} className="border-t border-border">
                    <td className="px-3 py-2 text-ink">{p.displayName}</td>
                    <td className="px-3 py-2 text-ink/80">
                      ${(p.amountOwedCents / 100).toFixed(2)}
                    </td>
                    <td
                      className="max-w-[200px] truncate px-3 py-2 font-mono text-xs text-ink/80"
                      title={p.walletAddress ?? undefined}
                    >
                      {p.walletAddress ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted">{p.txNote ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
