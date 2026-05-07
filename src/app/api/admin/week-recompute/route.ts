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

/** Recompute skins + score rows for one week using current saved handicap snapshots. */
export async function POST(req: Request) {
  if (!verify(req)) return unauthorized();
  let body: { week_id?: string };
  try {
    body = (await req.json()) as { week_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const weekId = body.week_id?.trim();
  if (!weekId) return NextResponse.json({ error: "week_id is required" }, { status: 400 });

  const admin = createAdminSupabaseClient();

  const { data: matches, error: mErr } = await admin.from("matches").select("id").eq("week_id", weekId);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const { error: skinsErr } = await admin.rpc("_recompute_skins_for_week", { p_week_id: weekId });
  if (skinsErr) return NextResponse.json({ error: skinsErr.message }, { status: 500 });

  for (const m of matches ?? []) {
    const matchId = m.id as string;
    const { error: scoreErr } = await admin.rpc("_recompute_match_points", { p_match_id: matchId });
    if (scoreErr) return NextResponse.json({ error: scoreErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, recomputed_matches: (matches ?? []).length });
}
