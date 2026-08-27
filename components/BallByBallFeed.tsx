export type FeedEvent = {
  id: string;
  sequence: number;
  over: number;
  ballInOver: number;
  runsScored: number;
  isWide: boolean;
  isNoBall: boolean;
  isWicket: boolean;
  dismissalType: string | null;
  batsmanName: string;
  bowlerName: string;
  dismissedPlayerName: string | null;
};

function badge(e: FeedEvent): { text: string; className: string } {
  if (e.isWicket) return { text: "W", className: "bg-loss text-paper" };
  if (e.isWide) return { text: "wd", className: "bg-caution/20 text-caution" };
  if (e.isNoBall)
    return { text: "nb", className: "bg-caution/20 text-caution" };
  if (e.runsScored === 6) return { text: "6", className: "bg-gold text-paper" };
  if (e.runsScored === 4)
    return { text: "4", className: "bg-accent text-paper" };
  if (e.runsScored === 0)
    return { text: "•", className: "bg-border text-muted" };
  return { text: String(e.runsScored), className: "bg-primary/80 text-paper" };
}

function commentary(e: FeedEvent): string {
  if (e.isWicket) {
    const dismissal = e.dismissalType ? e.dismissalType.toLowerCase() : "out";
    return `OUT! ${e.dismissedPlayerName ?? e.batsmanName} ${dismissal}, ${e.bowlerName} strikes.`;
  }
  if (e.isWide) return `Wide down the leg side.`;
  if (e.isNoBall) return `No ball -- free hit coming up.`;
  if (e.runsScored === 6) return `SIX! ${e.batsmanName} clears the ropes.`;
  if (e.runsScored === 4) return `FOUR! ${e.batsmanName} finds the gap.`;
  if (e.runsScored === 0)
    return `Dot ball, ${e.bowlerName} to ${e.batsmanName}.`;
  return `${e.runsScored} run${e.runsScored > 1 ? "s" : ""} taken.`;
}

export function BallByBallFeed({ events }: { events: FeedEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        Ball by ball
      </p>
      <ul className="flex flex-col gap-2.5">
        {events.map((e, i) => {
          const b = badge(e);
          return (
            <li
              key={e.id}
              className="flex items-center gap-3 animate-rise-in"
              style={i === 0 ? undefined : { animationDuration: "0.4s" }}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${b.className}`}
              >
                {b.text}
              </span>
              <span className="w-10 shrink-0 font-mono text-xs text-muted">
                {e.over}.{e.ballInOver}
              </span>
              <span className="text-sm text-ink">{commentary(e)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
