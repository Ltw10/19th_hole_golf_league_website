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

/**
 * Remove all score submissions for a week and the full skins bundle (hole wins, buy-ins, payouts,
 * week result row) for testing / redo.
 */
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

  const { error: e1 } = await admin.from("score_submissions").delete().eq("week_id", weekId);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const { error: e2 } = await admin.from("skins_hole_wins").delete().eq("week_id", weekId);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const { error: e3 } = await admin.from("skins_buyins").delete().eq("week_id", weekId);
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });

  const { error: e4 } = await admin.from("skins_week_payouts").delete().eq("week_id", weekId);
  if (e4) return NextResponse.json({ error: e4.message }, { status: 500 });

  const { error: e5 } = await admin.from("skins_week_results").delete().eq("week_id", weekId);
  if (e5) return NextResponse.json({ error: e5.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
