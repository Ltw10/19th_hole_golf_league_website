import { SupabaseConnectionHelp } from "@/components/SupabaseConnectionHelp";
import { filterTeamStandingsRows } from "@/lib/nhgl";
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
      teamRows = filterTeamStandingsRows((teams ?? []) as TeamRow[]);
      skinRows = (skins ?? []) as SkinRow[];
      if (sErr) skinWarning = sErr.message;
    }
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Configure Supabase to load standings.";
  }

  const scorecardShell =
    "overflow-hidden rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]";

  return (
    <div className="min-w-0 space-y-6">
      <div className="rounded-sm border-2 border-emerald-900/30 bg-[#f4f1e8] px-4 py-3 shadow-[3px_4px_0_0_rgba(6,60,45,0.12)]">
        <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-emerald-900/70">
          Leaderboard
        </p>
        <h1 className="mt-1 text-center text-2xl font-bold tracking-tight text-emerald-950">Standings</h1>
        <p className="mt-1 text-center text-sm text-emerald-900/75">
          Championship takes the top two teams.
        </p>
      </div>

      {loadError && (
        <>
          <p className="text-red-700">{loadError}</p>
          <SupabaseConnectionHelp errorMessage={loadError} />
        </>
      )}

      {!loadError && (
        <>
          <div className="grid min-w-0 gap-8 lg:grid-cols-[1fr_min(100%,320px)]">
            <section className="space-y-2">
              <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-900/70">
                Regular season — team points
              </h2>
              <div className={scorecardShell}>
                <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2 text-center">
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-emerald-900/65">
                    Points standing
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
                        <th
                          scope="col"
                          className="w-10 border-r border-emerald-700/50 px-2 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider"
                        >
                          #
                        </th>
                        <th
                          scope="col"
                          className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider"
                        >
                          Team
                        </th>
                        <th scope="col" className="w-24 px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">
                          Pts
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamRows.map((row, i) => (
                        <tr
                          key={row.team_name}
                          className={`border-b border-emerald-900/15 last:border-b-0 ${
                            i % 2 === 1 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"
                          }`}
                        >
                          <td className="border-r border-emerald-900/15 px-2 py-2 text-center font-mono text-sm tabular-nums text-emerald-800/90">
                            {i + 1}
                          </td>
                          <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">
                            {row.team_name}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums text-emerald-950">
                            {Number(row.regular_season_points).toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <aside className="space-y-2">
              <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-900/70">Skins</h2>
              <p className="text-xs text-emerald-900/60">
                Holes won, payouts, buy-ins, net.
              </p>
              <div className={scorecardShell}>
                <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2 text-center">
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-emerald-900/65">
                    Skins ledger
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
                        <th
                          scope="col"
                          className="border-r border-emerald-700/50 px-2 py-2 text-left text-[0.6rem] font-bold uppercase tracking-wider"
                        >
                          Player
                        </th>
                        <th
                          scope="col"
                          className="w-11 border-r border-emerald-700/50 px-1 py-2 text-center text-[0.6rem] font-bold uppercase tracking-wider"
                        >
                          Won
                        </th>
                        <th
                          scope="col"
                          className="w-14 border-r border-emerald-700/50 px-1 py-2 text-right text-[0.6rem] font-bold uppercase tracking-wider"
                        >
                          $ won
                        </th>
                        <th scope="col" className="w-14 px-1 py-2 text-right text-[0.6rem] font-bold uppercase tracking-wider">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {skinRows.map((row, i) => (
                        <tr
                          key={row.player_name}
                          className={`border-b border-emerald-900/15 last:border-b-0 ${
                            i % 2 === 1 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"
                          }`}
                        >
                          <td className="border-r border-emerald-900/15 px-2 py-1.5 font-medium text-emerald-950">
                            {row.player_name}
                          </td>
                          <td className="border-r border-emerald-900/15 px-1 py-1.5 text-center font-mono tabular-nums text-emerald-900">
                            {row.skins_won}
                          </td>
                          <td className="border-r border-emerald-900/15 px-1 py-1.5 text-right font-mono tabular-nums text-emerald-900">
                            {formatMoney(row.money_won)}
                          </td>
                          <td className="px-1 py-1.5 text-right font-mono tabular-nums text-emerald-950">
                            {formatMoney(row.net_money)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </aside>
          </div>
          {skinWarning && (
            <>
              <p className="text-amber-800">Skins leaderboard unavailable: {skinWarning}</p>
              <SupabaseConnectionHelp errorMessage={skinWarning} />
            </>
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
