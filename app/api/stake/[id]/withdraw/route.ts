import { NextResponse } from "next/server";
import type { Address } from "viem";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { withdrawFromPool } from "@/lib/pool";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  let toAddress: unknown;
  try {
    const body = await request.json();
    toAddress = body?.toAddress;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof toAddress !== "string" || !ADDRESS_RE.test(toAddress)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  const position = await prisma.stakePosition.findUnique({
    where: { id: params.id },
  });
  if (!position || position.userId !== user.id) {
    return NextResponse.json(
      { error: "Stake position not found." },
      { status: 404 },
    );
  }

  try {
    const result = await withdrawFromPool({
      stakePositionId: position.id,
      userId: user.id,
      toAddress: toAddress as Address,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error(`Failed to withdraw stake position ${position.id}`, err);
    const message =
      err instanceof Error ? err.message : "Failed to withdraw your stake.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
