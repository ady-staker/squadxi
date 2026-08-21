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
  try {
    const body = await request.json();
    if (
      typeof body?.byN === "number" &&
      Number.isInteger(body.byN) &&
      body.byN > 0
    ) {
      byN = body.byN;
    }
  } catch {
    // No body / not JSON -- fine, advanceMatch's default applies.
  }

  try {
    const result = await advanceMatch(params.id, byN);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error(`Failed to advance match ${params.id}`, err);
    return NextResponse.json(
      { error: "Failed to advance match." },
      { status: 500 },
    );
  }
}
