import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { markLoanDefaulted } from "@/lib/pool";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await markLoanDefaulted(params.id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`Failed to mark loan ${params.id} defaulted`, err);
    const message =
      err instanceof Error
        ? err.message
        : "Failed to mark this loan defaulted.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
