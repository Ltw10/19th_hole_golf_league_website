import {
  NHGL_EXPOSED_SCHEMA_HELP,
  messageLooksLikeInvalidSchemaError,
} from "@/lib/supabase/errors";

type Props = {
  errorMessage: string | undefined | null;
};

/**
 * Call out the usual fix when PostgREST returns "invalid schema: nhgl".
 */
export function SupabaseConnectionHelp({ errorMessage }: Props) {
  if (!errorMessage || !messageLooksLikeInvalidSchemaError(errorMessage)) return null;
  return (
    <aside
      className="mt-4 rounded-lg border border-amber-600/40 bg-amber-50 p-4 text-sm text-amber-950"
      role="alert"
    >
      <p className="font-semibold">Database API can’t use the nhgl schema yet</p>
      <p className="mt-2 leading-relaxed">{NHGL_EXPOSED_SCHEMA_HELP}</p>
      <p className="mt-2 font-mono text-xs opacity-90">API error: {errorMessage}</p>
    </aside>
  );
}
