import { LoginForm } from "@/components/LoginForm";
import { LogoMark } from "@/components/Logo";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ?? "/dashboard";
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-border sm:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-gradient-to-br from-primary/20 via-surface to-tertiary/10 p-8 sm:flex">
        <LogoMark className="h-10 w-10" />
        <div>
          <p className="font-display text-2xl font-bold uppercase leading-tight text-ink">
            Build your XI.
            <br />
            Win with your squad.
          </p>
          <p className="mt-3 text-sm text-muted">
            Track live matches, chase the leaderboard, and get paid — all in one
            place.
          </p>
        </div>
      </div>

      <div className="p-8">
        <h1 className="mb-2 text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mb-8 text-sm text-muted">
          New to SquadXI?{" "}
          <a
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="text-primary underline"
          >
            Create an account
          </a>
          .
        </p>
        <LoginForm next={next} />
      </div>
    </div>
  );
}
