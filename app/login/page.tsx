import { LoginForm } from "@/components/LoginForm";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ?? "/dashboard";
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold text-ink">Sign in</h1>
      <p className="mb-8 text-sm text-muted">
        New to SquadXI?{" "}
        <a href={`/signup?next=${encodeURIComponent(next)}`} className="text-accent underline">
          Create an account
        </a>
        .
      </p>
      <LoginForm next={next} />
    </div>
  );
}
