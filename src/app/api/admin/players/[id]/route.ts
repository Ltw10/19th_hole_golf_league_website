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
  let body: { name?: string };
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (name.length > 200) return NextResponse.json({ error: "Name is too long." }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("players").update({ name }).eq("id", id).select("id, name").maybeSingle();

  if (error) {
    const msg = error.message ?? "Update failed";
    if (msg.includes("unique") || msg.includes("duplicate") || error.code === "23505") {
      return NextResponse.json(
        { error: "That name is already used by another player. Choose a different name." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Player not found." }, { status: 404 });
  return NextResponse.json({ data });
}
