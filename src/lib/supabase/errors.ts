/** Shown when PostgREST rejects the schema (common misconfiguration). */
export const NHGL_EXPOSED_SCHEMA_HELP =
  "Supabase only serves schemas listed for the Data API. Open your Supabase project → Project Settings → Data API (or legacy: Settings → API) → find Exposed schemas / Additional exposed schemas → add nhgl → Save. The schema can exist in Postgres and still fail until it is exposed here.";

export function messageLooksLikeInvalidSchemaError(message: string | undefined | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("invalid schema") || (m.includes("schema") && m.includes("nhgl"));
}
