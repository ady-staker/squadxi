import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { LiveMatchStrip } from "@/components/home/LiveMatchStrip";
import { FaqAccordion } from "@/components/home/FaqAccordion";
import { TeamCrest } from "@/components/home/TeamCrest";
import { RevealOnScroll } from "@/components/RevealOnScroll";
import { DownloadIcon } from "@/components/icons";
import {
  BatIcon,
  UsersIcon,
  PulseIcon,
  WalletIcon,
  ShieldIcon,
  BoltIcon,
} from "@/components/home/icons";

// Tailwind's compiler needs literal class strings, not template-built ones
// -- so the feature grid's rotating brand color is a lookup, not a join.
const FEATURE_ACCENTS = [
  {
    bg: "bg-primary/10",
    text: "text-primary",
    hoverBg: "group-hover:bg-primary/20",
  },
  {
    bg: "bg-secondary/10",
    text: "text-secondary",
    hoverBg: "group-hover:bg-secondary/20",
  },
  {
    bg: "bg-tertiary/10",
    text: "text-tertiary",
    hoverBg: "group-hover:bg-tertiary/20",
  },
] as const;

async function getHomeStats() {
  const [playerCount, teamCount, liveCount, upcomingCount, openContests] =
    await Promise.all([
      prisma.player.count(),
      prisma.team.count(),
      prisma.match.count({ where: { status: "LIVE" } }),
      prisma.match.count({ where: { status: "UPCOMING" } }),
      prisma.contest.findMany({ where: { status: "OPEN" } }),
    ]);
  const prizePoolCents = openContests.reduce(
    (sum, c) => sum + c.prizePoolCents,
    0,
  );
  return { playerCount, teamCount, liveCount, upcomingCount, prizePoolCents };
}

