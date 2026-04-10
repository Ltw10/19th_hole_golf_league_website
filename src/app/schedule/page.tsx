import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Team = { id: string; name: string };
type Week = {
  id: string;
  week_number: number;
  week_date: string;
  phase: string;
};
type Match = {
  id: string;
  week_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
};

export default async function SchedulePage() {
  let loadError: string | null = null;
  let weeks: Week[] = [];
  let matches: Match[] = [];
  let teams: Team[] = [];

  try {
    const supabase = await createServerSupabaseClient();

    const [{ data: w, error: wErr }, { data: m, error: mErr }, { data: t, error: tErr }] =
      await Promise.all([
        supabase.from("season_weeks").select("*").order("week_number", { ascending: true }),
        supabase.from("matches").select("*"),
        supabase.from("teams").select("*"),
      ]);

    if (wErr || mErr || tErr) {
      loadError = wErr?.message ?? mErr?.message ?? tErr?.message ?? "Unknown error";
    } else {
      weeks = (w ?? []) as Week[];
      matches = (m ?? []) as Match[];
      teams = (t ?? []) as Team[];
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Configure Supabase environment variables to load data.";
  }

  const teamMap = new Map(teams.map((x) => [x.id, x.name]));
  const byWeek = new Map<string, Match[]>();
  for (const m of matches) {
    const list = byWeek.get(m.week_id) ?? [];
    list.push(m);
    byWeek.set(m.week_id, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-950">Schedule</h1>
        <p className="mt-1 text-zinc-600">Every Tuesday at 6:00 PM.</p>
      </div>

      {loadError && <p className="text-red-700">{loadError}</p>}

      {!loadError && (
        <ul className="space-y-8">
          {weeks.map((w) => {
            const ms = byWeek.get(w.id) ?? [];
            return (
              <li key={w.id} className="rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-2">
                  <h2 className="text-lg font-semibold text-emerald-950">
                    Week {w.week_number} — {w.phase}
                  </h2>
                  <time dateTime={w.week_date} className="text-sm text-zinc-600">
                    {formatDate(w.week_date)} · 6:00 PM
                  </time>
                </div>
                {ms.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-500">
                    {w.phase === "handicap"
                      ? "Handicap weeks — matchups follow regular season scheduling."
                      : "No matches listed."}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {ms.map((m) => (
                      <li key={m.id} className="text-sm">
                        <span className="font-medium">
                          {formatMatchup(m.team_a_id, m.team_b_id, teamMap)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatMatchup(
  teamAId: string | null,
  teamBId: string | null,
  teamMap: Map<string, string>,
) {
  if (!teamAId && !teamBId) return "- vs -";
  const a = teamAId ? teamMap.get(teamAId) ?? "—" : "—";
  const b = teamBId ? teamMap.get(teamBId) ?? "—" : "—";
  return `${a} vs ${b}`;
}
