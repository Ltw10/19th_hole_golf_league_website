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

type HandicapRow = Record<string, unknown> & {
  id: string;
  player_id: string;
  played_date: string;
  score: number;
  par: number;
  created_at: string;
  handicap_at_submission: number | null;
};

/** List score submissions (admin) and weeks (for test cleanup dropdown). */
export async function GET(req: Request) {
  if (!verify(req)) return unauthorized();
  const admin = createAdminSupabaseClient();
  const [
    { data: rawRows, error },
    { data: weeks, error: wErr },
    { data: teams, error: tErr },
    { data: players, error: pListErr },
    { data: rawHandicapRows, error: hErr },
    { data: playerRounds, error: prErr },
  ] = await Promise.all([
    admin.from("score_submissions").select("*").order("created_at", { ascending: false }),
    admin.from("season_weeks").select("id, week_number, week_date, phase").order("week_number", {
      ascending: true,
    }),
    admin.from("teams").select("id, name"),
    admin.from("players").select("id, name, team_id").order("name", { ascending: true }),
    admin
      .from("handicap_helper_scores")
      .select("id, player_id, played_date, score, par, created_at")
      .order("played_date", { ascending: false })
      .order("created_at", { ascending: false }),
    admin.from("player_rounds").select("player_id, week_id, handicap_at_submission"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (pListErr) return NextResponse.json({ error: pListErr.message }, { status: 500 });
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
  if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

  const matchIds = [
    ...new Set((rawRows as SubmissionRow[] | null)?.map((r) => r.match_id as string).filter(Boolean) ?? []),
  ];
  const matchPlayerRounds: Record<
    string,
    {
      id: string;
      week_id: string;
      match_id: string;
      player_id: string;
      player_name: string;
      played_for_team_id: string;
      team_name: string;
      played_skins: boolean;
      which_nine: string | null;
      handicap_at_submission: number | null;
      holes: { hole_number: number; strokes: number }[];
    }[]
  > = {};

  if (matchIds.length > 0) {
    const { data: prRows, error: prFetchErr } = await admin
      .from("player_rounds")
      .select(
        "id, week_id, match_id, player_id, played_for_team_id, played_skins, which_nine, handicap_at_submission, player_hole_scores(hole_number, strokes)",
      )
      .in("match_id", matchIds);
    if (prFetchErr) return NextResponse.json({ error: prFetchErr.message }, { status: 500 });

    const allPlayerNameById = new Map((players ?? []).map((p) => [p.id as string, p.name as string]));
    const teamMapForRounds = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));

    for (const pr of prRows ?? []) {
      const mid = pr.match_id as string;
      const pid = pr.player_id as string;
      const holesRaw = (pr as { player_hole_scores?: { hole_number: number; strokes: number }[] | null })
        .player_hole_scores;
      const holes = [...(holesRaw ?? [])].sort((a, b) => a.hole_number - b.hole_number);
      const entry = {
        id: pr.id as string,
        week_id: pr.week_id as string,
        match_id: mid,
        player_id: pid,
        player_name: allPlayerNameById.get(pid) ?? "Unknown player",
        played_for_team_id: pr.played_for_team_id as string,
        team_name: teamMapForRounds.get(pr.played_for_team_id as string) ?? "?",
        played_skins: Boolean(pr.played_skins),
        which_nine: (pr.which_nine as string | null) ?? null,
        handicap_at_submission:
          pr.handicap_at_submission == null ? null : Number(pr.handicap_at_submission as number),
        holes,
      };
      const list = matchPlayerRounds[mid] ?? [];
      list.push(entry);
      matchPlayerRounds[mid] = list;
    }
    for (const mid of Object.keys(matchPlayerRounds)) {
      matchPlayerRounds[mid]!.sort((a, b) => a.player_name.localeCompare(b.player_name, undefined, { sensitivity: "base" }));
    }
  }

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

  const allPlayerNameById = new Map((players ?? []).map((p) => [p.id as string, p.name as string]));
  const weekDateById = new Map((weeks ?? []).map((w) => [w.id as string, w.week_date as string]));
  const snapshotByPlayerDate = new Map<string, number>();
  for (const pr of playerRounds ?? []) {
    const pid = pr.player_id as string;
    const wid = pr.week_id as string;
    const snap = pr.handicap_at_submission as number | null;
    const ymd = weekDateById.get(wid);
    if (!ymd || snap == null) continue;
    snapshotByPlayerDate.set(`${pid}:${ymd}`, Number(snap));
  }
  const handicap_scores = (rawHandicapRows as HandicapRow[] | null)?.map((row) => ({
    ...row,
    player_name: allPlayerNameById.get(row.player_id) ?? "Unknown player",
    handicap_at_submission: snapshotByPlayerDate.get(`${row.player_id}:${row.played_date}`) ?? null,
  }));

  const teamNameById = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const playersWithTeam = (players ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    team_id: p.team_id as string,
    team_name: teamNameById.get(p.team_id as string) ?? "Unknown team",
  }));

  return NextResponse.json({
    data: data ?? [],
    weeks: weeks ?? [],
    handicap_scores: handicap_scores ?? [],
    players: playersWithTeam,
    match_player_rounds: matchPlayerRounds,
  });
}
