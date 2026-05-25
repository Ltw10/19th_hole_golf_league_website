import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackToScheduleButton } from "@/components/BackToScheduleButton";
import { SkinsRulesNote } from "@/components/SkinsRulesNote";
import { formatSeasonPhase } from "@/lib/nhgl";
import { effectiveHandicapForRound, strokesReceivedOnHole, type CourseHole } from "@/lib/scoring";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RoundRow = {
  id: string;
  player_id: string;
  played_for_team_id: string;
  which_nine: "front" | "back" | null;
  handicap_at_submission: number | null;
  match_id: string;
  subbing_for_player_id: string | null;
};

type HandicapScoreRow = {
  player_id: string;
  played_date: string;
  score: number;
  par: number;
  created_at: string | null;
};

type CourseHoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

type HoleScoreRow = {
  player_round_id: string;
  hole_number: number;
  strokes: number;
};

type MatchRow = {
  id: string;
  team_a_id: string | null;
  team_b_id: string | null;
};

type SkinAgg = {
  player_id: string;
  player_name: string;
  holes: number[];
  amount_won: number;
};

function displayNameSortKey(r: RoundRow, playerName: Map<string, string>): string {
  const sub = playerName.get(r.player_id) ?? "";
  if (r.subbing_for_player_id) {
    const forName = playerName.get(r.subbing_for_player_id) ?? "";
    return `${sub}\0${forName}`;
  }
  return sub;
}

