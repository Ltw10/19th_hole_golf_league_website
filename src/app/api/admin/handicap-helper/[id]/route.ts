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

type Params = { params: Promise<{ id: string }> };

/**
 * Deletes one handicap_helper_scores row. If the same player has a player_round for a week whose
 * week_date equals played_date, removes that round (hole scores cascade) and recomputes skins /
 * match points for affected weeks and matches.
 */
export async function DELETE(req: Request, { params }: Params) {
  if (!verify(req)) return unauthorized();
  const { id } = await params;
  const admin = createAdminSupabaseClient();

  const { data: row, error: fetchErr } = await admin
    .from("handicap_helper_scores")
    .select("id, player_id, played_date")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const playedDate = row.played_date as string;
  const playerId = row.player_id as string;

  const { data: weeks, error: wErr } = await admin.from("season_weeks").select("id").eq("week_date", playedDate);
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  const weekIds = (weeks ?? []).map((w) => w.id as string);
  let matchIds: string[] = [];
  let affectedWeekIds: string[] = [];

  if (weekIds.length > 0) {
    const { data: prs, error: prErr } = await admin
      .from("player_rounds")
      .select("id, match_id, week_id")
      .eq("player_id", playerId)
      .in("week_id", weekIds);

    if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });

    const toDelete = prs ?? [];
    matchIds = [...new Set(toDelete.map((p) => p.match_id as string))];
    affectedWeekIds = [...new Set(toDelete.map((p) => p.week_id as string))];
    const prIds = toDelete.map((p) => p.id as string);

    if (prIds.length > 0) {
      const { error: delPrErr } = await admin.from("player_rounds").delete().in("id", prIds);
      if (delPrErr) return NextResponse.json({ error: delPrErr.message }, { status: 500 });
    }
  }

  const { error: delHErr } = await admin.from("handicap_helper_scores").delete().eq("id", id);
  if (delHErr) return NextResponse.json({ error: delHErr.message }, { status: 500 });

  for (const wid of affectedWeekIds) {
    const { error: rpcErr } = await admin.rpc("_recompute_skins_for_week", { p_week_id: wid });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }
  for (const mid of matchIds) {
    const { error: rpcErr } = await admin.rpc("_recompute_match_points", { p_match_id: mid });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: Params) {
  if (!verify(req)) return unauthorized();
  const { id } = await params;
  const body = (await req.json()) as Partial<{
    player_id: string;
    played_date: string;
    score: number;
    par: number;
    handicap_at_submission: number | null;
  }>;

  if (body.score != null && (!Number.isFinite(body.score) || body.score < 18 || body.score > 200)) {
    return NextResponse.json({ error: "Score must be between 18 and 200." }, { status: 400 });
  }
  if (body.par != null && (!Number.isFinite(body.par) || body.par < 18 || body.par > 144)) {
    return NextResponse.json({ error: "Par must be between 18 and 144." }, { status: 400 });
  }
  if (
    body.handicap_at_submission != null &&
    (!Number.isFinite(body.handicap_at_submission) || body.handicap_at_submission < 0 || body.handicap_at_submission > 99)
  ) {
    return NextResponse.json({ error: "Handicap must be between 0 and 99." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const hhUpdate: {
    player_id?: string;
    played_date?: string;
    score?: number;
    par?: number;
  } = {};
  if (body.player_id != null) hhUpdate.player_id = body.player_id;
  if (body.played_date != null) hhUpdate.played_date = body.played_date;
  if (body.score != null) hhUpdate.score = Math.round(body.score);
  if (body.par != null) hhUpdate.par = Math.round(body.par);

  let data:
    | {
        player_id: string;
        played_date: string;
      }
    | null = null;
  if (Object.keys(hhUpdate).length > 0) {
    const { data: updated, error } = await admin
      .from("handicap_helper_scores")
      .update(hhUpdate)
      .eq("id", id)
      .select("player_id, played_date")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data = (updated as { player_id: string; played_date: string } | null) ?? null;
  } else {
    const { data: existing, error } = await admin
      .from("handicap_helper_scores")
      .select("player_id, played_date")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    data = (existing as { player_id: string; played_date: string } | null) ?? null;
  }

  if (data && body.handicap_at_submission != null) {
    const playerId = data.player_id;
    const playedDate = data.played_date;
    const { data: weekRows, error: wErr } = await admin.from("season_weeks").select("id").eq("week_date", playedDate);
    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
    const weekIds = (weekRows ?? []).map((w) => w.id as string);
    if (weekIds.length > 0) {
      const { error: prErr } = await admin
        .from("player_rounds")
        .update({ handicap_at_submission: Math.round(Number(body.handicap_at_submission)) })
        .eq("player_id", playerId)
        .in("week_id", weekIds);
      if (prErr) return NextResponse.json({ error: prErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ data });
}
