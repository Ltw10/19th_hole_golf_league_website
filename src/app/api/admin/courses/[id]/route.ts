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

export async function GET(req: Request, { params }: Params) {
  if (!verify(req)) return unauthorized();
  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const [{ data: course, error: cErr }, { data: holes, error: hErr }] = await Promise.all([
    admin.from("courses").select("*").eq("id", id).maybeSingle(),
    admin
      .from("course_holes")
      .select("hole_number, par, stroke_index")
      .eq("course_id", id)
      .order("hole_number", { ascending: true }),
  ]);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ course, holes: holes ?? [] });
}
