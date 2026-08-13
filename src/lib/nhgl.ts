/** Postgres schema for this league (shared Supabase project). */
export const NHGL_SCHEMA = "nhgl" as const;

export const SCORECARDS_BUCKET = "nhgl-scorecards" as const;

/** Championship week (after Week 15 weather cancel pushed the final RS week to 16). */
export const CHAMPIONSHIP_WEEK_NUMBER = 17 as const;

/**
 * Guest bucket for matchup substitutes and Handicap helper “add name” players.
 * Must not appear in team standings. League membership is `players.is_league_member`.
 */
export const SUBSTITUTES_TEAM_NAME = "Substitutes" as const;

export function filterTeamStandingsRows<T extends { team_name: string }>(rows: T[]): T[] {
  const hiddenTeamNames = new Set([
    SUBSTITUTES_TEAM_NAME.toLowerCase(),
    // Legacy names if an old DB still has leftover teams during rollout
    "skins substitutes",
    "handicap helper",
  ]);

  return rows.filter((r) => !hiddenTeamNames.has(String(r.team_name).toLowerCase()));
}

/** User-facing label for `nhgl.season_phase` values from the API. */
export function formatSeasonPhase(phase: string, opts?: { isCancelled?: boolean }): string {
  if (opts?.isCancelled) return "Cancelled";
  switch (phase) {
    case "regular":
      return "Regular Season";
    case "handicap":
      return "Handicap";
    case "championship":
      return "Championship";
    default:
      return phase;
  }
}
