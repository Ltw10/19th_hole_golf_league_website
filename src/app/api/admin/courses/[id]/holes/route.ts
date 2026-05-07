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

type HoleRow = { hole_number: number; par: number; stroke_index: number };

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  if (!verify(req)) return unauthorized();
  const { id: courseId } = await params;
  if (!courseId) return NextResponse.json({ error: "Missing course id" }, { status: 400 });

  let body: { holes?: HoleRow[] };
  try {
    body = (await req.json()) as { holes?: HoleRow[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const holes = body.holes;
  if (!Array.isArray(holes) || holes.length === 0) {
    return NextResponse.json({ error: "holes array required" }, { status: 400 });
  }

  const sis = new Set<number>();
  const hns = new Set<number>();
  for (const h of holes) {
    const hn = Number(h.hole_number);
    const par = Number(h.par);
    const si = Number(h.stroke_index);
    if (!Number.isFinite(hn) || hn < 1 || hn > 18) {
      return NextResponse.json({ error: "Invalid hole_number" }, { status: 400 });
    }
    if (!Number.isFinite(par) || par < 3 || par > 6) {
      return NextResponse.json({ error: "Invalid par" }, { status: 400 });
    }
    if (!Number.isFinite(si) || si < 1 || si > 18) {
      return NextResponse.json({ error: "Invalid stroke_index" }, { status: 400 });
    }
    if (hns.has(hn)) return NextResponse.json({ error: "Duplicate hole_number" }, { status: 400 });
    if (sis.has(si)) return NextResponse.json({ error: "Duplicate stroke_index" }, { status: 400 });
    hns.add(hn);
    sis.add(si);
  }

  const admin = createAdminSupabaseClient();

  const { error: delErr } = await admin.from("course_holes").delete().eq("course_id", courseId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const rows = holes.map((h) => ({
    course_id: courseId,
    hole_number: Number(h.hole_number),
    par: Number(h.par),
    stroke_index: Number(h.stroke_index),
  }));

  const { error: insErr } = await admin.from("course_holes").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
