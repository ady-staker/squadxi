// Real kit-inspired colors per national side -- there's no real crest
// artwork in this dataset (Team.logo is a single seeded emoji), so the
// "logo" treatment is a colored badge instead of a photo.
const CREST_COLORS: Record<string, string> = {
  IND: "#1E5FBF",
  AUS: "#C99A2E",
  ENG: "#2C3E70",
  PAK: "#0E7C66",
  RSA: "#045C3C",
  NZ: "#1A1A1A",
};

export function TeamCrest({
  shortName,
  logo,
  size = "md",
}: {
  shortName: string;
  logo: string;
  size?: "sm" | "md" | "lg";
}) {
  const dims = {
    sm: "h-8 w-8 text-base",
    md: "h-11 w-11 text-xl",
    lg: "h-16 w-16 text-3xl",
  }[size];
  const color = CREST_COLORS[shortName] ?? "#243044";

  return (
    <span
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full ring-1 ring-white/10`}
      style={{
        background: `radial-gradient(circle at 32% 28%, ${color}dd, ${color}55 70%)`,
      }}
      title={shortName}
    >
      {logo}
    </span>
  );
}
