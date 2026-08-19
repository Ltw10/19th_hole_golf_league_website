import { CHAMPIONSHIP_WEEK_NUMBER } from "@/lib/nhgl";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

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
