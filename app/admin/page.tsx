import { isAdminAuthenticated } from "@/lib/admin-auth";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import { AdminOverviewPanel } from "@/components/AdminOverviewPanel";
import { AdminPayoutsPanel } from "@/components/AdminPayoutsPanel";
import { AdminRefundsPanel } from "@/components/AdminRefundsPanel";
import { AdminMatchesPanel } from "@/components/AdminMatchesPanel";
import { AdminRoleBonusesPanel } from "@/components/AdminRoleBonusesPanel";
import { AdminLiveBetsPanel } from "@/components/AdminLiveBetsPanel";
import { AdminChatPanel } from "@/components/AdminChatPanel";
import { AdminRobinhoodRatePanel } from "@/components/AdminRobinhoodRatePanel";

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

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">
          Robinhood Chain Testnet Rate
        </h2>
        <p className="mb-4 text-sm text-muted">
          How many dollars of entry fees / live-bet stakes one testnet ETH
          covers -- affects contest entries, live bets, and role-bonus payouts
          sitewide. Set this low enough that a single faucet claim (0.01 ETH on
          the Robinhood Chain testnet faucet) can actually cover a real entry.
        </p>
        <AdminRobinhoodRatePanel />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">
          Robinhood Chain Role Bonuses
        </h2>
        <p className="mb-4 text-sm text-muted">
          Separate from CoinVoyage entirely -- a contest's role bonuses (best
          WK/BAT/BOWL/AR) are declared automatically at finalization and claimed
          by the winner via a smart contract on Robinhood Chain testnet, not
          paid from this queue.
        </p>
        <AdminRoleBonusesPanel />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">Live Match Bets</h2>
        <p className="mb-4 text-sm text-muted">
          Outcome bets on LIVE matches, separate from fantasy contests. Settled
          automatically when a match's Advance control reaches COMPLETED --
          CoinVoyage winners land in the Payout Queue above, testnet-ETH winners
          claim on-chain from their own account.
        </p>
        <AdminLiveBetsPanel />
      </div>

      <div>
        <h2 className="mb-4 text-xl font-semibold text-ink">Live Chat</h2>
        <p className="mb-4 text-sm text-muted">
          Customer support conversations from the site's chat widget. Polls for
          new messages every few seconds -- no websocket infra, same pattern as
          the live match views above.
        </p>
        <AdminChatPanel />
      </div>
    </div>
  );
}
