import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public -- full transparency on exactly what a loan costs before anyone
// applies. Part of the SQXI Finance disclosure story, not sensitive.
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await prisma.settings.findUniqueOrThrow({
    where: { id: 1 },
  });
  return NextResponse.json({
    interestRateBps: settings.loanInterestRateBps,
    termDays: settings.loanTermDaysDefault,
    maxPrincipalWei: settings.loanMaxPrincipalWei,
    maxUtilizationBps: settings.loanMaxUtilizationBps,
  });
}
