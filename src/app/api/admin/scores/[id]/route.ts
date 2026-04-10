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
    team_a_points: number;
    team_b_points: number;
    notes: string | null;
    scorecard_image_url: string | null;
    submitter_label: string | null;
  }>;

  if (
    body.team_a_points != null &&
    body.team_b_points != null &&
    body.team_a_points + body.team_b_points !== 10
  ) {
    return NextResponse.json({ error: "Points must sum to 10." }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("score_submissions")
    .update({
      ...body,
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: Request, { params }: Params) {
  if (!verify(req)) return unauthorized();
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("score_submissions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
