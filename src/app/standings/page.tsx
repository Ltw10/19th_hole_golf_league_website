import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TeamRow = { team_name: string; regular_season_points: number };
type SkinRow = {
  player_name: string;
  skins_won: number;
  money_won: number;
  net_money: number;
};

export default async function StandingsPage() {
  let loadError: string | null = null;
  let teamRows: TeamRow[] = [];
  let skinRows: SkinRow[] = [];
  let skinWarning: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();

    const [{ data: teams, error: tErr }, { data: skins, error: sErr }] = await Promise.all([
      supabase
        .from("v_regular_season_team_points")
        .select("*")
        .order("regular_season_points", { ascending: false })
        .order("team_name", { ascending: true }),
      supabase
        .from("v_skins_player_stats")
        .select("*")
        .order("skins_won", { ascending: false })
        .order("money_won", { ascending: false }),
    ]);

    if (tErr) loadError = tErr.message;
    else {
      teamRows = (teams ?? []) as TeamRow[];
      skinRows = (skins ?? []) as SkinRow[];
      if (sErr) skinWarning = sErr.message;
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Configure Supabase to load standings.";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-950">Standings</h1>
        <p className="mt-1 text-zinc-600">
          Team leaderboard uses regular-season match scores. Championship uses the top two teams by
          those points.
        </p>
      </div>

      {loadError && <p className="text-red-700">{loadError}</p>}

      {!loadError && (
        <>
          <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-900/80">
                Regular season — team points
              </h2>
              <div className="overflow-hidden rounded-lg border border-emerald-900/10 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-emerald-950/90 text-emerald-50">
                    <tr>
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Team</th>
                      <th className="px-3 py-2 font-medium text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamRows.map((row, i) => (
                      <tr key={row.team_name} className="border-t border-zinc-100">
                        <td className="px-3 py-2 text-zinc-500">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{row.team_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(row.regular_season_points).toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-900/80">
                Skins
              </h2>
              <p className="text-xs text-zinc-500">
                Holes won, money from payouts, buy-ins, and net (payouts minus buy-ins).
              </p>
              <div className="overflow-hidden rounded-lg border border-emerald-900/10 bg-white shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-emerald-950/90 text-emerald-50">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Player</th>
                      <th className="px-2 py-1.5 font-medium text-right">Skins</th>
                      <th className="px-2 py-1.5 font-medium text-right">$ won</th>
                      <th className="px-2 py-1.5 font-medium text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skinRows.map((row) => (
                      <tr key={row.player_name} className="border-t border-zinc-100">
                        <td className="px-2 py-1.5">{row.player_name}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{row.skins_won}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {formatMoney(row.money_won)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">
                          {formatMoney(row.net_money)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </aside>
          </div>
          {skinWarning && (
            <p className="text-amber-800">Skins leaderboard unavailable: {skinWarning}</p>
          )}
        </>
      )}
    </div>
  );
}

function formatMoney(n: number) {
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return v.toFixed(2);
}
