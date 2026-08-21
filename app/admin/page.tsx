import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminOverviewPanel } from "@/components/AdminOverviewPanel";
import { AdminPayoutsPanel } from "@/components/AdminPayoutsPanel";
import { AdminRefundsPanel } from "@/components/AdminRefundsPanel";
import { AdminMatchesPanel } from "@/components/AdminMatchesPanel";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  if (!isAdminAuthenticated()) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="mb-8 text-2xl font-semibold text-ink">Admin Login</h1>
        <AdminLoginForm />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-12">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-ink">Overview</h1>
        <AdminOverviewPanel />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">Matches</h2>
        <p className="mb-4 text-sm text-muted">
          Every match here is seeded/mock data -- "Advance" reveals more of a
          pre-generated ball-by-ball log, it isn't a real broadcast feed.
        </p>
        <AdminMatchesPanel />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">Payout Queue</h2>
        <p className="mb-4 text-sm text-muted">
          CoinVoyage collects entry fees but cannot send payouts to arbitrary
          wallets, so every win below needs to be paid manually from the
          operator's own wallet, then marked paid here.
        </p>
        <AdminPayoutsPanel />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">Refund Queue</h2>
        <p className="mb-4 text-sm text-muted">
          Paid entries in contests that voided (didn't reach the minimum entries
          to run). Refunds are reviewed and triggered by hand, not automatic.
        </p>
        <AdminRefundsPanel />
      </div>
    </div>
  );
}
