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
  let teamAId: string | undefined;
  let teamBId: string | undefined;
  try {
    const body = (await req.json()) as { team_a_id?: unknown; team_b_id?: unknown };
    teamAId = typeof body.team_a_id === "string" ? body.team_a_id : undefined;
    teamBId = typeof body.team_b_id === "string" ? body.team_b_id : undefined;
  } catch {
    // Allow empty body for fallback auto-top-2 behavior.
  }
  const result = await refreshChampionshipMatchup(teamAId, teamBId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
