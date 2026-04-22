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

export async function PATCH(req: Request, { params }: Params) {
  if (!verify(req)) return unauthorized();
  const { id } = await params;
  const body = (await req.json()) as Partial<{
    player_id: string;
    played_date: string;
    score: number;
    par: number;
  }>;

  if (body.score != null && (!Number.isFinite(body.score) || body.score < 18 || body.score > 200)) {
    return NextResponse.json({ error: "Score must be between 18 and 200." }, { status: 400 });
  }
  if (body.par != null && (!Number.isFinite(body.par) || body.par < 18 || body.par > 144)) {
    return NextResponse.json({ error: "Par must be between 18 and 144." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("handicap_helper_scores")
    .update({
      ...body,
      score: body.score != null ? Math.round(body.score) : undefined,
      par: body.par != null ? Math.round(body.par) : undefined,
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
