/**
 * League nights are Tuesday 6pm. "Current" week = the week whose Tuesday match is next:
 * the first week with week_date >= today (calendar date in the league timezone).
 * After that Tuesday passes, Wednesday rolls forward to the following week.
 */

function leagueTimeZone(): string {
  return process.env.NHGL_LEAGUE_TIMEZONE?.trim() || "America/New_York";
}

/** YYYY-MM-DD for "today" in the league timezone. */
export function todayYmdInLeagueTimezone(now = new Date()): string {
  const tz = leagueTimeZone();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) return now.toISOString().slice(0, 10);
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** UUID of the season week row that holds the next matchup (see module docstring). */
export function currentScheduleWeekId(weeks: { id: string; week_date: string }[]): string | null {
  if (weeks.length === 0) return null;
  const today = todayYmdInLeagueTimezone();
  const sorted = [...weeks].sort((a, b) => a.week_date.localeCompare(b.week_date));
  const next = sorted.find((w) => w.week_date >= today);
  return next?.id ?? null;
}
