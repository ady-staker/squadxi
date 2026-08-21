"use client";

import { useEffect, useState } from "react";

type ClaimRow = {
  id: string;
  contestName: string | null;
  role: string;
  playerName: string | null;
  displayName: string;
  amountWei: string;
  walletAddress: string | null;
  status: "DECLARED" | "CLAIMED";
  txHash: string | null;
  createdAt: string;
  claimedAt: string | null;
};

function ethAmount(wei: string): string {
  return (Number(wei) / 1e18).toFixed(4);
}

export function AdminRoleBonusesPanel() {
  const [claims, setClaims] = useState<ClaimRow[] | null>(null);
  const [contractBalanceWei, setContractBalanceWei] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/role-bonuses", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setClaims(data.claims);
        setContractBalanceWei(data.contractBalanceWei);
      })
      .catch(() => setError("Failed to load role bonuses."));
  }, []);

  if (error) return <p className="text-sm text-loss">{error}</p>;
  if (!claims) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <span className="text-muted">Contract balance: </span>
        {contractBalanceWei === null ? (
          <span className="text-caution">not configured yet</span>
        ) : (
          <span className="font-mono text-ink">
            {ethAmount(contractBalanceWei)} ETH
          </span>
        )}
        <span className="ml-2 text-xs text-muted">
          (fund it from the Robinhood testnet faucet, not from this app)
        </span>
      </div>

      {claims.length === 0 ? (
        <p className="text-sm text-muted">No role bonuses declared yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Contest</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Winner</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-3 py-2 text-ink">{c.contestName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">
                    {c.role} — {c.playerName ?? "?"}
                  </td>
                  <td className="px-3 py-2 text-ink">{c.displayName}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gold">
                    {ethAmount(c.amountWei)} ETH
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${
                        c.status === "CLAIMED"
                          ? "bg-accent/15 text-accent"
                          : "bg-border text-muted"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
