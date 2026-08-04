import { HandicapHelperClient, type HandicapSummaryRow } from "@/components/HandicapHelperClient";
import { SupabaseConnectionHelp } from "@/components/SupabaseConnectionHelp";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Handicap helper",
};

type PlayerRow = { id: string; name: string };

export default async function HandicapHelperPage() {
  let loadError: string | null = null;
  let summary: HandicapSummaryRow[] = [];
  let players: { id: string; name: string }[] = [];

  try {
    const supabase = await createServerSupabaseClient();
    const [sumRes, playersRes] = await Promise.all([
      supabase
        .from("v_handicap_helper_summary")
        .select("*")
        .order("handicap", { ascending: true })
        .order("player_name", { ascending: true }),
      supabase.from("players").select("id, name").order("name", { ascending: true }),
    ]);

    if (sumRes.error) loadError = sumRes.error.message;
    else summary = (sumRes.data ?? []) as HandicapSummaryRow[];

    if (playersRes.error) {
      loadError = loadError ?? playersRes.error.message;
    } else {
      players = ((playersRes.data ?? []) as PlayerRow[]).map((p) => ({ id: p.id, name: p.name }));
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not load handicap helper — check Supabase configuration.";
  }

  if (loadError) {
    return (
      <div className="min-w-0 space-y-4">
        <p className="text-red-700">{loadError}</p>
        <SupabaseConnectionHelp errorMessage={loadError} />
      </div>
    );
  }

  return <HandicapHelperClient initialSummary={summary} players={players} />;
}
