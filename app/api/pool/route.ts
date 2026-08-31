import { NextResponse } from "next/server";
import { getPoolState } from "@/lib/pool";

// Without this, Next.js statically optimizes a GET with no dynamic function
// calls and caches the response at build time (same fix as
// app/api/matches/route.ts) -- pool stats change in real time and must
// never be served from a build-time snapshot.
export const dynamic = "force-dynamic";

// Public -- pool stats are part of the transparency story (SQXI Finance),
// not sensitive. No auth required. Loan-rate/utilization fields land here
// once the borrowing side ships (this is staking-only for now).
export async function GET() {
  const state = await getPoolState();
  return NextResponse.json(state);
}
