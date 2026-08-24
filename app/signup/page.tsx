import { SignupForm } from "@/components/SignupForm";
import { LogoMark } from "@/components/Logo";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ?? "/dashboard";
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 overflow-hidden rounded-2xl border border-border sm:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-gradient-to-br from-tertiary/20 via-surface to-primary/10 p-8 sm:flex">
        <LogoMark className="h-10 w-10" />
        <div>
          <p className="font-display text-2xl font-bold uppercase leading-tight text-ink">
            Your first XI is
            <br />
            three picks away.
          </p>
          <p className="mt-3 text-sm text-muted">
            100 credits, 11 players, one leaderboard to climb. Pay with crypto
            or risk-free testnet ETH.
          </p>
        </div>
      </div>

      <div className="p-8">
        <h1 className="mb-2 text-2xl font-semibold text-ink">
          Create your account
        </h1>
        <p className="mb-8 text-sm text-muted">
          Already have one?{" "}
          <a
            href={`/login?next=${encodeURIComponent(next)}`}
            className="text-primary underline"
          >
            Sign in
          </a>
          .
        </p>
        <SignupForm next={next} />
      </div>
    </div>
  );
}
