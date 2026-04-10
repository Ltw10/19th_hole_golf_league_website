import { NextResponse } from "next/server";
import { refreshChampionshipMatchup } from "@/lib/championship";

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

export async function POST(req: Request) {
  if (!verify(req)) return unauthorized();
  const result = await refreshChampionshipMatchup();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
