import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function verify(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const expected = process.env.NHGL_ADMIN_SECRET;
  if (!expected || !secret || secret !== expected) return false;
  return true;
}

type SubmissionRow = Record<string, unknown> & {
  week_id: string;
  team_a_id: string;
  team_b_id: string;
  submitted_by_player_id: string | null;
};

/** List score submissions (admin) and weeks (for test cleanup dropdown). */
export async function GET(req: Request) {
  if (!verify(req)) return unauthorized();
  const admin = createAdminSupabaseClient();
  const [{ data: rawRows, error }, { data: weeks, error: wErr }, { data: teams, error: tErr }] =
    await Promise.all([
      admin.from("score_submissions").select("*").order("created_at", { ascending: false }),
      admin.from("season_weeks").select("id, week_number, week_date, phase").order("week_number", {
        ascending: true,
      }),
      admin.from("teams").select("id, name"),
    ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const teamMap = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const weekMap = new Map(
    (weeks ?? []).map((w) => [
      w.id as string,
      {
        week_number: w.week_number as number,
        week_date: w.week_date as string,
        phase: w.phase as string,
      },
    ]),
  );

  const playerIds = [
    ...new Set(
      (rawRows as SubmissionRow[] | null)
        ?.map((r) => r.submitted_by_player_id)
        .filter((id): id is string => Boolean(id)) ?? [],
    ),
  ];

  let playerNameById = new Map<string, string>();
  if (playerIds.length > 0) {
    const { data: players, error: pErr } = await admin.from("players").select("id, name").in("id", playerIds);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    playerNameById = new Map((players ?? []).map((p) => [p.id as string, p.name as string]));
  }

  const data = (rawRows as SubmissionRow[] | null)?.map((row) => {
    const w = weekMap.get(row.week_id);
    const ta = teamMap.get(row.team_a_id) ?? "?";
    const tb = teamMap.get(row.team_b_id) ?? "?";
    const sid = row.submitted_by_player_id;
    return {
      ...row,
      week_number: w?.week_number ?? 0,
      week_date: w?.week_date ?? "",
      week_phase: w?.phase ?? "",
      matchup_label: `${ta} vs ${tb}`,
      submitter_player_name: sid ? (playerNameById.get(sid) ?? null) : null,
    };
  });

  return NextResponse.json({ data: data ?? [], weeks: weeks ?? [] });
}
