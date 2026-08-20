# SquadXI — Cricket Fantasy League

Build an XI from a real match's player pool, join private leagues with
friends or public paid contests, and compete on a live leaderboard for a
prize pool. Entry fees are collected via CoinVoyage; winnings are tracked as
a real ledger and paid out manually by the operator (see **Money flow**
below — this is a deliberate, documented limitation, not a bug).

## Status

All 10 build phases complete and deployed. See the phase breakdown below.

- [x] **Phase 1** — repo scaffold
- [x] **Phase 2** — data model + seeded mock matches
- [x] **Phase 3** — player auth (email + password)
- [x] **Phase 4** — scoring engine + team builder
- [x] **Phase 5** — leagues, contests, entry-fee payment
- [x] **Phase 6** — live match simulation + leaderboard
- [x] **Phase 7** — contest finalization + payouts
- [x] **Phase 8** — admin dashboard (overview, refunds, payout queue)
- [x] **Phase 9** — frontend polish
- [x] **Phase 10** — deploy

Live at https://squadxi-site.vercel.app.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind + Prisma + Neon Postgres,
using `@coin-voyage/paykit`'s server `ApiClient` for payments (Invoice flow —
no embedded wallet widget, same pattern as this workspace's dental-site).

## Cricket data

**Teams and players are real; matches and live scoring are simulated.**
Stated precisely, since it's easy to blur this:

- The 6 national squads (India, Australia, England, Pakistan, South Africa,
  New Zealand) and their ~15-player rosters are real, sourced from
  [Cricsheet](https://cricsheet.org)'s open ball-by-ball T20 international
  archive (licensed [ODC-BY 1.0](http://opendatacommons.org/licenses/by/1.0/) —
  attributed in the site footer). `battingSkill`/`bowlingSkill` (and the
  credit values derived from them) are computed from each player's real
  aggregate stats across ~450 real men's T20I matches between these teams,
  min-max normalized across the full player pool so real relative ability
  differences translate into a meaningfully different credit range (an
  earlier per-player-clamped version compressed every real international
  into a 9.3-10.4 credit band, making the 100-credit budget mathematically
  impossible to build a team under -- verified and fixed before this
  shipped, see `prisma/seed.ts`'s comments).
- **Which two teams play, when, and every ball once a match goes live is
  simulated** by `lib/match-simulator.ts`, not a replay of any real match
  Cricsheet recorded. There is no live/real-time cricket data source: every
  free option was researched and ruled out (see below) as either far too
  rate-limited for live polling, in violation of the source site's own
  terms of service, or (Cricsheet itself) a lagged historical archive, not
  live data. "Live" matches reveal this pre-generated log progressively via
  an admin-clicked Advance control in `/admin`, same mechanism as before.
- The one-time extraction script that turns Cricsheet's raw archive into
  `prisma/data/real-roster.json` (a small derived dataset, not raw
  Cricsheet data) isn't part of this repo -- it was a scratch script run
  once against a downloaded Cricsheet zip. Re-deriving it means: download
  `https://cricsheet.org/downloads/t20s_json.zip`, filter for men's
  matches among the 6 chosen teams, aggregate real batting/bowling figures
  per player, infer WK/BAT/BOWL/AR role from real involvement rates (with a
  known-keeper name list as the primary signal, since a real keeper may not
  personally rack up stumping credits in a small sample), and min-max
  normalize skill ratings across the full pool.

## Money flow

This app runs against **live CoinVoyage credentials** (`COIN_VOYAGE_ENV=production`).
**Real crypto moves** when an entry fee is paid or a refund is issued. The
plan originally called for sandbox-only testing; this app briefly ran on
the shared-org keys used by the other apps in this workspace (2026-08-20)
before switching to its own dedicated CoinVoyage org's key pair
(2026-08-21) — confirmed working via a live `getFeeBalances` authentication
check before this switch was deployed. Test accordingly.

CoinVoyage has no merchant-to-third-party disbursement API: it can collect
payments (Sale/Invoice/Deposit) and refund a specific prior payment, but it
cannot send crypto from the operator's balance to an arbitrary winner's
wallet on demand. So:

- **Entry fees** are collected via a real CoinVoyage Invoice per contest
  entry.
- **Winnings** are a plain ledger row (`Payout`) — amount owed, wallet,
  chain, token — worked from a real admin queue in `/admin`. The operator
  sends crypto from their own wallet and marks the row paid with a tx note.
  Nothing here claims to be an automated payout.
- **Refunds** (both the general admin "refund a transaction" action and a
  voided under-filled contest) go through CoinVoyage's real refund API, but
  are always **admin-reviewed**, never automatic. Exercised for real during
  development: the first attempt failed (`"currency.chain_id is required"`
  — CoinVoyage does not infer the settlement currency, contrary to an
  earlier untested assumption elsewhere in this workspace), fixed by
  looking the order up first and reading its real settlement currency.

## Local setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL, ADMIN_PASSWORD, ADMIN_SESSION_SECRET, SESSION_SECRET
npx prisma migrate dev
npm run db:seed
npm run dev             # http://localhost:3005
```

## Admin

`/admin` — protected by `ADMIN_PASSWORD` (see `.env.example`). Shows a
platform overview (users, matches/contests by status, entry-fee volume,
pending payout value, recent signups), the per-match live-advance control,
the manual payout queue (mark-paid, blocked until a winner has a wallet on
file), and the voided-contest refund queue (a real, admin-triggered
CoinVoyage refund call per entry). No CoinVoyage credential-settings UI yet
-- credentials are set via `.env` only.

## Deployment

Live at https://squadxi-site.vercel.app — Vercel project `squadxi-site`
under `adhiraj-joarders-projects`, deployed via the Vercel CLI (not a
GitHub-integration auto-deploy; the Vercel account isn't connected to the
`ady-staker` GitHub account, so a redeploy needs `vercel --prod` run
locally rather than happening automatically on push). Database: Neon
project `squadxi` (`flat-mouse-14285936`, org `org-royal-pine-62975133`,
same org as the other apps in this workspace) — the same database used for
local development, not a separate prod instance.

**Still outstanding**: register this app's own CoinVoyage webhook endpoint
(`/api/webhooks/coinvoyage`) to get its own `COIN_VOYAGE_WEBHOOK_SECRET` —
left blank for now, same as this workspace's other apps at a comparable
stage. This isn't a blocker for correctness in the meantime: the
"Complete payment" flow polls its own `GET /api/contest-entries/[id]/status`
every few seconds (same refresh-then-apply shape as dental-site's
order-status poll route), so a paid entry still confirms without the
webhook -- registering it later just makes that confirmation instant
instead of polled.
