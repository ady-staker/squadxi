import { keccak256, stringToHex } from "viem";
import { prisma } from "@/lib/prisma";

function liveBetClaimId(betId: string): string {
  return keccak256(stringToHex(`livebet:${betId}`));
}

/**
 * Settles every LiveBet on a match once it reaches COMPLETED. Called from
 * lib/live-advance.ts's advanceMatch() alongside finalizeMatchContests --
 * this is the only point in the app where Match.winnerTeamId is known
 * final. Only paid bets (status COMPLETED) are ever settled, same
 * paid-only-filter discipline as finalizeMatchContests: an unpaid bet
 * never became a real wager.
 */
export async function settleLiveBets(matchId: string): Promise<void> {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: matchId },
  });
  if (!match.winnerTeamId) return; // shouldn't happen at COMPLETED, guard anyway

  const paidBets = await prisma.liveBet.findMany({
    where: { matchId, status: "COMPLETED" },
  });

  for (const bet of paidBets) {
    const outcome = bet.sideTeamId === match.winnerTeamId ? "WON" : "LOST";
    const payoutCents =
      outcome === "WON"
        ? Math.floor(bet.stakeCents * Number(bet.oddsMultiplier))
        : 0;

    const claimId =
      outcome === "WON" && bet.testnetPaymentTxHash
        ? liveBetClaimId(bet.id)
        : null;

    await prisma.liveBet.update({
      where: { id: bet.id },
      data: { outcome, payoutCents, claimId, settledAt: new Date() },
    });

    if (outcome === "WON" && payoutCents > 0 && bet.coinvoyageOrderId) {
      await prisma.payout.upsert({
        where: { liveBetId: bet.id },
        create: {
          liveBetId: bet.id,
          amountOwedCents: payoutCents,
          chain: null,
          token: null,
          walletAddress: null,
        },
        update: {}, // already exists (e.g. a re-run) -- don't clobber an in-progress payout
      });
    }
  }
}
