import type { ComponentProps } from "react";
import { SubmitSkinsForm } from "@/components/SubmitSkinsForm";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FormProps = ComponentProps<typeof SubmitSkinsForm>;

export default async function SubmitSkinsPage() {
  let loadError: string | null = null;
  let weeks: FormProps["weeks"] = [];
  let players: FormProps["players"] = [];

  try {
    const supabase = await createServerSupabaseClient();
    const [w, p] = await Promise.all([
      supabase.from("season_weeks").select("*").order("week_number", { ascending: true }),
      supabase.from("players").select("*").order("name"),
    ]);
    if (w.error || p.error) {
      loadError = w.error?.message ?? p.error?.message ?? "";
    } else {
      weeks = (w.data ?? []) as FormProps["weeks"];
      players = (p.data ?? []) as FormProps["players"];
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not load form — check Supabase configuration.";
  }

  if (loadError) {
    return <p className="text-red-700">{loadError}</p>;
  }

  return (
    <div className="min-w-0 space-y-6">
      <div
        className="rounded-lg border border-amber-800/30 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
        role="status"
      >
        <p className="font-semibold">Deprecated</p>
        <p className="mt-1 text-amber-950/90">
          Use the unified{" "}
          <a href="/submit-round" className="font-medium underline underline-offset-2 hover:text-amber-900">
            Submit round
          </a>{" "}
          form instead. This page remains available as a manual fallback.
        </p>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-emerald-950 sm:text-2xl">Submit Skins</h1>
        <p className="mt-1 text-sm text-zinc-600 sm:text-base">
          Skins submission for one week. One submission per week.
        </p>
      </div>
      <SubmitSkinsForm weeks={weeks} players={players} />
    </div>
  );
}
