import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { advanceMatch } from "@/lib/live-advance";

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let byN: number | undefined;
  let forcedWinnerTeamId: string | undefined;
  try {
    const body = await request.json();
    if (
      typeof body?.byN === "number" &&
      Number.isInteger(body.byN) &&
      body.byN > 0
    ) {
      byN = body.byN;
    }
    // Only matters on the very first advance for this match, before any
    // MatchEvent rows exist -- see ensureEventsGenerated in lib/live-advance.ts.
    if (
      typeof body?.forcedWinnerTeamId === "string" &&
      body.forcedWinnerTeamId
    ) {
      forcedWinnerTeamId = body.forcedWinnerTeamId;
    }
  } catch {
    // No body / not JSON -- fine, advanceMatch's defaults apply.
  }

  try {
    const result = await advanceMatch(params.id, byN, forcedWinnerTeamId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error(`Failed to advance match ${params.id}`, err);
    const message =
      err instanceof Error && err.message.includes("must be one of")
        ? err.message
        : "Failed to advance match.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
