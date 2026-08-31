import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRobinhoodConfig } from "@/lib/robinhood-chain";

// Public -- full transparency on exactly what a loan costs before anyone
// applies. Part of the SQXI Finance disclosure story, not sensitive.
// contractAddress is already public (it's returned in every claim voucher
// response) -- exposed here too since repayment needs to know where to
// send funds.
export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, config] = await Promise.all([
    prisma.settings.findUniqueOrThrow({ where: { id: 1 } }),
    resolveRobinhoodConfig(),
  ]);
  return NextResponse.json({
    interestRateBps: settings.loanInterestRateBps,
    termDays: settings.loanTermDaysDefault,
    maxPrincipalWei: settings.loanMaxPrincipalWei,
    maxUtilizationBps: settings.loanMaxUtilizationBps,
    contractAddress: config.contractAddress,
  });
}
