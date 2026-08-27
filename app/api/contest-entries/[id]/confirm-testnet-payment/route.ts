import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  centsToTestnetWei,
  resolveRobinhoodConfig,
  verifyTestnetTransfer,
  TransactionNotYetVisibleError,
} from "@/lib/robinhood-chain";

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
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

  let txHash: unknown;
  let walletAddress: unknown;
  try {
    const body = await request.json();
    txHash = body?.txHash;
    walletAddress = body?.walletAddress;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) {
    return NextResponse.json(
      { error: "A valid transaction hash is required." },
      { status: 400 },
    );
  }
  if (typeof walletAddress !== "string" || !ADDRESS_RE.test(walletAddress)) {
    return NextResponse.json(
      { error: "A connected wallet address is required." },
      { status: 400 },
    );
  }

  const entry = await prisma.contestEntry.findUnique({
    where: { id: params.id },
  });
  if (!entry || entry.userId !== user.id) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }
  if (entry.paymentStatus === "COMPLETED") {
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
    entry.entryFeeCents,
    config.centsPerTestnetEth,
  );
  let verified: boolean;
  try {
    verified = await verifyTestnetTransfer(
      txHash as `0x${string}`,
      config.contractAddress,
      expectedAmountWei,
      walletAddress as `0x${string}`,
    );
  } catch (err) {
    if (err instanceof TransactionNotYetVisibleError) {
      return NextResponse.json(
        {
          error:
            "That transaction hasn't shown up on-chain yet -- wait a few seconds and try again.",
        },
        { status: 409 },
      );
    }
    throw err;
  }
  if (!verified) {
    return NextResponse.json(
      { error: "Couldn't verify that transaction on-chain." },
      { status: 422 },
    );
  }

  try {
    await prisma.contestEntry.update({
      where: { id: entry.id },
      data: { paymentStatus: "COMPLETED", testnetPaymentTxHash: txHash },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // That transaction hash already confirmed a different entry -- a real
      // payment can only ever pay for one entry, no matter who submits it.
      return NextResponse.json(
        { error: "That transaction has already been used for another entry." },
        { status: 409 },
      );
    }
    throw err;
  }

  return NextResponse.json({ success: true });
}
