"use client";

import { useEffect, useState } from "react";

type Overview = {
  totalUsers: number;
  matchesByStatus: Record<string, number>;
  contestsByStatus: Record<string, number>;
  entryFeeVolumeCents: number;
  pendingPayoutCount: number;
  pendingPayoutValueCents: number;
  recentSignups: {
    id: string;
    email: string;
    displayName: string;
    createdAt: string;
  }[];
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "gold" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          accent === "gold"
            ? "text-gold"
            : accent === "warn"
              ? "text-caution"
              : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatusChips({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0)
    return <span className="text-xs text-muted">none</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([status, count]) => (
        <span
          key={status}
          className="rounded-full border border-border px-2.5 py-1 text-xs text-muted"
        >
          {status} <span className="font-semibold text-ink">{count}</span>
        </span>
      ))}
    </div>
  );
}

export function AdminOverviewPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => (json.error ? setError(json.error) : setData(json)))
      .catch(() => setError("Failed to load overview."));
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total users" value={data.totalUsers} />
        <StatCard
          label="Entry-fee volume"
          value={formatCents(data.entryFeeVolumeCents)}
          accent="gold"
        />
        <StatCard
          label="Pending payouts"
          value={data.pendingPayoutCount}
          accent="warn"
        />
        <StatCard
          label="Pending payout value"
          value={formatCents(data.pendingPayoutValueCents)}
          accent="warn"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Matches by status
          </p>
          <StatusChips counts={data.matchesByStatus} />
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">
            Contests by status
          </p>
          <StatusChips counts={data.contestsByStatus} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Recent signups
        </p>
        {data.recentSignups.length === 0 ? (
          <p className="text-sm text-muted">No signups yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {data.recentSignups.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="text-ink">{u.displayName}</span>
                <span className="text-muted">{u.email}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
