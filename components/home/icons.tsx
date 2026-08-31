// Small hand-drawn icon set for the homepage -- no icon library dependency
// for six glyphs, consistent 1.75px stroke on a 24x24 grid.
type IconProps = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export function BatIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6.5 17.5 15 9a2.5 2.5 0 0 0-3.5-3.5L3 14l3.5 3.5Z" />
      <path d="m15 9 4.5-4.5" />
      <path d="M18 3.5 20.5 6" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 8.25a3 3 0 1 1 3.25 3" />
      <path d="M19.5 13.5c2.2.4 3.5 2 3.5 4.5" />
    </svg>
  );
}

export function PulseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 12h3.5l2-6 3 12 2-9 1.5 3H21" />
    </svg>
  );
}

export function WalletIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="6.5" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <circle cx="16.5" cy="14.5" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 5 6v6c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5V6l-7-2.5Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  );
}

export function BoltIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M12.5 3 5 13.5h5.5L11 21l7.5-10.5H13L12.5 3Z" />
    </svg>
  );
}

export function GrowthCoinsIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <ellipse cx="7" cy="17.5" rx="4" ry="2" />
      <path d="M3 17.5v-3c0-1.1 1.8-2 4-2s4 .9 4 2v3" />
      <path d="M4.5 12.2c.4-.9 1.4-1.5 2.5-1.5s2.1.6 2.5 1.5" />
      <path d="M13 15.5 16 10l2.5 4 2.5-6" />
    </svg>
  );
}

export function HandshakeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2.5 12.5 6 9l4 3.5-1.5 1.5a1.6 1.6 0 0 1-2.3 0" />
      <path d="M21.5 12.5 18 9l-4 3.5 1.5 1.5a1.6 1.6 0 0 0 2.3 0" />
      <path d="m8.5 11 3.5 3 3.5-3" />
      <path d="M6 9 8.5 6.5M18 9 15.5 6.5" />
    </svg>
  );
}
