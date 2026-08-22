"use client";

import { useState } from "react";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How does scoring work?",
    a: "Standard T20 fantasy scoring: points for runs, boundaries, and strike rate; wickets, maidens, and economy for bowlers; catches, stumpings, and run-outs for fielding. Your captain scores 2x, vice-captain 1.5x.",
  },
  {
    q: "How do I pay an entry fee?",
    a: "Every paid contest lets you choose how to pay: CoinVoyage (real crypto) or Robinhood Chain testnet ETH. Free private leagues need no payment at all.",
  },
  {
    q: "What's the Robinhood Chain testnet option?",
    a: "A separate, no-real-money way to pay entry fees and to receive role-based bonus payouts, settled on Robinhood Chain's public testnet. It's real on-chain activity, just with test funds that carry no monetary value — useful for trying the whole flow risk-free.",
  },
  {
    q: "How are winnings paid out?",
    a: "CoinVoyage-paid contests are reviewed and paid out by the operator, not automated. Robinhood Chain role bonuses are claimed directly from a smart contract once you connect a wallet.",
  },
  {
    q: "Is the match data real?",
    a: "Team rosters and player skill ratings are derived from real international T20 statistics. Match scheduling and ball-by-ball live play are simulated, not a live broadcast feed — see the footer for the full breakdown.",
  },
  {
    q: "What happens if a contest doesn't fill up?",
    a: "Contests below the minimum entry count are voided when the match locks. Paid entries are queued for an admin-reviewed refund rather than an automatic one.",
  },
];

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="flex flex-col gap-2">
      {FAQS.map((item, i) => {
        const open = openIndex === i;
        return (
          <div
            key={item.q}
            className="overflow-hidden rounded-2xl border border-border bg-surface"
          >
            <button
              onClick={() => setOpenIndex(open ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={open}
            >
              <span className="font-medium text-ink">{item.q}</span>
              <span
                className={`shrink-0 text-lg text-accent transition-transform duration-200 ${
                  open ? "rotate-45" : ""
                }`}
                aria-hidden
              >
                +
              </span>
            </button>
            <div
              className={`grid transition-all duration-200 ease-out ${
                open
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-4 text-sm leading-relaxed text-muted">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
