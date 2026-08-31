import { LogoMark } from "@/components/Logo";

export function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2">
          <LogoMark className="h-5 w-5" />
          SquadXI — Cricket Fantasy League
        </p>
        <p>
          Entry fees and payouts settle in crypto via CoinVoyage. Winnings are
          reviewed and paid out by the operator, not automated.
        </p>
      </div>
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <a
          href="/finance/loans"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-accent hover:underline"
        >
          Apply for a loan / check eligibility — SQXI Finance →
        </a>
      </div>
      <div className="mx-auto max-w-5xl px-4 pt-4 text-[11px] text-muted/70">
        Player and team data derived from{" "}
        <a
          href="https://cricsheet.org"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-muted"
        >
          Cricsheet
        </a>
        , used under the Open Data Commons Attribution License (ODC-BY 1.0).
        Matches, scheduling, and live scoring on this site are simulated, not
        real fixtures or real-time data.
      </div>
    </footer>
  );
}
