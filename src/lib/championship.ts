import { CHAMPIONSHIP_WEEK_NUMBER } from "@/lib/nhgl";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ChampionshipResult = {
  winnerTeamId: string;
  runnerUpTeamId: string;
  championPlayerNames: string[];
};

type ChampionshipClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * Returns championship outcome once a score submission exists for championship week.
 */
export async function getChampionshipResult(
  client?: ChampionshipClient,
): Promise<ChampionshipResult | null> {
  try {
    const supabase = client ?? (await createServerSupabaseClient());

    const { data: week } = await supabase
      .from("season_weeks")
      .select("id")
      .eq("week_number", CHAMPIONSHIP_WEEK_NUMBER)
      .maybeSingle();
    if (!week?.id) return null;

    const { data: match } = await supabase
      .from("matches")
      .select("id, team_a_id, team_b_id")
      .eq("week_id", week.id)
      .maybeSingle();
    if (!match?.id || !match.team_a_id || !match.team_b_id) return null;

    const { data: submission } = await supabase
      .from("score_submissions")
      .select("id, team_a_points, team_b_points, team_a_id, team_b_id")
      .eq("match_id", match.id)
      .maybeSingle();
    if (!submission?.id) return null;

    const teamAId = (submission.team_a_id as string | null) ?? (match.team_a_id as string);
    const teamBId = (submission.team_b_id as string | null) ?? (match.team_b_id as string);
    const teamAPoints = Number(submission.team_a_points);
    const teamBPoints = Number(submission.team_b_points);
    if (!Number.isFinite(teamAPoints) || !Number.isFinite(teamBPoints)) return null;

    const winnerTeamId = teamAPoints >= teamBPoints ? teamAId : teamBId;
    const runnerUpTeamId = winnerTeamId === teamAId ? teamBId : teamAId;

    const { data: rounds } = await supabase
      .from("player_rounds")
      .select("player_id, played_for_team_id")
      .eq("match_id", match.id)
      .eq("played_for_team_id", winnerTeamId);

    const playerIds = [...new Set((rounds ?? []).map((r) => r.player_id as string))];
    let championPlayerNames: string[] = [];

    if (playerIds.length > 0) {
      const { data: players } = await supabase.from("players").select("id, name").in("id", playerIds);
      championPlayerNames = (players ?? [])
        .map((p) => p.name as string)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }

    if (championPlayerNames.length === 0) {
      const { data: roster } = await supabase
        .from("players")
        .select("name")
        .eq("team_id", winnerTeamId)
        .order("name", { ascending: true });
      championPlayerNames = (roster ?? []).map((p) => p.name as string);
    }

    if (championPlayerNames.length === 0) return null;

    return { winnerTeamId, runnerUpTeamId, championPlayerNames };
  } catch {
    return null;
  }
}

/**
 * Sets the championship-week match.
 * - If team IDs are provided, uses those directly.
 * - Otherwise uses top two by Regular Season points (ties break by team_id).
 */
export async function refreshChampionshipMatchup(
  teamAId?: string,
  teamBId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createAdminSupabaseClient();
    let top = teamAId ?? "";
    let second = teamBId ?? "";

    if (top && second) {
      if (top === second) return { ok: false, error: "Championship teams must be different." };
      const { data: teams, error: teamErr } = await admin.from("teams").select("id").in("id", [top, second]);
      if (teamErr) return { ok: false, error: teamErr.message };
      if (!teams || teams.length !== 2) return { ok: false, error: "One or both selected teams were not found." };
    } else {
      const { data: standings, error: sErr } = await admin
        .from("v_regular_season_team_points")
        .select("team_id, regular_season_points")
        .order("regular_season_points", { ascending: false })
        .order("team_id", { ascending: true });

      if (sErr) return { ok: false, error: sErr.message };
      if (!standings || standings.length < 2) {
        return { ok: false, error: "Need at least two teams with standings data." };
      }
      top = standings[0]!.team_id;
      second = standings[1]!.team_id;
    }

    const { data: week, error: wErr } = await admin
      .from("season_weeks")
      .select("id")
      .eq("week_number", CHAMPIONSHIP_WEEK_NUMBER)
      .maybeSingle();

    if (wErr || !week) return { ok: false, error: wErr?.message ?? "Championship week not found." };

    const { data: match, error: mErr } = await admin
      .from("matches")
      .select("id")
      .eq("week_id", week.id)
      .maybeSingle();

    if (mErr || !match) return { ok: false, error: mErr?.message ?? "Championship match not found." };

    const { error: uErr } = await admin
      .from("matches")
      .update({
        team_a_id: top,
        team_b_id: second,
      })
      .eq("id", match.id);

    if (uErr) return { ok: false, error: uErr.message };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
