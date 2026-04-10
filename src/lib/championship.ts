import { createAdminSupabaseClient } from "@/lib/supabase/admin";

/**
 * Sets the week 19 championship match to the top two teams by regular-season points (ties break by team_id).
 */
export async function refreshChampionshipMatchup(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createAdminSupabaseClient();

    const { data: standings, error: sErr } = await admin
      .from("v_regular_season_team_points")
      .select("team_id, regular_season_points")
      .order("regular_season_points", { ascending: false })
      .order("team_id", { ascending: true });

    if (sErr) return { ok: false, error: sErr.message };
    if (!standings || standings.length < 2) {
      return { ok: false, error: "Need at least two teams with standings data." };
    }

    const top = standings[0]!.team_id;
    const second = standings[1]!.team_id;

    const { data: week, error: wErr } = await admin
      .from("season_weeks")
      .select("id")
      .eq("week_number", 19)
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
