import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Get-or-create the caller's open thread. Logged-in visitors are identified
// by their session; anonymous visitors must supply the guestKey they
// generated client-side (see ChatWidget.tsx) so repeat calls land on the
// same thread instead of spawning a new one per poll.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  let guestKey: string | null = null;

  if (!user) {
    const body = await request.json().catch(() => ({}));
    guestKey =
      typeof body.guestKey === "string" && body.guestKey.length <= 100
        ? body.guestKey
        : null;
    if (!guestKey) {
      return NextResponse.json(
        { error: "guestKey is required for anonymous chat." },
        { status: 400 },
      );
    }
  }

  const existing = await prisma.chatThread.findFirst({
    where: user
      ? { userId: user.id, status: "OPEN" }
      : { guestKey, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return NextResponse.json({ threadId: existing.id });
  }

  const thread = await prisma.chatThread.create({
    data: user ? { userId: user.id } : { guestKey },
  });
  return NextResponse.json({ threadId: thread.id });
}
