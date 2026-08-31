import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

// No pool/chain interaction -- a PENDING loan never touched the pool at
// all (see lib/pool.ts's originateLoan), so rejecting is a plain status
// flip, CAS-guarded against a double-review race.
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await prisma.loan.updateMany({
    where: { id: params.id, status: "PENDING" },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });
  if (updated.count === 0) {
    return NextResponse.json(
      { error: "This loan is no longer pending." },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true });
}
