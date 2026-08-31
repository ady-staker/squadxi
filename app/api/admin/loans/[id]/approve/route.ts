import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { originateLoan } from "@/lib/pool";

// Approving disburses immediately (lib/pool.ts's originateLoan) -- there's
// no separate "approved but not yet paid" state, matching this app's own
// "reviewed, not automated" philosophy: a human decision, but a decisive
// one once made.
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await originateLoan(params.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error(`Failed to approve/disburse loan ${params.id}`, err);
    const message =
      err instanceof Error ? err.message : "Failed to approve this loan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
