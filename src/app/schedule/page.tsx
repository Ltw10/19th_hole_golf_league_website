import Link from "next/link";
import { SupabaseConnectionHelp } from "@/components/SupabaseConnectionHelp";
import { formatSeasonPhase } from "@/lib/nhgl";
import { currentScheduleWeekId } from "@/lib/schedule";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Team = { id: string; name: string };
type Week = {
  id: string;
  week_number: number;
  week_date: string;
  phase: string;
};
type Match = {
  id: string;
  week_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
};

type ScoreRow = {
  match_id: string;
  team_a_points: number;
  team_b_points: number;
  scorecard_image_url: string | null;
};

/** Fixed middle/right column widths so each row’s grid matches (auto-sized cols misalign header vs body). */
const MATCH_TABLE_GRID =
  "grid w-full grid-cols-[minmax(0,1fr)_3.5rem_7rem] sm:grid-cols-[minmax(0,1fr)_4.5rem_7.5rem]";

export default async function SchedulePage() {
  let loadError: string | null = null;
  let weeks: Week[] = [];
  let matches: Match[] = [];
  let teams: Team[] = [];
  let scoresByMatchId = new Map<
    string,
    { a: number; b: number; scorecardImageUrl: string | null }
  >();

  try {
    const supabase = await createServerSupabaseClient();

    const [
      { data: w, error: wErr },
      { data: m, error: mErr },
      { data: t, error: tErr },
      { data: subs, error: sErr },
    ] = await Promise.all([
      supabase.from("season_weeks").select("*").order("week_number", { ascending: true }),
      supabase.from("matches").select("*"),
      supabase.from("teams").select("*"),
      supabase
        .from("score_submissions")
        .select("match_id, team_a_points, team_b_points, scorecard_image_url"),
    ]);

    if (wErr || mErr || tErr || sErr) {
      loadError =
        wErr?.message ?? mErr?.message ?? tErr?.message ?? sErr?.message ?? "Unknown error";
    } else {
      weeks = (w ?? []) as Week[];
      matches = (m ?? []) as Match[];
      teams = (t ?? []) as Team[];
      for (const row of (subs ?? []) as ScoreRow[]) {
        scoresByMatchId.set(row.match_id, {
          a: row.team_a_points,
          b: row.team_b_points,
          scorecardImageUrl: row.scorecard_image_url,
        });
      }
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Configure Supabase environment variables to load data.";
  }

  const teamMap = new Map(teams.map((x) => [x.id, x.name]));
  const byWeek = new Map<string, Match[]>();
  for (const m of matches) {
    const list = byWeek.get(m.week_id) ?? [];
    list.push(m);
    byWeek.set(m.week_id, list);
  }

  const highlightedWeekId = !loadError && weeks.length > 0 ? currentScheduleWeekId(weeks) : null;

  return (
    <div className="min-w-0 space-y-6">
      <div className="rounded-sm border-2 border-emerald-900/30 bg-[#f4f1e8] px-4 py-3 shadow-[3px_4px_0_0_rgba(6,60,45,0.12)]">
        <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-emerald-900/70">
          League schedule
        </p>
        <h1 className="mt-1 text-center text-2xl font-bold tracking-tight text-emerald-950">Schedule</h1>
        <p className="mt-1 text-center text-sm text-emerald-900/75">Every Tuesday · 6:00 PM</p>
      </div>

      {loadError && (
        <>
          <p className="text-red-700">{loadError}</p>
          <SupabaseConnectionHelp errorMessage={loadError} />
        </>
      )}

      {!loadError && (
        <ul className="space-y-7">
          {weeks.map((w) => {
            const ms = byWeek.get(w.id) ?? [];
            return (
              <li
                key={w.id}
                className={
                  highlightedWeekId === w.id
                    ? "relative z-[1] overflow-hidden rounded-sm border-2 border-amber-700/90 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)] outline outline-2 outline-offset-2 outline-amber-700/95"
                    : "overflow-hidden rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]"
                }
              >
                <div className="border-b-2 border-emerald-900/30 bg-[#e8efe3] px-3 py-2.5 sm:px-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-900/65">
                        Week {w.week_number}
                        {highlightedWeekId === w.id ? (
                          <span className="ml-2 inline-block rounded-sm bg-amber-700 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-[#fffef8]">
                            This week
                          </span>
                        ) : null}
                      </p>
                      <h2 className="text-lg font-bold text-emerald-950">{formatSeasonPhase(w.phase)}</h2>
                    </div>
                    <time dateTime={w.week_date} className="font-mono text-xs text-emerald-900/80 sm:text-sm">
                      {formatDate(w.week_date)}
                      <span className="block text-right text-[0.65rem] font-sans uppercase tracking-wider text-emerald-800/70 sm:inline sm:ml-2 sm:text-xs">
                        6:00 PM
                      </span>
                    </time>
                  </div>
                </div>
                {ms.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-emerald-900/60">
                    {w.phase === "handicap"
                      ? "Handicap weeks — matchups follow Regular Season scheduling."
                      : "No matches listed."}
                  </p>
                ) : (
                  <div className="border-t border-emerald-900/15">
                    <ul
                      className={`${MATCH_TABLE_GRID} border-b border-emerald-900/20 bg-[#eef3e8]/90 px-2`}
                    >
                      <li className="border-r border-emerald-900/15 py-1.5 pr-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-900/75 sm:text-[0.65rem] sm:tracking-[0.14em]">
                        Match
                      </li>
                      <li className="flex items-center justify-center border-r border-emerald-900/15 py-1.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-900/75 sm:text-[0.65rem] sm:tracking-[0.14em]">
                        Pts
                      </li>
                      <li className="flex min-w-0 items-center justify-center py-1.5 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-900/75 sm:text-[0.65rem] sm:tracking-[0.14em]">
                        Card
                      </li>
                    </ul>
                    <ul>
                      {ms.map((m, idx) => {
                        const submitted = scoresByMatchId.get(m.id);
                        return (
                          <li
                            key={m.id}
                            className={`${MATCH_TABLE_GRID} items-center border-b border-emerald-900/15 px-2 py-1.5 text-sm last:border-b-0 sm:py-0 ${
                              idx % 2 === 1 ? "sm:bg-[#f3f0e6]/70" : "sm:bg-[#faf8f0]"
                            }`}
                          >
                            <span className="min-w-0 border-r border-emerald-900/15 py-0.5 pr-2 text-[0.8125rem] font-medium leading-snug text-emerald-950 sm:px-3 sm:py-2.5 sm:text-sm">
                              {formatMatchup(m.team_a_id, m.team_b_id, teamMap)}
                            </span>
                            <div className="flex items-center justify-center border-r border-emerald-900/15 sm:px-2 sm:py-2.5">
                              {submitted ? (
                                <span className="font-mono text-sm font-semibold tabular-nums text-emerald-950 sm:text-base">
                                  {submitted.a}
                                  <span className="mx-0.5 font-normal text-emerald-800/45 sm:mx-1">·</span>
                                  {submitted.b}
                                </span>
                              ) : (
                                <span className="font-mono text-sm text-emerald-800/35 sm:text-base">—</span>
                              )}
                            </div>
                            <div className="flex min-w-0 items-center justify-center sm:px-3 sm:py-2">
                              {m.team_a_id && m.team_b_id ? (
                                submitted ? (
                                  submitted.scorecardImageUrl ? (
                                    <a
                                      href={submitted.scorecardImageUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 whitespace-nowrap rounded-sm border border-emerald-800/25 bg-white px-2 py-1 text-xs font-medium text-emerald-900 shadow-sm hover:bg-[#f4f1e8] sm:px-2.5"
                                    >
                                      View card
                                    </a>
                                  ) : (
                                    <span className="whitespace-nowrap rounded-sm border border-emerald-900/20 bg-[#eef3e8] px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wide text-emerald-900/80 sm:px-2.5 sm:text-[0.65rem]">
                                      Submitted
                                    </span>
                                  )
                                ) : (
                                  <Link
                                    href={`/submit-scores?match=${encodeURIComponent(m.id)}`}
                                    className="shrink-0 rounded-sm border-2 border-emerald-800/40 bg-emerald-900 px-2 py-1.5 text-[0.65rem] font-semibold leading-none text-[#f5f2e8] shadow-sm hover:bg-emerald-950 sm:px-2.5 sm:py-1 sm:text-xs"
                                  >
                                    Enter
                                  </Link>
                                )
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatMatchup(
  teamAId: string | null,
  teamBId: string | null,
  teamMap: Map<string, string>,
) {
  if (!teamAId && !teamBId) return "- vs -";
  const a = teamAId ? teamMap.get(teamAId) ?? "—" : "—";
  const b = teamBId ? teamMap.get(teamBId) ?? "—" : "—";
  return `${a} vs ${b}`;
}