/** All skins players for a week: handicaps, gross and net per hole (same stroke logic as the match virtual scorecard). */
export default async function SkinsWeekScorecardPage(props: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await props.params;
  const supabase = await createServerSupabaseClient();

  const { data: weekRow, error: weekErr } = await supabase
    .from("season_weeks")
    .select("id, week_number, week_date, phase")
    .eq("id", weekId)
    .maybeSingle();
  if (weekErr) return <p className="text-red-700">{weekErr.message}</p>;
  if (!weekRow) notFound();

  const weekDate = weekRow.week_date as string;
  const weekTitle = `Week ${weekRow.week_number} — ${formatSeasonPhase(String(weekRow.phase))} (${weekDate})`;

  const [
    { data: rounds, error: rErr },
    { data: holeWinsWeek, error: hwErr },
    { data: skinPayoutsWeek, error: pyErr },
    { data: skinBuyinsWeek, error: biErr },
    { data: settingsRows, error: setErr },
  ] = await Promise.all([
    supabase
      .from("player_rounds")
      .select("id, player_id, played_for_team_id, which_nine, handicap_at_submission, match_id, subbing_for_player_id")
      .eq("week_id", weekId)
      .eq("played_skins", true),
    supabase.from("skins_hole_wins").select("player_id, hole").eq("week_id", weekId),
    supabase.from("skins_week_payouts").select("player_id, amount_won").eq("week_id", weekId),
    supabase.from("skins_buyins").select("player_id").eq("week_id", weekId),
    supabase.from("league_settings").select("key, value"),
  ]);
  if (rErr) return <p className="text-red-700">{rErr.message}</p>;
  if (hwErr) return <p className="text-red-700">{hwErr.message}</p>;
  if (pyErr) return <p className="text-red-700">{pyErr.message}</p>;
  if (biErr) return <p className="text-red-700">{biErr.message}</p>;
  if (setErr) return <p className="text-red-700">{setErr.message}</p>;
  const roundRows = (rounds ?? []) as RoundRow[];

  if (roundRows.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <BackToScheduleButton />
        <div className="rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]">
          <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2">
            <h1 className="text-lg font-semibold text-emerald-950">Skins week scorecard</h1>
            <p className="text-xs text-emerald-900/75">{weekTitle}</p>
          </div>
          <p className="px-4 py-8 text-center text-sm text-emerald-900/75">
            No skins rounds are on file for this week yet.
          </p>
        </div>
      </div>
    );
  }

  let skinsBuyinAmount = 5;
  for (const row of settingsRows ?? []) {
    if (row.key === "skins_buyin_amount") {
      const n = Number(String(row.value).replace(/,/g, ""));
      if (Number.isFinite(n)) skinsBuyinAmount = n;
    }
  }

  const playerIds = [
    ...new Set([
      ...roundRows.flatMap((r) =>
        r.subbing_for_player_id ? [r.player_id, r.subbing_for_player_id] : [r.player_id],
      ),
      ...(holeWinsWeek ?? []).map((h) => String((h as { player_id: string }).player_id)),
      ...(skinPayoutsWeek ?? []).map((p) => String((p as { player_id: string }).player_id)),
      ...(skinBuyinsWeek ?? []).map((b) => String((b as { player_id: string }).player_id)),
    ]),
  ];
  const matchIds = [...new Set(roundRows.map((r) => r.match_id))];

  const holesByPlayer = new Map<string, number[]>();
  for (const row of holeWinsWeek ?? []) {
    const pid = String((row as { player_id: string }).player_id);
    const hole = Number((row as { hole: number }).hole);
    const arr = holesByPlayer.get(pid) ?? [];
    arr.push(hole);
    holesByPlayer.set(pid, arr);
  }
  const payoutByPlayer = new Map<string, number>();
  for (const row of skinPayoutsWeek ?? []) {
    const pid = String((row as { player_id: string }).player_id);
    const amt = Number((row as { amount_won: number }).amount_won);
    payoutByPlayer.set(pid, (payoutByPlayer.get(pid) ?? 0) + (Number.isFinite(amt) ? amt : 0));
  }
  const skinRows: SkinAgg[] = [];
  for (const [pid, holeList] of holesByPlayer) {
    holeList.sort((a, b) => a - b);
    skinRows.push({
      player_id: pid,
      player_name: "?", // filled after playerName map
      holes: holeList,
      amount_won: payoutByPlayer.get(pid) ?? 0,
    });
  }
  const skinsPot = skinsBuyinAmount * (skinBuyinsWeek ?? []).length;
  const skinsBuyerCount = (skinBuyinsWeek ?? []).length;

  const [{ data: players }, { data: teams }, { data: matches }, { data: courseAllRows }, { data: hhRows }] =
    await Promise.all([
      supabase.from("players").select("id, name").in("id", playerIds),
      supabase.from("teams").select("id, name"),
      matchIds.length > 0
        ? supabase.from("matches").select("id, team_a_id, team_b_id").in("id", matchIds)
        : Promise.resolve({ data: [] as MatchRow[], error: null }),
      supabase
        .from("course_holes")
        .select("hole_number, par, stroke_index")
        .gte("hole_number", 1)
        .lte("hole_number", 18)
        .order("hole_number", { ascending: true }),
      supabase
        .from("handicap_helper_scores")
        .select("player_id, played_date, score, par, created_at")
        .in("player_id", playerIds)
        .order("played_date", { ascending: false }),
    ]);

  const playerName = new Map((players ?? []).map((p) => [String(p.id), String(p.name)]));
  for (const row of skinRows) {
    row.player_name = playerName.get(row.player_id) ?? "?";
  }
  skinRows.sort((a, b) => {
    if (b.holes.length !== a.holes.length) return b.holes.length - a.holes.length;
    if (b.amount_won !== a.amount_won) return b.amount_won - a.amount_won;
    return a.player_name.localeCompare(b.player_name);
  });
  const skinWonHolesByPlayer = new Map<string, Set<number>>();
  for (const [pid, holeList] of holesByPlayer) {
    skinWonHolesByPlayer.set(pid, new Set(holeList));
  }

  const teamName = new Map((teams ?? []).map((t) => [String(t.id), String(t.name)]));
  const matchById = new Map((matches ?? []).map((m) => [String((m as MatchRow).id), m as MatchRow]));

  const distinctNines = [...new Set(roundRows.map((r) => r.which_nine ?? "front"))];
  const whichNine = (distinctNines[0] ?? "front") as "front" | "back";
  const holes = whichNine === "back" ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const allCourseList = (courseAllRows ?? []) as CourseHoleRow[];
  const courseHoles: CourseHole[] = holes
    .map((h) => allCourseList.find((c) => c.hole_number === h))
    .filter((c): c is CourseHoleRow => Boolean(c))
    .map((c) => ({ hole_number: c.hole_number, par: c.par, stroke_index: c.stroke_index }));

  const parsByHole = new Map(courseHoles.map((h) => [h.hole_number, h.par]));
  const strokeIndexByHole = new Map(courseHoles.map((h) => [h.hole_number, h.stroke_index]));
  const parTotal = holes.reduce((sum, h) => sum + (parsByHole.get(h) ?? 0), 0);

  const hhByPlayer: Record<string, HandicapScoreRow[]> = {};
  for (const row of (hhRows ?? []) as HandicapScoreRow[]) {
    const pid = String(row.player_id);
    const list = hhByPlayer[pid] ?? [];
    list.push(row);
    hhByPlayer[pid] = list;
  }

  const roundIds = roundRows.map((r) => r.id);
  const { data: holeScores, error: hsErr } = await supabase
    .from("player_hole_scores")
    .select("player_round_id, hole_number, strokes")
    .in("player_round_id", roundIds);
  if (hsErr) return <p className="text-red-700">{hsErr.message}</p>;

  const strokesByRoundHole = new Map<string, number>();
  for (const hs of (holeScores ?? []) as HoleScoreRow[]) {
    strokesByRoundHole.set(`${hs.player_round_id}:${hs.hole_number}`, hs.strokes);
  }

  const handicapByRoundId = new Map<string, number>();
  for (const r of roundRows) {
    const rows = hhByPlayer[r.player_id] ?? [];
    handicapByRoundId.set(
      r.id,
      effectiveHandicapForRound(
        r.handicap_at_submission,
        rows.map((x) => ({
          played_date: x.played_date,
          score: Number(x.score),
          par: Number(x.par),
          created_at: x.created_at ?? undefined,
        })),
        weekDate || undefined,
      ),
    );
  }

  const dotsByRoundHole = new Map<string, number>();
  for (const r of roundRows) {
    const hcap = handicapByRoundId.get(r.id) ?? 0;
    for (const hole of holes) {
      const dots = strokesReceivedOnHole(courseHoles, hcap, hole);
      dotsByRoundHole.set(`${r.id}:${hole}`, dots);
    }
  }

  const grossTotalForRound = (rid: string) =>
    holes.reduce((sum, h) => sum + (strokesByRoundHole.get(`${rid}:${h}`) ?? 0), 0);

  const sortedRounds = [...roundRows].sort((a, b) => {
    const ga = grossTotalForRound(a.id);
    const gb = grossTotalForRound(b.id);
    if (ga !== gb) return ga - gb;
    return displayNameSortKey(a, playerName).localeCompare(displayNameSortKey(b, playerName));
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <BackToScheduleButton />

      <div className="rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]">
        <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2">
          <h1 className="text-lg font-semibold text-emerald-950">Skins week scorecard</h1>
          <p className="text-xs text-emerald-900/75">{weekTitle}</p>
          <p className="mt-1 text-xs text-emerald-900/70">Everyone listed bought into skins for this week.</p>
          <div className="px-3 pb-3">
            <SkinsRulesNote />
          </div>
        </div>

        {skinRows.length > 0 ? (
          <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2 text-center">
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-emerald-900/65">
              Skins · Week {weekRow.week_number}
            </span>
          </div>
        ) : null}
        {skinRows.length > 0 ? (
          <div className="border-b border-emerald-900/15 px-3 py-2 text-xs text-emerald-900/80">
            Pot:{" "}
            <span className="font-mono font-semibold tabular-nums">${skinsPot.toFixed(2)}</span>{" "}
            <span className="text-emerald-800/60">
              (${skinsBuyinAmount.toFixed(2)} × buyers) · Players in:{" "}
              <span className="font-mono tabular-nums">{skinsBuyerCount}</span>
            </span>
          </div>
        ) : null}
        {skinRows.length > 0 ? (
          <div className="overflow-x-auto border-b-2 border-emerald-900/20">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
                  <th className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                    Player
                  </th>
                  <th className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                    Holes won
                  </th>
                  <th className="w-14 border-r border-emerald-700/50 px-2 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider">
                    Skins
                  </th>
                  <th className="w-20 px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">$ won</th>
                </tr>
              </thead>
              <tbody>
                {skinRows.map((row, i) => (
                  <tr
                    key={row.player_id}
                    className={`border-b border-emerald-900/15 last:border-b-0 ${
                      i % 2 === 1 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"
                    }`}
                  >
                    <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">
                      {row.player_name}
                    </td>
                    <td className="border-r border-emerald-900/15 px-3 py-2 font-mono text-xs tabular-nums text-emerald-900/90">
                      {row.holes.join(", ")}
                    </td>
                    <td className="border-r border-emerald-900/15 px-2 py-2 text-center font-mono tabular-nums text-emerald-900">
                      {row.holes.length}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-950">
                      {row.amount_won.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          {distinctNines.length > 1 ? (
            <p className="border-b border-amber-300/80 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Mixed front/back nines in skins data for this week — columns use the first round&apos;s side; verify scores
              in admin if something looks off.
            </p>
          ) : null}
          <p className="border-b border-emerald-900/15 px-3 py-2 text-xs text-emerald-900/80">
            Nine shown: {whichNine === "back" ? "Back (holes 10–18)" : "Front (holes 1–9)"}
          </p>
          {skinRows.length > 0 ? (
            <p className="border-b border-amber-200/90 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950">
              <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-sm border-2 border-amber-800 bg-amber-300 text-[0.65rem] font-black leading-none text-emerald-950 shadow-[0_0_0_2px_#92400e,0_2px_8px_rgba(146,64,14,0.45)]">
                4
              </span>
              Amber-filled scores with a dark ring (like the sample) won a skin on that hole.
            </p>
          ) : null}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
                <th className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                  Player
                </th>
                <th className="border-r border-emerald-700/50 px-2 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                  Matchup
                </th>
                <th className="border-r border-emerald-700/50 px-2 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider">
                  Hcp
                </th>
                {holes.map((h) => (
                  <th
                    key={h}
                    className="border-r border-emerald-700/50 px-1.5 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
                <th className="border-r border-emerald-700/50 px-2 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">
                  Gross
                </th>
                <th className="px-2 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">Net</th>
              </tr>
              <tr className="border-b border-emerald-900/20 bg-[#eef3e8]/90 text-emerald-900/80">
                <th className="border-r border-emerald-900/15 px-3 py-1.5 text-left text-xs font-medium" colSpan={3}>
                  Par
                </th>
                {holes.map((h) => (
                  <th
                    key={`par-${h}`}
                    className="border-r border-emerald-900/15 px-1.5 py-1.5 text-center font-mono text-xs"
                  >
                    {parsByHole.get(h) ?? "—"}
                  </th>
                ))}
                <th className="border-r border-emerald-900/15 px-2 py-1.5 text-right font-mono text-xs">
                  {parTotal || "—"}
                </th>
                <th className="px-2 py-1.5 text-right font-mono text-xs">—</th>
              </tr>
              <tr className="border-b-2 border-emerald-900/25 bg-[#e4ebe0] text-emerald-900/90">
                <th
                  className="border-r border-emerald-900/15 px-3 py-1.5 text-left text-[0.65rem] font-semibold uppercase tracking-wide"
                  colSpan={3}
                  title="Stroke index for this hole (1 = hardest). Handicap strokes are given on the hardest holes first."
                >
                  Stroke index
                </th>
                {holes.map((h) => (
                  <th
                    key={`si-${h}`}
                    className="border-r border-emerald-900/15 px-1.5 py-1.5 text-center font-mono text-xs font-semibold tabular-nums"
                  >
                    {strokeIndexByHole.get(h) ?? "—"}
                  </th>
                ))}
                <th className="border-r border-emerald-900/15 px-2 py-1.5 text-right text-xs font-medium text-emerald-800/70">
                  —
                </th>
                <th className="px-2 py-1.5 text-right text-xs font-medium text-emerald-800/70">—</th>
              </tr>
            </thead>
            <tbody>
              {sortedRounds.map((r, idx) => {
                const subName = playerName.get(r.player_id) ?? "Unknown";
                const playingForName = r.subbing_for_player_id
                  ? playerName.get(r.subbing_for_player_id) ?? "?"
                  : null;
                const team = teamName.get(r.played_for_team_id) ?? "—";
                const match = matchById.get(r.match_id);
                const opp =
                  match?.team_a_id && match.team_b_id
                    ? r.played_for_team_id === match.team_a_id
                      ? teamName.get(match.team_b_id) ?? "?"
                      : teamName.get(match.team_a_id) ?? "?"
                    : null;
                const matchupCell = opp ? `${team} vs ${opp}` : team;
                const hcap = handicapByRoundId.get(r.id) ?? 0;
                const totalGross = holes.reduce((sum, h) => sum + (strokesByRoundHole.get(`${r.id}:${h}`) ?? 0), 0);
                const netTotal = holes.reduce((sum, h) => {
                  const gross = strokesByRoundHole.get(`${r.id}:${h}`) ?? 0;
                  const dots = dotsByRoundHole.get(`${r.id}:${h}`) ?? 0;
                  return sum + (gross - dots);
                }, 0);

                return (
                  <tr
                    key={r.id}
                    className={`border-b border-emerald-900/15 ${idx % 2 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"}`}
                  >
                    <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">
                      {subName}
                      {playingForName ? (
                        <span className="ml-1 text-xs font-normal text-zinc-600">(Playing for {playingForName})</span>
                      ) : null}
                    </td>
                    <td className="max-w-[12rem] border-r border-emerald-900/15 px-2 py-2 text-xs text-zinc-700">
                      {matchupCell}
                    </td>
                    <td className="border-r border-emerald-900/15 px-2 py-2 text-center font-mono tabular-nums text-emerald-900">
                      {hcap}
                    </td>
                    {holes.map((h) => {
                      const gross = strokesByRoundHole.get(`${r.id}:${h}`);
                      const par = parsByHole.get(h);
                      const wonSkinHere = skinWonHolesByPlayer.get(r.player_id)?.has(h) ?? false;
                      const dots = dotsByRoundHole.get(`${r.id}:${h}`) ?? 0;
                      let scoreFace: ReactNode;
                      if (gross == null || par == null) {
                        scoreFace = "—";
                      } else {
                        const diff = gross - par;
                        const shapeClass =
                          diff <= -2
                            ? "rounded-full border-2 border-emerald-900 outline outline-1 outline-offset-[2px] outline-emerald-900"
                            : diff <= -1
                              ? "rounded-full border border-emerald-900"
                              : diff === 1
                                ? "border border-emerald-900"
                                : diff >= 2
                                  ? "border-2 border-emerald-900 outline outline-1 outline-offset-[2px] outline-emerald-900"
                                  : "";
                        scoreFace = (
                          <span
                            className={[
                              "inline-flex min-h-[1.5rem] min-w-[1.5rem] items-center justify-center px-0.5",
                              shapeClass,
                              wonSkinHere
                                ? `relative z-[1] bg-amber-300 font-black text-emerald-950 shadow-[0_0_0_2px_#92400e,0_3px_12px_rgba(146,64,14,0.55)]${shapeClass ? "" : " rounded-sm"}`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            title={wonSkinHere ? "Won a skin on this hole" : undefined}
                          >
                            {gross}
                          </span>
                        );
                      }
                      return (
                        <td
                          key={`${r.id}:${h}`}
                          className="border-r border-emerald-900/15 px-1.5 py-1.5 text-center align-top font-mono tabular-nums text-emerald-900"
                        >
                          <div className="flex flex-col items-center justify-center gap-1">
                            <div
                              className="flex min-h-[0.7rem] max-w-[3.25rem] flex-wrap items-center justify-center gap-0.5"
                              title={
                                dots > 0
                                  ? `${dots} handicap stroke${dots === 1 ? "" : "s"} received on this hole (stroke index ${strokeIndexByHole.get(h) ?? "?"})`
                                  : undefined
                              }
                            >
                              {dots > 0
                                ? Array.from({ length: dots }, (_, i) => (
                                    <span
                                      key={i}
                                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-900/85"
                                      aria-hidden
                                    />
                                  ))
                                : null}
                            </div>
                            <div className="flex min-h-[1.5rem] items-center justify-center">{scoreFace}</div>
                          </div>
                        </td>
                      );
                    })}
                    <td className="border-r border-emerald-900/15 px-2 py-2 text-right font-mono font-semibold tabular-nums text-emerald-950">
                      {totalGross || "—"}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-emerald-950">
                      {netTotal || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
