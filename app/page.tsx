export default function HomePage() {
  return (
    <div className="flex flex-col items-start gap-3">
      <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
        Scaffold — Phase 1 of 10
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-ink">SquadXI</h1>
      <p className="max-w-xl text-sm text-muted">
        Cricket Fantasy League platform, in progress. See{" "}
        <code className="rounded bg-surface px-1.5 py-0.5 text-xs text-ink">
          README.md
        </code>{" "}
        for build status.
      </p>
    </div>
  );
}
