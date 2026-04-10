import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isSupabaseDebugEnabled } from "@/lib/supabase/debug";
import { NHGL_EXPOSED_SCHEMA_HELP, messageLooksLikeInvalidSchemaError } from "@/lib/supabase/errors";
import { NHGL_SCHEMA } from "@/lib/nhgl";

export const dynamic = "force-dynamic";

/**
 * GET /api/debug/db — tests anon + service DB connectivity (DEBUG_SUPABASE=1 or NEXT_PUBLIC_NHGL_DEBUG=1 only).
 */
export async function GET() {
  if (!isSupabaseDebugEnabled()) {
    return NextResponse.json(
      { error: "Debug endpoint disabled. Set DEBUG_SUPABASE=1 or NEXT_PUBLIC_NHGL_DEBUG=1." },
      { status: 404 },
    );
  }

  const hints: string[] = [];

  let anon: Record<string, unknown> = { ok: false };
  try {
    const supabase = await createServerSupabaseClient();
    const { error, count } = await supabase.from("teams").select("id", { count: "exact", head: true });
    if (error) {
      anon = {
        ok: false,
        error: error.message,
        code: error.code,
        details: error.details,
      };
      if (messageLooksLikeInvalidSchemaError(error.message)) {
        hints.unshift(NHGL_EXPOSED_SCHEMA_HELP);
      } else {
        hints.push(
          "Anon query failed: check NEXT_PUBLIC_* keys, that schema `nhgl` is exposed for the Data API, and migrations are applied.",
        );
      }
    } else {
      anon = { ok: true, teamCount: count ?? 0 };
    }
  } catch (e) {
    anon = { ok: false, error: e instanceof Error ? e.message : String(e) };
    hints.push("Anon client threw — often missing env vars or invalid URL.");
  }

  let service: Record<string, unknown> = { ok: false };
  try {
    const admin = createAdminSupabaseClient();
    const { error, count } = await admin.from("teams").select("id", { count: "exact", head: true });
    if (error) {
      service = { ok: false, error: error.message, code: error.code };
      if (messageLooksLikeInvalidSchemaError(error.message)) {
        hints.unshift(NHGL_EXPOSED_SCHEMA_HELP);
      } else {
        hints.push("Service role query failed: check SUPABASE_SERVICE_ROLE_KEY on the server.");
      }
    } else {
      service = { ok: true, teamCount: count ?? 0 };
    }
  } catch (e) {
    service = { ok: false, error: e instanceof Error ? e.message : String(e) };
    hints.push("Service client threw — SUPABASE_SERVICE_ROLE_KEY missing or wrong.");
  }

  const result = {
    schema: NHGL_SCHEMA,
    anon,
    service,
    hints,
    docs: "Expose nhgl: " + NHGL_EXPOSED_SCHEMA_HELP,
  };

  return NextResponse.json(result, { status: 200 });
}