const FEATURES = [
  {
    icon: BatIcon,
    title: "Draft your XI",
    body: "100 credits, 11 players, WK/BAT/BOWL/AR limits enforced server-side. Captain scores 2x, vice-captain 1.5x.",
  },
  {
    icon: UsersIcon,
    title: "Private leagues or public contests",
    body: "Start a free league with friends via invite code, or enter a public contest with a real prize pool split 50/30/20.",
  },
  {
    icon: PulseIcon,
    title: "Live, ball by ball",
    body: "Watch scores and your leaderboard rank update as the match unfolds, no refresh needed.",
  },
  {
    icon: WalletIcon,
    title: "Pay your way",
    body: "Every paid contest offers a real choice at entry: CoinVoyage crypto, or Robinhood Chain testnet ETH with no real money at stake.",
  },
  {
    icon: BoltIcon,
    title: "Role bonuses, on-chain",
    body: "Contests can carve out a bonus pool for the best WK/BAT/BOWL/AR pick, paid out automatically by a smart contract on Robinhood Chain.",
  },
  {
    icon: ShieldIcon,
    title: "Reviewed, not reckless",
    body: "Winnings are reviewed by the operator before payout. Under-filled contests are voided and refunds are admin-reviewed, never automatic.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Build your XI",
    body: "Pick 11 real internationals within your credit budget for an upcoming match.",
  },
  {
    n: "02",
    title: "Enter a contest",
    body: "Join a friend's private league for free, or a public contest — pay with crypto or testnet ETH.",
  },
  {
    n: "03",
    title: "Track it live",
    body: "Scores update as the match plays out. Your leaderboard rank moves with every ball.",
  },
  {
    n: "04",
    title: "Get paid",
    body: "Top finishers split the prize pool. Role-bonus winners claim straight from the smart contract.",
  },
];

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function HomePage() {
  const [stats, user] = await Promise.all([getHomeStats(), getCurrentUser()]);

  return (
    <div className="flex flex-col gap-24">
      {/* Hero */}
      <section className="relative overflow-hidden pb-4 pt-10">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 animate-floodlight-drift"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 15%, rgba(74,222,128,0.16), transparent 60%), radial-gradient(45% 40% at 85% 10%, rgba(245,185,63,0.10), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(#F3F6F4 1px, transparent 1px), linear-gradient(90deg, #F3F6F4 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />

        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 py-10">
          <span className="animate-rise-in rounded-full border border-tertiary/30 bg-tertiary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-tertiary">
            Cricket Fantasy League
          </span>
          <h1 className="animate-rise-in max-w-2xl font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight text-ink sm:text-7xl">
            Build your XI.
            <br />
            <span className="text-primary">Win with your squad.</span>
          </h1>
          <p
            className="animate-rise-in max-w-lg text-base text-muted sm:text-lg"
            style={{ animationDelay: "80ms" }}
          >
            Pick your 11 within a 100-credit budget, join a league with friends
            or a public contest, and climb the leaderboard as the match plays
            out live. Pay with crypto or risk-free testnet ETH — your choice,
            every time.
          </p>
          <div
            className="animate-rise-in flex flex-wrap gap-3"
            style={{ animationDelay: "140ms" }}
          >
            <Link
              href="/matches"
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
            >
              Browse matches
            </Link>
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-ink transition hover:border-primary"
              >
                My Leagues
              </Link>
            ) : (
              <Link
                href="/signup"
                className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-ink transition hover:border-primary"
              >
                Create account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Live match strip */}
      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">
            On the board right now
          </h2>
          <Link href="/matches" className="text-sm text-accent hover:underline">
            All matches →
          </Link>
        </div>
        <LiveMatchStrip />
      </section>

      {/* Stat band */}
      <section className="grid grid-cols-2 gap-4 border-y border-border py-8 sm:grid-cols-4">
        {[
          { label: "Real internationals", value: `${stats.playerCount}` },
          { label: "National sides", value: `${stats.teamCount}` },
          {
            label: "Live or upcoming",
            value: `${stats.liveCount + stats.upcomingCount}`,
          },
          {
            label: "Open prize pool",
            value: formatUsd(stats.prizePoolCents),
          },
        ].map((s) => (
          <div key={s.label} className="flex flex-col items-center text-center">
            <span className="font-display text-3xl font-bold text-accent sm:text-4xl">
              {s.value}
            </span>
            <span className="mt-1 text-xs uppercase tracking-wide text-muted">
              {s.label}
            </span>
          </div>
        ))}
      </section>

      {/* How it works */}
      <RevealOnScroll className="flex flex-col gap-8">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          How it works
        </h2>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-border sm:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.n} className="bg-paper p-6">
              <span className="font-display text-3xl font-bold text-border">
                {step.n}
              </span>
              <h3 className="mt-3 font-semibold text-ink">{step.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{step.body}</p>
            </div>
          ))}
        </div>
      </RevealOnScroll>

      {/* Features grid */}
      <RevealOnScroll className="flex flex-col gap-8">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          Everything you need to run a league
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => {
            const accent = FEATURE_ACCENTS[i % FEATURE_ACCENTS.length];
            return (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface/80"
              >
                <div
                  className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition ${accent.bg} ${accent.text} ${accent.hoverBg}`}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1.5 font-semibold text-ink">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            );
          })}
        </div>
      </RevealOnScroll>

      {/* Payment methods */}
      <RevealOnScroll className="rounded-2xl border border-border bg-surface p-8">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          Pay however you want
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every paid contest gives you both options, side by side, at the moment
          you enter — not locked to one or the other.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-paper p-5">
            <p className="font-display text-sm font-semibold uppercase tracking-wide text-gold">
              CoinVoyage
            </p>
            <p className="mt-2 text-sm text-muted">
              Real crypto, real prize pool. Winnings are reviewed and paid out
              by the operator.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-paper p-5">
            <p className="font-display text-sm font-semibold uppercase tracking-wide text-secondary">
              Robinhood Chain testnet
            </p>
            <p className="mt-2 text-sm text-muted">
              No real money — pay entry fees and claim role bonuses on a public
              testnet, straight from your wallet.
            </p>
          </div>
        </div>
      </RevealOnScroll>

      {/* App download promo */}
      <RevealOnScroll className="flex flex-col items-center gap-4 rounded-2xl border border-tertiary/30 bg-tertiary/5 p-10 text-center">
        <DownloadIcon className="h-8 w-8 text-tertiary" />
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight text-ink">
          Take SquadXI with you
        </h2>
        <p className="max-w-md text-sm text-muted">
          The mobile app is on the way. Get notified the moment it&apos;s ready.
        </p>
        <Link
          href="/download"
          className="rounded-full bg-tertiary px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Get the app
        </Link>
      </RevealOnScroll>

      {/* Rosters */}
      <RevealOnScroll className="flex flex-col gap-6">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          Six sides. Real rosters.
        </h2>
        <RosterStrip />
      </RevealOnScroll>

      {/* FAQ */}
      <RevealOnScroll className="flex flex-col gap-6">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
          Frequently asked
        </h2>
        <FaqAccordion />
      </RevealOnScroll>

      {/* Final CTA */}
      <RevealOnScroll className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-tertiary/10 p-10 text-center">
        <h2 className="font-display text-3xl font-bold uppercase tracking-tight text-ink">
          Your XI is waiting.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Pick a match, draft your squad, and see where you land on the
          leaderboard.
        </p>
        <Link
          href="/matches"
          className="mt-6 inline-block rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white transition hover:bg-primary-dark"
        >
          Browse matches
        </Link>
      </RevealOnScroll>
    </div>
  );
}

async function RosterStrip() {
  const teams = await prisma.team.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="flex flex-wrap gap-3">
      {teams.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 rounded-full border border-border bg-surface py-2 pl-2 pr-5"
        >
          <TeamCrest shortName={t.shortName} logo={t.logo} size="sm" />
          <span className="text-sm font-medium text-ink">{t.name}</span>
        </div>
      ))}
    </div>
  );
}
