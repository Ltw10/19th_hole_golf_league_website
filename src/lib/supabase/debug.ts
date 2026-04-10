/**
 * Opt-in diagnostics (`/api/debug/db`, etc.). Set DEBUG_SUPABASE=1 or NEXT_PUBLIC_NHGL_DEBUG=1.
 * Not enabled automatically in development.
 */
export function isSupabaseDebugEnabled(): boolean {
  if (process.env.DEBUG_SUPABASE === "1") return true;
  if (process.env.NEXT_PUBLIC_NHGL_DEBUG === "1") return true;
  return false;
}
