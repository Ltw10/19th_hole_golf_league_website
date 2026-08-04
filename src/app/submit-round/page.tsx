import type { ComponentProps } from "react";
import { SubmitRoundForm } from "@/components/SubmitRoundForm";
import { handicapFromScores, type ScoreRow } from "@/lib/scoring";
import { SUBSTITUTES_TEAM_NAME } from "@/lib/nhgl";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FormProps = ComponentProps<typeof SubmitRoundForm>;

export default async function SubmitRoundPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const matchParam = searchParams.match;
  const matchIdFromUrl = typeof matchParam === "string" ? matchParam : "";

  let loadError: string | null = null;
  let weeks: FormProps["weeks"] = [];
  let matches: FormProps["matches"] = [];
  let teams: FormProps["teams"] = [];
  let players: FormProps["players"] = [];
  let courseHoles: FormProps["courseHoles"] = [];
  let hhScoresByPlayer: Record<string, ScoreRow[]> = {};
  let skinsBuyinAmount = 5;
  let subsTeamId: string | null = null;
  let existingRounds: FormProps["existingRounds"] = [];
  let finalizedMatchIds: FormProps["finalizedMatchIds"] = [];

  try {
    const supabase = await createServerSupabaseClient();
    const [
      w,
      m,
      t,
      p,
      courseRes,
      settingsRes,
      hhRes,
      teamsNamed,
      roundsRes,
      finalizedRes,
    ] = await Promise.all([
      supabase.from("season_weeks").select("*").order("week_number", { ascending: true }),
      supabase.from("matches").select("*"),
      supabase.from("teams").select("*").order("name"),
      supabase.from("players").select("*").order("name"),
      supabase.from("courses").select("id").eq("name", "Hickory Sticks").maybeSingle(),
      supabase.from("league_settings").select("key, value"),
      supabase
        .from("handicap_helper_scores")
        .select("player_id, played_date, score, par, created_at")
        .order("played_date", { ascending: false }),
      supabase.from("teams").select("id").eq("name", SUBSTITUTES_TEAM_NAME).maybeSingle(),
      supabase
        .from("player_rounds")
        .select("week_id, match_id, player_id, subbing_for_player_id"),
      supabase.from("score_submissions").select("match_id"),
    ]);

    const courseId = courseRes.data?.id as string | undefined;
    const holesRes = courseId
      ? await supabase
          .from("course_holes")
          .select("hole_number, par, stroke_index")
          .eq("course_id", courseId)
          .order("hole_number", { ascending: true })
      : { data: [], error: null };

    const err =
      w.error ??
      m.error ??
      t.error ??
      p.error ??
      holesRes.error ??
      settingsRes.error ??
      hhRes.error ??
      teamsNamed.error ??
      roundsRes.error ??
      finalizedRes.error ??
      courseRes.error;
    if (err) loadError = err.message;
    else {
      weeks = (w.data ?? []) as FormProps["weeks"];
      matches = (m.data ?? []) as FormProps["matches"];
      teams = (t.data ?? []) as FormProps["teams"];
      players = (p.data ?? []) as FormProps["players"];

      courseHoles = (holesRes.data ?? []) as FormProps["courseHoles"];

      for (const row of settingsRes.data ?? []) {
        if (row.key === "skins_buyin_amount") {
          const n = Number(String(row.value).replace(/,/g, ""));
          if (Number.isFinite(n)) skinsBuyinAmount = n;
        }
      }

      subsTeamId = (teamsNamed.data?.id as string | undefined) ?? null;

      existingRounds = (roundsRes.data ?? []).map((row) => ({
        weekId: String(row.week_id),
        matchId: String(row.match_id),
        playerId: String(row.player_id),
        subbingForPlayerId: row.subbing_for_player_id ? String(row.subbing_for_player_id) : null,
      }));
      finalizedMatchIds = [...new Set((finalizedRes.data ?? []).map((row) => String(row.match_id)))];

      for (const row of hhRes.data ?? []) {
        const pid = row.player_id as string;
        const list = hhScoresByPlayer[pid] ?? [];
        list.push({
          played_date: row.played_date as string,
          score: Number(row.score),
          par: Number(row.par),
          created_at: row.created_at as string | undefined,
        });
        hhScoresByPlayer[pid] = list;
      }
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not load form — check Supabase configuration.";
  }

  if (loadError) {
    return <p className="text-red-700">{loadError}</p>;
  }

  let initialWeekId: string | undefined;
  let initialMatchId: string | undefined;
  if (matchIdFromUrl) {
    const match = matches.find((x) => x.id === matchIdFromUrl);
    const week = match ? weeks.find((x) => x.id === match.week_id) : undefined;
    if (match?.team_a_id && match.team_b_id && week && week.phase !== "handicap") {
      initialWeekId = week.id;
      initialMatchId = match.id;
    }
  }

  const weekDatesByWeekId: Record<string, string> = {};
  for (const w of weeks) {
    weekDatesByWeekId[w.id] = w.week_date;
  }

  const handicapByPlayer: Record<string, number> = {};
  for (const pl of players) {
    const rows = hhScoresByPlayer[pl.id] ?? [];
    handicapByPlayer[pl.id] = handicapFromScores(rows);
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-emerald-950 sm:text-2xl">Submit round</h1>
        <p className="mt-1 text-sm text-zinc-600 sm:text-base">
          Enter all nine holes for league night (one submission per player per week). Skins and team points update when
          everyone in the match has submitted. Corrections after you submit must go through an admin.
        </p>
      </div>
      <SubmitRoundForm
        weeks={weeks}
        matches={matches}
        teams={teams}
        players={players}
        courseHoles={courseHoles}
        skinsBuyinAmount={skinsBuyinAmount}
        handicapByPlayer={handicapByPlayer}
        hhScoresByPlayer={hhScoresByPlayer}
        weekDatesByWeekId={weekDatesByWeekId}
        subsTeamId={subsTeamId}
        existingRounds={existingRounds}
        finalizedMatchIds={finalizedMatchIds}
        initialWeekId={initialWeekId}
        initialMatchId={initialMatchId}
      />
    </div>
  );
}
