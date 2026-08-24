"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "@/components/icons";

const STORAGE_KEY = "squadxi-marquee-dismissed";

const OFFERS = [
  "New here? Get a welcome credit boost on your first contest entry.",
  "Live match-winner betting is now open -- back a side, watch it settle in real time.",
  "Refer a friend and you both get a bonus when their first team enters a contest.",
  "Role bonuses for the best WK/BAT/BOWL/AR pick pay out on-chain automatically.",
];

export function MarqueeBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore -- worst case the banner reappears next load
    }
  }

  const track = [...OFFERS, ...OFFERS];

  return (
    <div className="relative flex items-center overflow-hidden border-b border-border bg-tertiary/10 py-2 pl-4 pr-10 text-xs font-medium text-ink">
      <div className="group flex overflow-hidden">
        <div className="flex shrink-0 animate-marquee gap-10 pr-10 group-hover:[animation-play-state:paused]">
          {track.map((offer, i) => (
            <span
              key={i}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap"
            >
              <span className="text-tertiary">&#9733;</span>
              {offer}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss offers banner"
        className="absolute right-3 flex h-6 w-6 items-center justify-center rounded-full text-muted transition hover:text-ink"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
