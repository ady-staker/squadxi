import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col items-start gap-5 py-8">
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
          Cricket Fantasy League
        </span>
        <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
          Build your XI.
          <br />
          <span className="text-accent">Win with your squad.</span>
        </h1>
        <p className="max-w-lg text-base text-muted">
          Pick your 11 within a 100-credit budget, join a league with friends or
          a public contest, and climb the leaderboard as the match plays out
          live. Prize pools settle in crypto via CoinVoyage.
        </p>
        <div className="flex gap-3">
          <Link
            href="/matches"
            className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-paper transition hover:bg-accent-dark"
          >
            Browse matches
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-ink transition hover:border-accent"
          >
            Create account
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="mb-2 text-2xl">🏏</p>
          <h2 className="mb-1 font-semibold text-ink">Draft your XI</h2>
          <p className="text-sm text-muted">
            100 credits, 11 players, role limits enforced — pick a captain for
            2x points and a vice-captain for 1.5x.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="mb-2 text-2xl">👥</p>
          <h2 className="mb-1 font-semibold text-ink">Play your way</h2>
          <p className="text-sm text-muted">
            Start a free private league with an invite code, or enter a public
            contest for a real prize pool.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="mb-2 text-2xl">💰</p>
          <h2 className="mb-1 font-semibold text-ink">Track live, get paid</h2>
          <p className="text-sm text-muted">
            Watch the leaderboard update as the match unfolds. Winnings settle
            in crypto once the operator reviews and pays out.
          </p>
        </div>
      </section>
    </div>
  );
}
