"use client";

import { useEffect, useState } from "react";

type LoanRow = {
  id: string;
  borrowerName: string;
  principalWei: string;
  interestRateBps: number;
  termDays: number;
  totalInterestOwedWei: string;
  status: string;
  requestedAt: string;
  approvedAt: string | null;
  dueAt: string | null;
  borrowerWalletAddress: string | null;
  disbursedTxHash: string | null;
  repaidPrincipalWei: string;
  repaidInterestWei: string;
  defaultedAt: string | null;
};
type PoolState = {
  totalPoolValueWei: string;
  totalSharesIssued: string;
  totalLoanedWei: string;
  availableLiquidityWei: string;
  sharePrice: number;
};
type LoansResponse = {
  pending: LoanRow[];
  active: LoanRow[];
  history: LoanRow[];
  pool: PoolState;
};

function formatEth(wei: string): string {
  return (Number(wei) / 1e18).toFixed(4);
}

function ActionButton({
  label,
  colorClass,
  onClick,
}: {
  label: string;
  colorClass: string;
  onClick: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={async () => {
          setSubmitting(true);
          setError(null);
          try {
            await onClick();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed.");
          } finally {
            setSubmitting(false);
          }
        }}
        disabled={submitting}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold text-paper transition disabled:opacity-50 ${colorClass}`}
      >
        {submitting ? "…" : label}
      </button>
      {error && <p className="text-xs text-loss">{error}</p>}
    </div>
  );
}

export function AdminLoanPoolPanel() {
  const [data, setData] = useState<LoansResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/loans", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load loans.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load loans.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function post(path: string) {
    const res = await fetch(path, { method: "POST" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed.");
    await load();
  }

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading loan queue…</p>;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Pool value",
            value: `${formatEth(data.pool.totalPoolValueWei)} ETH`,
          },
          {
            label: "Loaned out",
            value: `${formatEth(data.pool.totalLoanedWei)} ETH`,
          },
          {
            label: "Available",
            value: `${formatEth(data.pool.availableLiquidityWei)} ETH`,
          },
          { label: "Share price", value: data.pool.sharePrice.toFixed(4) },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-surface p-3"
          >
            <p className="text-xs uppercase tracking-wide text-muted">
              {s.label}
            </p>
            <p className="mt-1 text-lg font-semibold text-ink">{s.value}</p>
          </div>
        ))}
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">
          Pending applications ({data.pending.length})
        </h3>
        {data.pending.length === 0 ? (
          <p className="text-sm text-muted">Nothing to review right now.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Borrower</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Rate / term</th>
                  <th className="px-3 py-2">Wallet</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.pending.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2 text-ink">{l.borrowerName}</td>
                    <td className="px-3 py-2 font-semibold text-ink">
                      {formatEth(l.principalWei)} ETH
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {(l.interestRateBps / 100).toFixed(2)}% / {l.termDays}d
                    </td>
                    <td
                      className="max-w-[160px] truncate px-3 py-2 font-mono text-xs text-ink/80"
                      title={l.borrowerWalletAddress ?? undefined}
                    >
                      {l.borrowerWalletAddress ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <ActionButton
                          label="Approve"
                          colorClass="bg-win hover:opacity-90"
                          onClick={() =>
                            post(`/api/admin/loans/${l.id}/approve`)
                          }
                        />
                        <ActionButton
                          label="Reject"
                          colorClass="bg-loss hover:opacity-90"
                          onClick={() =>
                            post(`/api/admin/loans/${l.id}/reject`)
                          }
                        />
                      </div>
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
          Active loans ({data.active.length})
        </h3>
        {data.active.length === 0 ? (
          <p className="text-sm text-muted">No loans currently outstanding.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Borrower</th>
                  <th className="px-3 py-2">Owed</th>
                  <th className="px-3 py-2">Repaid</th>
                  <th className="px-3 py-2">Due</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.active.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2 text-ink">{l.borrowerName}</td>
                    <td className="px-3 py-2 text-ink">
                      {formatEth(l.principalWei)} +{" "}
                      {formatEth(l.totalInterestOwedWei)} int
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {formatEth(l.repaidPrincipalWei)} +{" "}
                      {formatEth(l.repaidInterestWei)} int
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {l.dueAt ? new Date(l.dueAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ActionButton
                        label="Mark defaulted"
                        colorClass="bg-loss hover:opacity-90"
                        onClick={() => post(`/api/admin/loans/${l.id}/default`)}
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
          History ({data.history.length})
        </h3>
        {data.history.length === 0 ? (
          <p className="text-sm text-muted">No resolved loans yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Borrower</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2 text-ink">{l.borrowerName}</td>
                    <td className="px-3 py-2 text-ink/80">
                      {formatEth(l.principalWei)} ETH
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                          l.status === "REPAID"
                            ? "bg-win/15 text-win"
                            : l.status === "DEFAULTED"
                              ? "bg-loss/15 text-loss"
                              : "bg-border text-muted"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
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
