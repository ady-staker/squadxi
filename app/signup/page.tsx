import { SignupForm } from "@/components/SignupForm";

export default function SignupPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ?? "/dashboard";
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-semibold text-ink">
        Create your account
      </h1>
      <p className="mb-8 text-sm text-muted">
        Already have one?{" "}
        <a
          href={`/login?next=${encodeURIComponent(next)}`}
          className="text-accent underline"
        >
          Sign in
        </a>
        .
      </p>
      <SignupForm next={next} />
    </div>
  );
}
