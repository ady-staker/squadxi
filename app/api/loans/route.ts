import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { totalInterestOwedWei } from "@/lib/pool";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function serializeLoan(loan: {
  id: string;
  principalWei: string;
  interestRateBps: number;
  termDays: number;
  status: string;
  requestedAt: Date;
  approvedAt: Date | null;
  dueAt: Date | null;
  disbursedTxHash: string | null;
  repaidPrincipalWei: string;
  repaidInterestWei: string;
  defaultedAt: Date | null;
}) {
  return {
    id: loan.id,
    principalWei: loan.principalWei,
    interestRateBps: loan.interestRateBps,
    termDays: loan.termDays,
    status: loan.status,
    requestedAt: loan.requestedAt,
    approvedAt: loan.approvedAt,
    dueAt: loan.dueAt,
    disbursedTxHash: loan.disbursedTxHash,
    repaidPrincipalWei: loan.repaidPrincipalWei,
    repaidInterestWei: loan.repaidInterestWei,
    defaultedAt: loan.defaultedAt,
    totalInterestOwedWei: totalInterestOwedWei(loan).toString(),
  };
}

// My loans -- newest first.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  const loans = await prisma.loan.findMany({
    where: { borrowerUserId: user.id },
    orderBy: { requestedAt: "desc" },
  });
  return NextResponse.json({ loans: loans.map(serializeLoan) });
}

// Apply for a loan -- creates a PENDING request only, no funds move until
// an admin approves (lib/pool.ts's originateLoan disburses on approval).
// One active/pending loan per user at a time -- this app has no
// income/credit signal to size a bigger cap against.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "You must be signed in." },
      { status: 401 },
    );
  }

  let body: { principalWei?: unknown; borrowerWalletAddress?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { principalWei, borrowerWalletAddress } = body;
  if (typeof principalWei !== "string" || !/^\d+$/.test(principalWei)) {
    return NextResponse.json(
      { error: "A valid loan amount is required." },
      { status: 400 },
    );
  }
  if (
    typeof borrowerWalletAddress !== "string" ||
    !ADDRESS_RE.test(borrowerWalletAddress)
  ) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  }

  const principal = BigInt(principalWei);
  if (principal <= BigInt(0)) {
    return NextResponse.json(
      { error: "Loan amount must be positive." },
      { status: 400 },
    );
  }

  const settings = await prisma.settings.findUniqueOrThrow({
    where: { id: 1 },
  });
  if (principal > BigInt(settings.loanMaxPrincipalWei)) {
    return NextResponse.json(
      {
        error: `Loans are capped at ${(Number(settings.loanMaxPrincipalWei) / 1e18).toFixed(4)} ETH.`,
      },
      { status: 400 },
    );
  }

  const existingActive = await prisma.loan.findFirst({
    where: { borrowerUserId: user.id, status: { in: ["PENDING", "ACTIVE"] } },
  });
  if (existingActive) {
    return NextResponse.json(
      { error: "You already have a pending or active loan." },
      { status: 409 },
    );
  }

  const loan = await prisma.loan.create({
    data: {
      borrowerUserId: user.id,
      principalWei: principal.toString(),
      interestRateBps: settings.loanInterestRateBps,
      termDays: settings.loanTermDaysDefault,
      borrowerWalletAddress,
    },
  });

  return NextResponse.json({ loan: serializeLoan(loan) });
}
