import { MatchList } from "@/components/MatchList";

export default function MatchesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Matches</h1>
        <p className="text-sm text-muted">
          Build a team for an upcoming match, or check a live one.
        </p>
      </div>
      <MatchList />
    </div>
  );
}
