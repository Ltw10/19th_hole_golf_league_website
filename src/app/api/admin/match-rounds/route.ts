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

type HolePayload = { hole_number: number; strokes: number };
type RoundPayload = {
  player_round_id: string;
  played_skins: boolean;
  holes: HolePayload[];
};

function validateHoles(whichNine: string | null, holes: HolePayload[]): string | null {
  const side = (whichNine ?? "front").toLowerCase() === "back" ? "back" : "front";
  const allowed = side === "back" ? [...Array(9)].map((_, i) => i + 10) : [...Array(9)].map((_, i) => i + 1);
  const allowedSet = new Set(allowed);
  const seen = new Set<number>();
  for (const h of holes) {
    const hn = Number(h.hole_number);
    const st = Number(h.strokes);
    if (!Number.isInteger(hn) || !Number.isInteger(st)) return "Hole numbers and strokes must be whole numbers.";
    if (seen.has(hn)) return `Duplicate hole ${hn}.`;
    seen.add(hn);
    if (!allowedSet.has(hn)) return `Hole ${hn} is not on the ${side} nine for this round.`;
    if (st < 1 || st > 20) return "Strokes must be between 1 and 20.";
  }
  if (seen.size !== 9) return "Each player needs exactly nine hole scores for the nine played.";
  return null;
}

/** Update hole-by-hole scores and skins opt-in for players in a match, then recompute skins + match points. */
export async function PATCH(req: Request) {
  if (!verify(req)) return unauthorized();

  let body: { match_id?: string; week_id?: string; rounds?: RoundPayload[] };
  try {
    body = (await req.json()) as { match_id?: string; week_id?: string; rounds?: RoundPayload[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = body.match_id?.trim();
  const weekId = body.week_id?.trim();
  const rounds = body.rounds;
  if (!matchId || !weekId) {
    return NextResponse.json({ error: "match_id and week_id are required." }, { status: 400 });
  }
  if (!Array.isArray(rounds) || rounds.length === 0) {
    return NextResponse.json({ error: "rounds must be a non-empty array." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const roundIds = rounds.map((r) => r.player_round_id).filter(Boolean);
  if (roundIds.length !== rounds.length) {
    return NextResponse.json({ error: "Each round needs player_round_id." }, { status: 400 });
  }

  const { data: existing, error: exErr } = await admin
    .from("player_rounds")
    .select("id, match_id, week_id, which_nine")
    .in("id", roundIds);

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  const rows = existing ?? [];
  if (rows.length !== roundIds.length) {
    return NextResponse.json({ error: "One or more player rounds were not found." }, { status: 400 });
  }
  for (const row of rows) {
    if ((row.match_id as string) !== matchId || (row.week_id as string) !== weekId) {
      return NextResponse.json({ error: "Round does not belong to this match/week." }, { status: 400 });
    }
  }

  const whichById = new Map(rows.map((r) => [r.id as string, (r.which_nine as string | null) ?? "front"]));

  for (const round of rounds) {
    const which = whichById.get(round.player_round_id) ?? "front";
    const holeErr = validateHoles(which, round.holes ?? []);
    if (holeErr) return NextResponse.json({ error: holeErr }, { status: 400 });
  }

  for (const round of rounds) {
    const { error: upErr } = await admin
      .from("player_rounds")
      .update({ played_skins: Boolean(round.played_skins) })
      .eq("id", round.player_round_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { error: delErr } = await admin.from("player_hole_scores").delete().eq("player_round_id", round.player_round_id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    const inserts = (round.holes ?? []).map((h) => ({
      player_round_id: round.player_round_id,
      hole_number: h.hole_number,
      strokes: h.strokes,
    }));
    const { error: insErr } = await admin.from("player_hole_scores").insert(inserts);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { error: skinsErr } = await admin.rpc("_recompute_skins_for_week", { p_week_id: weekId });
  if (skinsErr) return NextResponse.json({ error: skinsErr.message }, { status: 500 });

  const { error: matchErr } = await admin.rpc("_recompute_match_points", { p_match_id: matchId });
  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
