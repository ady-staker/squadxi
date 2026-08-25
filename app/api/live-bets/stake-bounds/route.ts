import { NextResponse } from "next/server";
import { resolvePlatformSettings } from "@/lib/platform-settings";

// Public, read-only -- lets LiveBetPanel show/enforce the admin's current
// stake bounds instead of the hardcoded lib/live-bet-constants.ts fallback,
// which the server itself only uses when no Settings row overrides it.
export async function GET() {
  const { minLiveBetStakeCents, maxLiveBetStakeCents } =
    await resolvePlatformSettings();
  return NextResponse.json({ minLiveBetStakeCents, maxLiveBetStakeCents });
}
