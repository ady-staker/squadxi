// Used as the `from` party on every CoinVoyage invoice (see
// app/api/contests/[id]/enter/route.ts and app/api/leagues/[id]/join/route.ts).
export const BUSINESS_NAME = "SquadXI";

export const BUSINESS_EMAIL =
  process.env.SQUADXI_BUSINESS_EMAIL || "billing@squadxi.example";

// Absolute base URL for building fully-qualified links in outbound
// communications. VERCEL_URL is set automatically on every Vercel
// deployment; SITE_URL is the manual override for local dev / a custom domain.
export const SITE_URL =
  process.env.SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3005");
