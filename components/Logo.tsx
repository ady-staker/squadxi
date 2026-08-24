// Crest mark for the SquadXI brand -- a circular badge (echoing the ring
// treatment already used for team crests in components/home/TeamCrest.tsx)
// with a stitched-seam motif and an "XI" monogram, built from gradient +
// currentColor so it reads correctly against either theme.
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="SquadXI"
    >
      <defs>
        <linearGradient id="squadxi-mark" x1="4" y1="4" x2="36" y2="36">
          <stop offset="0%" stopColor="rgb(var(--color-primary))" />
          <stop offset="100%" stopColor="rgb(var(--color-tertiary))" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill="url(#squadxi-mark)" />
      <path
        d="M6 20a14 14 0 0 1 28 0"
        fill="none"
        stroke="white"
        strokeOpacity="0.35"
        strokeWidth="1.4"
        strokeDasharray="1.5 3"
        strokeLinecap="round"
      />
      <path
        d="M6 20a14 14 0 0 0 28 0"
        fill="none"
        stroke="white"
        strokeOpacity="0.35"
        strokeWidth="1.4"
        strokeDasharray="1.5 3"
        strokeLinecap="round"
      />
      <text
        x="20"
        y="26"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="white"
        style={{ fontFamily: "var(--font-display), sans-serif" }}
      >
        XI
      </text>
    </svg>
  );
}

export function Logo({
  className,
  markClassName = "h-8 w-8",
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark className={markClassName} />
      <span className="text-lg font-bold tracking-tight text-ink">
        Squad<span className="text-primary">XI</span>
      </span>
    </span>
  );
}
