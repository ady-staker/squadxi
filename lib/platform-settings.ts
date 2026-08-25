import "server-only";
import { prisma } from "@/lib/prisma";
import { MIN_STAKE_CENTS, MAX_STAKE_CENTS } from "@/lib/live-bet-constants";

const DEFAULT_RAKE_BPS = 1500; // 15%
const DEFAULT_MIN_ENTRIES_TO_RUN = 3;
const DEFAULT_ROLE_BONUS_BPS = 0;

export type PlatformSettings = {
  bettingFrozen: boolean;
  bettingFrozenMessage: string | null;
  defaultRakeBps: number;
  defaultMinEntriesToRun: number;
  defaultRoleBonusBps: number;
  minLiveBetStakeCents: number;
  maxLiveBetStakeCents: number;
};

// Same Settings-row-first, hardcoded-fallback convention as
// lib/robinhood-chain.ts's resolveRobinhoodConfig -- re-resolved on every
// call, not cached, so an admin change takes effect on the next request.
export async function resolvePlatformSettings(): Promise<PlatformSettings> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  return {
    bettingFrozen: settings?.bettingFrozen ?? false,
    bettingFrozenMessage: settings?.bettingFrozenMessage ?? null,
    defaultRakeBps: settings?.defaultRakeBps ?? DEFAULT_RAKE_BPS,
    defaultMinEntriesToRun:
      settings?.defaultMinEntriesToRun ?? DEFAULT_MIN_ENTRIES_TO_RUN,
    defaultRoleBonusBps:
      settings?.defaultRoleBonusBps ?? DEFAULT_ROLE_BONUS_BPS,
    minLiveBetStakeCents: settings?.minLiveBetStakeCents ?? MIN_STAKE_CENTS,
    maxLiveBetStakeCents: settings?.maxLiveBetStakeCents ?? MAX_STAKE_CENTS,
  };
}
