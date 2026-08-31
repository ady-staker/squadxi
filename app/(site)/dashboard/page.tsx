import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MyEntries } from "@/components/MyEntries";
import { MyLiveBets } from "@/components/MyLiveBets";

export const dynamic = "force-dynamic";

async function getDashboardStats(userId: string) {
  const [entries, bets] = await Promise.all([
    prisma.contestEntry.findMany({
      where: { userId, paymentStatus: "COMPLETED" },
      select: { prizeCents: true },
    }),
    prisma.liveBet.findMany({
      where: { userId, status: "COMPLETED" },
      select: { payoutCents: true },
    }),
  ]);
  const totalWinningsCents =
    entries.reduce((sum, e) => sum + e.prizeCents, 0) +
    bets.reduce((sum, b) => sum + b.payoutCents, 0);
  return {
    entryCount: entries.length,
    betCount: bets.length,
    totalWinningsCents,
  };
}

export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  const stats = await getDashboardStats(user.id);

  return (
    <div className="flex flex-col gap-10">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-surface to-tertiary/5 p-6">
        <h1 className="text-2xl font-semibold text-ink">My Activity</h1>
        <p className="mb-5 text-sm text-muted">
          Welcome back, {user.displayName}.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Contests &amp; leagues
            </p>
            <p className="mt-1 text-xl font-bold text-ink">
              {stats.entryCount}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Live bets
            </p>
            <p className="mt-1 text-xl font-bold text-ink">{stats.betCount}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Total winnings
            </p>
            <p className="mt-1 text-xl font-bold text-gold">
              ${(stats.totalWinningsCents / 100).toFixed(2)}
            </p>
          </div>
        </div>
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">
          Contests &amp; Leagues
        </h2>
        <MyEntries />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">My Live Bets</h2>
        <MyLiveBets />
      </div>
    </div>
  );
}
