import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPoolState } from "@/lib/pool";
import { ComingSoonTile } from "@/components/finance/ComingSoonTile";

export const dynamic = "force-dynamic";

function formatEth(wei: string): string {
  return (Number(wei) / 1e18).toFixed(4);
}

export default async function FinanceHomePage() {
  const [pool, settings] = await Promise.all([
    getPoolState(),
    prisma.settings.findUniqueOrThrow({ where: { id: 1 } }),
  ]);
  const utilizationPct =
    pool.totalPoolValueWei === "0"
      ? 0
      : Math.round(
          (Number(pool.totalLoanedWei) / Number(pool.totalPoolValueWei)) * 100,
        );

  return (
    <div className="flex flex-col gap-14">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Testnet ETH · SquadXI
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-finance-display)] text-4xl font-semibold tracking-tight text-slate-900">
          Put your winnings to work.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
          Stake a claimable prize into the shared pool and earn a share of loan
          interest as it&apos;s repaid, or borrow directly against the pool at
          one flat, published rate. Full mechanics below -- nothing hidden.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Pool value",
            value: `${formatEth(pool.totalPoolValueWei)} ETH`,
          },
          {
            label: "Available",
            value: `${formatEth(pool.availableLiquidityWei)} ETH`,
          },
          { label: "Utilization", value: `${utilizationPct}%` },
          {
            label: "Loan rate",
            value: `${(settings.loanInterestRateBps / 100).toFixed(2)}%`,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {s.label}
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {s.value}
            </p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Products
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/finance/loans"
            className="flex flex-col gap-2 rounded-lg border border-slate-200 p-5 transition hover:border-blue-900"
          >
            <p className="font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-900">
              Loans
            </p>
            <p className="text-sm text-slate-600">
              Borrow against the pool at{" "}
              {(settings.loanInterestRateBps / 100).toFixed(2)}% flat over{" "}
              {settings.loanTermDaysDefault} days. See exactly what you&apos;d
              repay before you apply.
            </p>
            <span className="mt-auto text-sm font-semibold text-blue-900">
              Apply / check eligibility →
            </span>
          </Link>

          <Link
            href="/finance/stake"
            className="flex flex-col gap-2 rounded-lg border border-slate-200 p-5 transition hover:border-blue-900"
          >
            <p className="font-[family-name:var(--font-finance-display)] text-lg font-semibold text-slate-900">
              Stake &amp; Earn
            </p>
            <p className="text-sm text-slate-600">
              Convert a claimable prize into pool shares. Earn pro-rata as
              borrowers repay interest -- see your projected return before you
              commit.
            </p>
            <span className="mt-auto text-sm font-semibold text-blue-900">
              View my stake →
            </span>
          </Link>

          <ComingSoonTile
            title="Savings"
            body="A fixed-rate holding account."
          />
          <ComingSoonTile
            title="Cards"
            body="Spend directly from your balance."
          />
          <ComingSoonTile
            title="Insurance"
            body="Cover for a defaulted loan."
          />
        </div>
      </section>
    </div>
  );
}
