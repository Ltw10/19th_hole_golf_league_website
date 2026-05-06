/** Postgres schema for this league (shared Supabase project). */
export const NHGL_SCHEMA = "nhgl" as const;

export const SCORECARDS_BUCKET = "nhgl-scorecards" as const;

/** Championship week after removing handicap weeks from the schedule (see migrations). */
export const CHAMPIONSHIP_WEEK_NUMBER = 16 as const;

/** Roster bucket for skins-only guests; must not appear in team standings UI. */
export const SKINS_SUBSTITUTES_TEAM_NAME = "Skins substitutes" as const;

/** Players created from Handicap helper “add name” are assigned to this team. */
export const HANDICAP_HELPER_TEAM_NAME = "Handicap helper" as const;

export function filterTeamStandingsRows<T extends { team_name: string }>(rows: T[]): T[] {
  const hiddenTeamNames = new Set([
    SKINS_SUBSTITUTES_TEAM_NAME.toLowerCase(),
    HANDICAP_HELPER_TEAM_NAME.toLowerCase(),
  ]);

  return rows.filter((r) => !hiddenTeamNames.has(String(r.team_name).toLowerCase()));
}

/** User-facing label for `nhgl.season_phase` values from the API. */
export function formatSeasonPhase(phase: string): string {
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
