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

export async function GET(req: Request) {
  if (!verify(req)) return unauthorized();
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.from("league_settings").select("*").order("key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function PUT(req: Request) {
  if (!verify(req)) return unauthorized();
  let body: { skins_buyin_amount?: string | number };
  try {
    body = (await req.json()) as { skins_buyin_amount?: string | number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.skins_buyin_amount;
  if (raw === undefined) {
    return NextResponse.json({ error: "skins_buyin_amount is required" }, { status: 400 });
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    return NextResponse.json({ error: "Invalid skins_buyin_amount" }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("league_settings").upsert(
    {
      key: "skins_buyin_amount",
      value: String(n),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
