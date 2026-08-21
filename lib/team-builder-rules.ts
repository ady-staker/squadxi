// Pure team-composition validation -- no DB import, so this same function
// runs both server-side (the actual authority, in app/api/fantasy-teams)
// and client-side (for instant feedback in the team-builder UI, using the
// same player pool the page already fetched). The server call is what
// actually gates persistence; the client call is only ever a UX nicety.

export type TeamBuilderPlayer = {
  id: string;
  teamId: string;
  role: string; // WK | BAT | BOWL | AR
  creditValue: number;
};

export const TOTAL_CREDITS = 100;
export const SQUAD_SIZE = 11;
export const MAX_PER_REAL_TEAM = 7;
export const ROLE_LIMITS: Record<string, { min: number; max: number }> = {
  WK: { min: 1, max: 4 },
  BAT: { min: 3, max: 6 },
  BOWL: { min: 3, max: 6 },
  AR: { min: 1, max: 4 },
};

export type ValidationResult =
  { valid: true } | { valid: false; errors: string[] };

export function validateFantasyTeam(
  pool: TeamBuilderPlayer[],
  selectedPlayerIds: string[],
  captainId: string,
  viceCaptainId: string,
): ValidationResult {
  const errors: string[] = [];

  const uniqueIds = new Set(selectedPlayerIds);
  if (uniqueIds.size !== selectedPlayerIds.length) {
    errors.push("Duplicate players in selection.");
  }

  if (selectedPlayerIds.length !== SQUAD_SIZE) {
    errors.push(
      `Select exactly ${SQUAD_SIZE} players (got ${selectedPlayerIds.length}).`,
    );
  }

  const poolById = new Map(pool.map((p) => [p.id, p]));
  const selected: TeamBuilderPlayer[] = [];
  for (const id of selectedPlayerIds) {
    const p = poolById.get(id);
    if (!p) {
      errors.push(`Player ${id} is not part of this match's pool.`);
      continue;
    }
    selected.push(p);
  }

  // Only evaluate the remaining rules against players that were actually
  // found in the pool -- an invalid id was already reported above.
  if (selected.length > 0) {
    const totalCredits = selected.reduce((sum, p) => sum + p.creditValue, 0);
    if (totalCredits > TOTAL_CREDITS) {
      errors.push(
        `Team costs ${totalCredits.toFixed(1)} credits, over the ${TOTAL_CREDITS}-credit budget.`,
      );
    }

    const roleCounts: Record<string, number> = {
      WK: 0,
      BAT: 0,
      BOWL: 0,
      AR: 0,
    };
    const realTeamCounts = new Map<string, number>();
    for (const p of selected) {
      roleCounts[p.role] = (roleCounts[p.role] ?? 0) + 1;
      realTeamCounts.set(p.teamId, (realTeamCounts.get(p.teamId) ?? 0) + 1);
    }

    for (const [role, { min, max }] of Object.entries(ROLE_LIMITS)) {
      const count = roleCounts[role] ?? 0;
      if (count < min)
        errors.push(`Need at least ${min} ${role} (have ${count}).`);
      if (count > max)
        errors.push(`No more than ${max} ${role} allowed (have ${count}).`);
    }

    for (const [teamId, count] of realTeamCounts) {
      if (count > MAX_PER_REAL_TEAM) {
        errors.push(
          `No more than ${MAX_PER_REAL_TEAM} players from one real-world team (have ${count}).`,
        );
      }
    }
  }

  if (!selectedPlayerIds.includes(captainId)) {
    errors.push("Captain must be one of the 11 selected players.");
  }
  if (!selectedPlayerIds.includes(viceCaptainId)) {
    errors.push("Vice-captain must be one of the 11 selected players.");
  }
  if (captainId && viceCaptainId && captainId === viceCaptainId) {
    errors.push("Captain and vice-captain must be different players.");
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
