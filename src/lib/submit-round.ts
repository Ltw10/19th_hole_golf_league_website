export type ExistingPlayerRound = {
  weekId: string;
  matchId: string;
  playerId: string;
  subbingForPlayerId: string | null;
};

export function rosterSlotTakenForWeek(
  existing: ExistingPlayerRound[],
  weekId: string,
  rosterPlayerId: string,
): boolean {
  return existing.some(
    (row) =>
      row.weekId === weekId &&
      (row.playerId === rosterPlayerId || row.subbingForPlayerId === rosterPlayerId),
  );
}

export function getSubmitRoundBlockReason(params: {
  existingRounds: ExistingPlayerRound[];
  finalizedMatchIds: ReadonlySet<string>;
  weekId: string;
  matchId: string;
  playerId: string;
  subbingForPlayerId: string | null;
}): string | null {
  const { existingRounds, finalizedMatchIds, weekId, matchId, playerId, subbingForPlayerId } = params;
  if (!weekId || !matchId || !playerId) return null;

  if (finalizedMatchIds.has(matchId)) {
    return "This match already has submitted scores. Ask an admin to edit or delete them.";
  }

  if (existingRounds.some((row) => row.weekId === weekId && row.playerId === playerId)) {
    return "You already submitted a round for this week. Scores can only be changed by an admin.";
  }

  if (
    subbingForPlayerId &&
    rosterSlotTakenForWeek(existingRounds, weekId, subbingForPlayerId)
  ) {
    return "A score is already on file for the player you are subbing for this week. Ask an admin to edit or delete it.";
  }

  return null;
}
