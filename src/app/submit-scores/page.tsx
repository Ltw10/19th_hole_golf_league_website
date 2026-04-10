import type { ComponentProps } from "react";
import { SubmitScoreForm } from "@/components/SubmitScoreForm";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FormProps = ComponentProps<typeof SubmitScoreForm>;

export default async function SubmitScoresPage(props: PageProps<"/submit-scores">) {
  const searchParams = await props.searchParams;
  const matchParam = searchParams.match;
  const matchIdFromUrl = typeof matchParam === "string" ? matchParam : "";
  let loadError: string | null = null;
  let weeks: FormProps["weeks"] = [];
  let matches: FormProps["matches"] = [];
  let teams: FormProps["teams"] = [];
  let players: FormProps["players"] = [];

  try {
    const supabase = await createServerSupabaseClient();
    const [w, m, t, p] = await Promise.all([
      supabase.from("season_weeks").select("*").order("week_number", { ascending: true }),
      supabase.from("matches").select("*"),
      supabase.from("teams").select("*").order("name"),
      supabase.from("players").select("*").order("name"),
    ]);
    if (w.error || m.error || t.error || p.error) {
      loadError = w.error?.message ?? m.error?.message ?? t.error?.message ?? p.error?.message ?? "";
    } else {
      weeks = (w.data ?? []) as FormProps["weeks"];
      matches = (m.data ?? []) as FormProps["matches"];
      teams = (t.data ?? []) as FormProps["teams"];
      players = (p.data ?? []) as FormProps["players"];
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not load form — check Supabase configuration.";
  }

  if (loadError) {
    return <p className="text-red-700">{loadError}</p>;
  }

  let initialWeekId: string | undefined;
  let initialMatchId: string | undefined;
  if (matchIdFromUrl) {
    const match = matches.find((m) => m.id === matchIdFromUrl);
    const week = match ? weeks.find((w) => w.id === match.week_id) : undefined;
    if (
      match?.team_a_id &&
      match.team_b_id &&
      week &&
      week.phase !== "handicap"
    ) {
      initialWeekId = week.id;
      initialMatchId = match.id;
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-emerald-950 sm:text-2xl">Submit scores</h1>
        <p className="mt-1 text-sm text-zinc-600 sm:text-base">
          Enter the 10-point split for a match and optionally upload a scorecard photo. One submission
          per match; duplicates require an admin.
        </p>
      </div>
      <SubmitScoreForm
        weeks={weeks}
        matches={matches}
        teams={teams}
        players={players}
        initialWeekId={initialWeekId}
        initialMatchId={initialMatchId}
      />
    </div>
  );
}
