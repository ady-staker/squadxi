import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  centsToTestnetWei,
  resolveRobinhoodConfig,
  verifyTestnetTransfer,
} from "@/lib/robinhood-chain";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

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

  let txHash: unknown;
  try {
    const body = await request.json();
    txHash = body?.txHash;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json(
      { error: "A valid transaction hash is required." },
      { status: 400 },
    );
  }

  const bet = await prisma.liveBet.findUnique({ where: { id: params.id } });
  if (!bet || bet.userId !== user.id) {
    return NextResponse.json({ error: "Bet not found." }, { status: 404 });
  }
  if (bet.status === "COMPLETED") {
    return NextResponse.json({ success: true, alreadyConfirmed: true });
  }

  const config = await resolveRobinhoodConfig();
  if (!config.contractAddress || !config.centsPerTestnetEth) {
    return NextResponse.json(
      { error: "Robinhood Chain isn't configured yet." },
      { status: 503 },
    );
  }

  const expectedAmountWei = centsToTestnetWei(
    bet.stakeCents,
    config.centsPerTestnetEth,
  );
  const verified = await verifyTestnetTransfer(
    txHash as `0x${string}`,
    config.contractAddress,
    expectedAmountWei,
  );
  if (!verified) {
    return NextResponse.json(
      { error: "Couldn't verify that transaction on-chain." },
      { status: 422 },
    );
  }

  try {
    await prisma.liveBet.update({
      where: { id: bet.id },
      data: { status: "COMPLETED", testnetPaymentTxHash: txHash },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // That transaction hash already confirmed a different bet -- a real
      // payment can only ever pay for one bet, no matter who submits it.
      return NextResponse.json(
        { error: "That transaction has already been used for another bet." },
        { status: 409 },
      );
    }
    throw err;
  }

  return NextResponse.json({ success: true });
}
