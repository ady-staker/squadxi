type InningsSummary = {
  innings: number;
  runs: number;
  wickets: number;
  legalBalls: number;
};

const STAGES = [
  "Upcoming",
  "1st Innings",
  "Innings Break",
  "2nd Innings",
  "Result",
];

// T20 innings end at 20 overs (120 legal balls) or 10 wickets -- mirrors
// lib/match-simulator.ts's OVERS_PER_INNINGS, the only format this app
// simulates.
const LEGAL_BALLS_PER_INNINGS = 120;

function currentStageIndex(status: string, innings: InningsSummary[]): number {
  if (status === "UPCOMING") return 0;
  if (status === "COMPLETED") return 4;

  const first = innings.find((i) => i.innings === 1);
  const second = innings.find((i) => i.innings === 2);
  if (second) return 3;
  if (
    first &&
    (first.wickets >= 10 || first.legalBalls >= LEGAL_BALLS_PER_INNINGS)
  ) {
    return 2;
  }
  return 1;
}

export function MatchStageTracker({
  status,
  innings,
}: {
  status: string;
  innings: InningsSummary[];
}) {
  const activeIndex = currentStageIndex(status, innings);

  return (
    <div className="flex items-center gap-1.5">
      {STAGES.map((label, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`h-1.5 w-full rounded-full transition-colors ${
                  done || active ? "bg-accent" : "bg-border"
                }`}
              />
              <p
                className={`text-center text-[10px] font-semibold uppercase tracking-wide ${
                  active ? "text-accent" : done ? "text-ink" : "text-muted"
                }`}
              >
                {label}
                {active && status !== "COMPLETED" && (
                  <span className="ml-1 inline-block animate-pulse-dot text-accent">
                    ●
                  </span>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
