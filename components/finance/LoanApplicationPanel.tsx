"use client";

import { useEffect, useState } from "react";
import { LoanRepayButton } from "@/components/finance/LoanRepayButton";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

type Terms = {
  interestRateBps: number;
  termDays: number;
  maxPrincipalWei: string;
  maxUtilizationBps: number;
  contractAddress: `0x${string}` | null;
};
type PoolState = {
  totalPoolValueWei: string;
  totalLoanedWei: string;
  availableLiquidityWei: string;
};
type Loan = {
  id: string;
  principalWei: string;
  interestRateBps: number;
  termDays: number;
  totalInterestOwedWei: string;
  status: string;
  requestedAt: string;
  dueAt: string | null;
  repaidPrincipalWei: string;
  repaidInterestWei: string;
};

function formatEth(wei: string): string {
  return (Number(wei) / 1e18).toFixed(4);
}

const WEI_PER_ETH = BigInt("1000000000000000000");

// Number(wei)/1e18 followed by toFixed loses precision on exact repayment
// terms (e.g. 0.00105 ETH displays as "0.0010", not "0.0011", because the
// float conversion happens before rounding) -- this walks the BigInt
// directly to a decimal string instead, so the figure a borrower is shown
// always matches the exact amount actually owed.
function formatEthExact(wei: bigint, decimals = 6): string {
  const whole = wei / WEI_PER_ETH;
  const remainder = wei % WEI_PER_ETH;
  const frac = remainder.toString().padStart(18, "0").slice(0, decimals);
  return `${whole.toString()}.${frac}`;
}

function statusColor(status: string): string {
  if (status === "ACTIVE") return "bg-blue-100 text-blue-800";
  if (status === "REPAID") return "bg-green-100 text-green-800";
  if (status === "DEFAULTED" || status === "REJECTED")
    return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

export function LoanApplicationPanel() {
  const [terms, setTerms] = useState<Terms | null>(null);
  const [pool, setPool] = useState<PoolState | null>(null);
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [signedIn, setSignedIn] = useState(true);

  const [amountEth, setAmountEth] = useState("0.001");
  const [walletAddress, setWalletAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMine() {
    const res = await fetch("/api/loans");
    if (res.status === 401) {
      setSignedIn(false);
      setLoans([]);
      return;
    }
    const data = await res.json();
    setLoans(data.loans ?? []);
  }

  useEffect(() => {
    fetch("/api/loans/terms")
      .then((r) => r.json())
      .then(setTerms);
    fetch("/api/pool")
      .then((r) => r.json())
      .then(setPool);
    loadMine();
  }, []);

  const amountWei = (() => {
    const n = parseFloat(amountEth);
    if (!Number.isFinite(n) || n <= 0) return null;
    return BigInt(Math.round(n * 1e18));
  })();
  const interestOwed =
    amountWei !== null && terms
      ? (amountWei * BigInt(terms.interestRateBps)) / BigInt(10000)
      : null;
  const totalRepayment =
    amountWei !== null && interestOwed !== null
      ? amountWei + interestOwed
      : null;

  async function submit() {
    if (!amountWei) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          principalWei: amountWei.toString(),
          borrowerWalletAddress: walletAddress.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to apply.");
      await loadMine();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!terms || !pool) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h2 className="font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-900">
          How this works -- in full
        </h2>
        <div className="mt-3 grid grid-cols-1 gap-4 text-sm leading-relaxed text-slate-700 sm:grid-cols-2">
          <p>
            <span className="font-semibold text-slate-900">
              Where the money comes from:
            </span>{" "}
            other users&apos; staked winnings (see Stake &amp; Earn). Your loan
            is disbursed from the shared pool, not from SquadXI itself.
          </p>
          <p>
            <span className="font-semibold text-slate-900">
              How the rate is set:
            </span>{" "}
            one flat rate, {(terms.interestRateBps / 100).toFixed(2)}%, charged
            once over the full {terms.termDays}-day term -- not compounding, not
            prorated by how early you repay.
          </p>
          <p>
            <span className="font-semibold text-slate-900">
              Where interest goes:
            </span>{" "}
            100% back to stakers, split pro-rata by their share of the pool.
            SquadXI keeps no cut.
          </p>
          <p>
            <span className="font-semibold text-slate-900">
              If you don&apos;t repay:
            </span>{" "}
            the loan can be marked defaulted by the operator; the unpaid balance
            is written off against the pool, reducing every staker&apos;s share
            value.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-6 border-t border-slate-200 pt-4 text-sm">
          <p>
            Pool available:{" "}
            <span className="font-semibold text-slate-900">
              {formatEth(pool.availableLiquidityWei)} ETH
            </span>
          </p>
          <p>
            Max per loan:{" "}
            <span className="font-semibold text-slate-900">
              {formatEth(terms.maxPrincipalWei)} ETH
            </span>
          </p>
          <p>
            Approval:{" "}
            <span className="font-semibold text-slate-900">
              manually reviewed
            </span>
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-900">
          Apply
        </h2>
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-6 sm:max-w-md">
          <label className="text-sm text-slate-600">
            Amount (ETH)
            <input
              value={amountEth}
              onChange={(e) => setAmountEth(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-900 focus:outline-none"
            />
          </label>
          <label className="text-sm text-slate-600">
            Wallet to receive funds
            <input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="0x..."
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-900 focus:outline-none"
            />
          </label>
          {totalRepayment !== null && (
            <div className="rounded bg-slate-50 p-3 text-xs text-slate-600">
              <p>
                Interest owed:{" "}
                <span className="font-semibold text-slate-900">
                  {formatEthExact(interestOwed!)} ETH
                </span>
              </p>
              <p>
                Total you&apos;d repay:{" "}
                <span className="font-semibold text-slate-900">
                  {formatEthExact(totalRepayment)} ETH
                </span>{" "}
                by {terms.termDays} days after approval
              </p>
            </div>
          )}
          <button
            onClick={submit}
            disabled={
              submitting || !amountWei || !ADDRESS_RE.test(walletAddress.trim())
            }
            className="rounded bg-blue-900 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Apply"}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!signedIn && (
            <p className="text-xs text-slate-500">
              Sign in on SquadXI to apply.
            </p>
          )}
        </div>
      </section>

      {signedIn && loans && loans.length > 0 && (
        <section>
          <h2 className="mb-4 font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-900">
            My loans
          </h2>
          <div className="flex flex-col gap-3">
            {loans.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatEth(l.principalWei)} ETH
                  </p>
                  <p className="text-xs text-slate-500">
                    {(l.interestRateBps / 100).toFixed(2)}% · {l.termDays}d
                    {l.dueAt &&
                      ` · due ${new Date(l.dueAt).toLocaleDateString()}`}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${statusColor(l.status)}`}
                >
                  {l.status}
                </span>
                {l.status === "ACTIVE" && terms.contractAddress && (
                  <LoanRepayButton
                    loanId={l.id}
                    contractAddress={terms.contractAddress}
                    amountWei={(
                      BigInt(l.principalWei) +
                      BigInt(l.totalInterestOwedWei) -
                      BigInt(l.repaidPrincipalWei) -
                      BigInt(l.repaidInterestWei)
                    ).toString()}
                    onRepaid={loadMine}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
