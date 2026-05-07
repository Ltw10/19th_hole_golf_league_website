import { notFound } from "next/navigation";
import { BackToScheduleButton } from "@/components/BackToScheduleButton";
import { VirtualDotsPreview } from "@/components/VirtualDotsPreview";
import { handicapFromScores, strokesReceivedOnHole } from "@/lib/scoring";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MatchRow = {
  id: string;
  week_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
};

type PlayerRow = {
  id: string;
  name: string;
  team_id: string;
  is_league_member: boolean;
};

type RoundRow = {
  id: string;
  player_id: string;
  played_for_team_id: string;
  which_nine: "front" | "back" | null;
  subbing_for_player_id: string | null;
  handicap_at_submission: number | null;
};

type HoleScoreRow = {
  player_round_id: string;
  hole_number: number;
  strokes: number;
};

type CourseHoleRow = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

type HandicapScoreRow = {
  player_id: string;
  played_date: string;
  score: number;
  par: number;
  created_at: string | null;
};

export default async function VirtualScorecardPage(props: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await props.params;
  const supabase = await createServerSupabaseClient();

  const [{ data: match, error: matchErr }, { data: teams, error: teamErr }, { data: players, error: playerErr }] =
    await Promise.all([
      supabase.from("matches").select("id, week_id, team_a_id, team_b_id").eq("id", matchId).maybeSingle(),
      supabase.from("teams").select("id, name"),
      supabase.from("players").select("id, name, team_id, is_league_member"),
    ]);

  if (matchErr || teamErr || playerErr) {
    return <p className="text-red-700">{matchErr?.message ?? teamErr?.message ?? playerErr?.message ?? "Failed to load"}</p>;
  }
  if (!match) return notFound();

  const typedMatch = match as MatchRow;
  const teamName = new Map((teams ?? []).map((t) => [String(t.id), String(t.name)]));
  const playerRows = (players ?? []) as PlayerRow[];
  const playerName = new Map(playerRows.map((p) => [String(p.id), String(p.name)]));

  const { data: weekRow, error: weekErr } = await supabase
    .from("season_weeks")
    .select("week_date")
    .eq("id", typedMatch.week_id)
    .maybeSingle();
  if (weekErr) return <p className="text-red-700">{weekErr.message}</p>;
  const weekDate = (weekRow?.week_date as string | undefined) ?? "";

  const { data: rounds, error: roundErr } = await supabase
    .from("player_rounds")
    .select("id, player_id, played_for_team_id, which_nine, subbing_for_player_id, handicap_at_submission")
    .eq("match_id", matchId);
  if (roundErr) return <p className="text-red-700">{roundErr.message}</p>;

  const roundRows = ((rounds ?? []) as RoundRow[]).sort((a, b) => {
    if (a.played_for_team_id !== b.played_for_team_id) return a.played_for_team_id.localeCompare(b.played_for_team_id);
    const an = playerName.get(a.player_id) ?? "";
    const bn = playerName.get(b.player_id) ?? "";
    return an.localeCompare(bn);
  });

  const distinctNines = [...new Set(roundRows.map((r) => r.which_nine ?? "front"))];
  const whichNine = (distinctNines[0] ?? "front") as "front" | "back";
  const holes = whichNine === "back" ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : [1, 2, 3, 4, 5, 6, 7, 8, 9];

  const { data: course } = await supabase
    .from("course_holes")
    .select("hole_number, par, stroke_index")
    .in("hole_number", holes)
    .order("hole_number", { ascending: true });

  const parsByHole = new Map(((course ?? []) as CourseHoleRow[]).map((h) => [h.hole_number, h.par]));
  const courseHoles = (course ?? []) as CourseHoleRow[];
  const strokeIndexByHole = new Map(courseHoles.map((h) => [h.hole_number, h.stroke_index]));
  const parTotal = holes.reduce((sum, h) => sum + (parsByHole.get(h) ?? 0), 0);

  const roundIds = roundRows.map((r) => r.id);
  const { data: holeScores, error: holeErr } =
    roundIds.length === 0
      ? { data: [] as HoleScoreRow[], error: null }
      : await supabase
          .from("player_hole_scores")
          .select("player_round_id, hole_number, strokes")
          .in("player_round_id", roundIds);
  if (holeErr) return <p className="text-red-700">{holeErr.message}</p>;

  const strokesByRoundHole = new Map<string, number>();
  for (const hs of (holeScores ?? []) as HoleScoreRow[]) {
    strokesByRoundHole.set(`${hs.player_round_id}:${hs.hole_number}`, hs.strokes);
  }

  const teamAId = typedMatch.team_a_id ?? "";
  const teamBId = typedMatch.team_b_id ?? "";
  const rowsA = roundRows.filter((r) => r.played_for_team_id === teamAId);
  const rowsB = roundRows.filter((r) => r.played_for_team_id === teamBId);
  const submittedCount = roundRows.length;
  const showComputedSections = submittedCount >= 4;
  const playerIds = [...new Set(roundRows.map((r) => r.player_id))];

  if (roundRows.length === 0) {
    const previewPlayers = playerRows.filter(
      (p) => p.is_league_member && (p.team_id === teamAId || p.team_id === teamBId),
    );
    const previewIds = previewPlayers.map((p) => p.id);
    const { data: hhRows } =
      previewIds.length === 0
        ? { data: [] as HandicapScoreRow[] }
        : await supabase
            .from("handicap_helper_scores")
            .select("player_id, played_date, score, par, created_at")
            .in("player_id", previewIds)
            .order("played_date", { ascending: false });

    const hhByPlayer: Record<string, HandicapScoreRow[]> = {};
    for (const row of (hhRows ?? []) as HandicapScoreRow[]) {
      const pid = String(row.player_id);
      const list = hhByPlayer[pid] ?? [];
      list.push(row);
      hhByPlayer[pid] = list;
    }

    const teamLabelA = teamName.get(teamAId) ?? "Team A";
    const teamLabelB = teamName.get(teamBId) ?? "Team B";
    const preview = previewPlayers
      .map((p) => {
        const hcap = handicapFromScores(
          (hhByPlayer[p.id] ?? []).map((x) => ({
            played_date: x.played_date,
            score: Number(x.score),
            par: Number(x.par),
            created_at: x.created_at ?? undefined,
          })),
          weekDate || undefined,
        );
        return { ...p, handicap: hcap };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const { data: allCourseRows, error: allCourseErr } = await supabase
      .from("course_holes")
      .select("hole_number, stroke_index")
      .gte("hole_number", 1)
      .lte("hole_number", 18)
      .order("hole_number", { ascending: true });
    if (allCourseErr) return <p className="text-red-700">{allCourseErr.message}</p>;
    const allCourse = (allCourseRows ?? []) as CourseHoleRow[];

    function netDotsForSide(side: "front" | "back") {
      const sideHoles = side === "back" ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const sideCourse = sideHoles
        .map((h) => allCourse.find((c) => c.hole_number === h))
        .filter((h): h is CourseHoleRow => Boolean(h))
        .map((h) => ({ hole_number: h.hole_number, par: 4, stroke_index: h.stroke_index }));
      const strokeIndexByHole = new Map(sideCourse.map((h) => [h.hole_number, h.stroke_index]));

      const perHole = sideHoles.map((hole) => {
        const dotsA = preview
          .filter((p) => p.team_id === teamAId)
          .reduce((sum, p) => sum + strokesReceivedOnHole(sideCourse, p.handicap, hole), 0);
        const dotsB = preview
          .filter((p) => p.team_id === teamBId)
          .reduce((sum, p) => sum + strokesReceivedOnHole(sideCourse, p.handicap, hole), 0);
        const diff = Math.abs(dotsA - dotsB);
        const team = dotsA === dotsB ? null : dotsA > dotsB ? teamLabelA : teamLabelB;
        return { hole, diff, team };
      });
      const players = preview
        .map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team_id === teamAId ? teamLabelA : teamLabelB,
          teamSort: p.team_id === teamAId ? 0 : 1,
          handicap: p.handicap,
          dotsByHole: Object.fromEntries(
            sideHoles.map((hole) => [hole, strokesReceivedOnHole(sideCourse, p.handicap, hole)]),
          ),
        }))
        .sort((a, b) => {
          if (a.teamSort !== b.teamSort) return a.teamSort - b.teamSort;
          return a.name.localeCompare(b.name);
        })
        .map(({ teamSort: _teamSort, ...rest }) => rest);
      return { sideHoles, strokeIndexByHole, perHole, players };
    }

    const front = netDotsForSide("front");
    const back = netDotsForSide("back");

    return (
      <div className="space-y-5">
        <BackToScheduleButton />
        <div className="rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]">
          <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2">
            <h1 className="text-lg font-semibold text-emerald-950">
              Virtual scorecard: {teamLabelA} vs {teamLabelB}
            </h1>
            <p className="text-xs text-emerald-900/75">
              No round submissions yet. Showing projected team net dots from current handicaps.
            </p>
          </div>
          <VirtualDotsPreview
            front={{
              sideHoles: front.sideHoles,
              strokeIndexByHole: Object.fromEntries(front.strokeIndexByHole.entries()),
              perHole: front.perHole,
              players: front.players,
            }}
            back={{
              sideHoles: back.sideHoles,
              strokeIndexByHole: Object.fromEntries(back.strokeIndexByHole.entries()),
              perHole: back.perHole,
              players: back.players,
            }}
          />
        </div>
      </div>
    );
  }

  const { data: hhRows, error: hhErr } =
    playerIds.length === 0
      ? { data: [] as HandicapScoreRow[], error: null }
      : await supabase
          .from("handicap_helper_scores")
          .select("player_id, played_date, score, par, created_at")
          .in("player_id", playerIds)
          .order("played_date", { ascending: false });
  if (hhErr) return <p className="text-red-700">{hhErr.message}</p>;

  const hhByPlayer: Record<string, HandicapScoreRow[]> = {};
  for (const row of (hhRows ?? []) as HandicapScoreRow[]) {
    const pid = String(row.player_id);
    const list = hhByPlayer[pid] ?? [];
    list.push(row);
    hhByPlayer[pid] = list;
  }

  const handicapByRoundId = new Map<string, number>();
  for (const r of roundRows) {
    const rows = hhByPlayer[r.player_id] ?? [];
    handicapByRoundId.set(
      r.id,
      handicapFromScores(
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

  const teamLabelA = teamName.get(teamAId) ?? "Team A";
  const teamLabelB = teamName.get(teamBId) ?? "Team B";
  const rosterA = playerRows
    .filter((p) => p.team_id === teamAId && p.is_league_member)
    .sort((a, b) => a.name.localeCompare(b.name));
  const rosterB = playerRows
    .filter((p) => p.team_id === teamBId && p.is_league_member)
    .sort((a, b) => a.name.localeCompare(b.name));
  const submittedByPlayer = new Map(roundRows.map((r) => [r.player_id, r] as const));
  const extraSubmitted = roundRows.filter(
    (r) => !rosterA.some((p) => p.id === r.player_id) && !rosterB.some((p) => p.id === r.player_id),
  );
  const displayRows = [
    ...rosterA.map((p) => ({ teamId: teamAId, playerId: p.id, row: submittedByPlayer.get(p.id) ?? null })),
    ...rosterB.map((p) => ({ teamId: teamBId, playerId: p.id, row: submittedByPlayer.get(p.id) ?? null })),
    ...extraSubmitted.map((r) => ({ teamId: r.played_for_team_id, playerId: r.player_id, row: r })),
  ];
  const holeSummaries = holes.map((hole) => {
    const grossA = rowsA.reduce((sum, r) => sum + (strokesByRoundHole.get(`${r.id}:${hole}`) ?? 0), 0);
    const grossB = rowsB.reduce((sum, r) => sum + (strokesByRoundHole.get(`${r.id}:${hole}`) ?? 0), 0);
    const dotsA = rowsA.reduce((sum, r) => sum + (dotsByRoundHole.get(`${r.id}:${hole}`) ?? 0), 0);
    const dotsB = rowsB.reduce((sum, r) => sum + (dotsByRoundHole.get(`${r.id}:${hole}`) ?? 0), 0);
    const netA = grossA - dotsA;
    const netB = grossB - dotsB;
    const netDotDiff = Math.abs(dotsA - dotsB);
    const netDotTeam = dotsA === dotsB ? null : dotsA > dotsB ? teamLabelA : teamLabelB;
    return { hole, grossA, grossB, dotsA, dotsB, netA, netB, netDotDiff, netDotTeam };
  });
  const combinedNetA = holeSummaries.reduce((sum, h) => sum + h.netA, 0);
  const combinedNetB = holeSummaries.reduce((sum, h) => sum + h.netB, 0);
  const tenthPointWinner =
    combinedNetA < combinedNetB ? teamLabelA : combinedNetB < combinedNetA ? teamLabelB : null;

  return (
    <div className="space-y-5">
      <BackToScheduleButton />

      <div className="rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]">
        <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2">
          <h1 className="text-lg font-semibold text-emerald-950">
            Virtual scorecard: {teamName.get(teamAId) ?? "Team A"} vs {teamName.get(teamBId) ?? "Team B"}
          </h1>
          <p className="text-xs text-emerald-900/75">
            Showing {whichNine === "back" ? "Back 9 (10-18)" : "Front 9 (1-9)"}
            {distinctNines.length > 1 ? " - mixed sides submitted" : ""}
          </p>
          {submittedCount > 0 && submittedCount < 4 ? (
            <p className="mt-1 text-xs text-amber-900/85">
              {submittedCount}/4 rounds submitted - showing missing players with blank scores until all submissions are in.
            </p>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
                <th className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                  Player
                </th>
                {holes.map((h) => (
                  <th key={h} className="border-r border-emerald-700/50 px-2 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider">
                    {h}
                  </th>
                ))}
                <th className="border-r border-emerald-700/50 px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">
                  Gross total
                </th>
                <th className="px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">Net total</th>
              </tr>
              <tr className="border-b border-emerald-900/20 bg-[#eef3e8]/90 text-emerald-900/80">
                <th className="border-r border-emerald-900/15 px-3 py-1.5 text-left text-xs font-medium">Par</th>
                {holes.map((h) => (
                  <th key={`par-${h}`} className="border-r border-emerald-900/15 px-2 py-1.5 text-center font-mono text-xs">
                    {parsByHole.get(h) ?? "-"}
                  </th>
                ))}
                <th className="border-r border-emerald-900/15 px-3 py-1.5 text-right font-mono text-xs">{parTotal || "-"}</th>
                <th className="px-3 py-1.5 text-right font-mono text-xs">-</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((entry, idx) => {
                const r = entry.row;
                const name = playerName.get(entry.playerId) ?? "Unknown player";
                const subFor = r?.subbing_for_player_id ? playerName.get(r.subbing_for_player_id) : null;
                const hcap = r?.handicap_at_submission ?? null;
                const total = holes.reduce((sum, h) => sum + (r ? (strokesByRoundHole.get(`${r.id}:${h}`) ?? 0) : 0), 0);
                const netTotal = holes.reduce((sum, h) => {
                  const grossHole = r ? (strokesByRoundHole.get(`${r.id}:${h}`) ?? 0) : 0;
                  const dots = r ? (dotsByRoundHole.get(`${r.id}:${h}`) ?? 0) : 0;
                  return sum + (grossHole - dots);
                }, 0);
                return (
                  <tr
                    key={`${entry.playerId}:${r?.id ?? "missing"}`}
                    className={`border-b border-emerald-900/15 ${idx % 2 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"}`}
                  >
                    <td className="border-r border-emerald-900/15 px-3 py-2 text-left font-medium text-emerald-950">
                      {name}
                      {subFor ? <span className="ml-1 text-xs font-normal text-zinc-600">(sub for {subFor})</span> : null}
                      <span className="ml-1 text-xs font-normal text-zinc-600">[hcp {hcap ?? "-"}]</span>
                    </td>
                    {holes.map((h) => (
                      <td
                        key={`${entry.playerId}:${r?.id ?? "missing"}:${h}`}
                        className="border-r border-emerald-900/15 px-2 py-2 text-center font-mono tabular-nums text-emerald-900"
                      >
                        {(() => {
                          const gross = r ? strokesByRoundHole.get(`${r.id}:${h}`) : null;
                          const par = parsByHole.get(h);
                          if (gross == null || par == null) return "-";
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
                          return (
                            <span className={`inline-flex min-h-[1.5rem] min-w-[1.5rem] items-center justify-center px-1 ${shapeClass}`}>
                              {gross}
                            </span>
                          );
                        })()}
                      </td>
                    ))}
                    <td className="border-r border-emerald-900/15 px-3 py-2 text-right font-mono font-semibold tabular-nums text-emerald-950">
                      {total || "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-emerald-950">
                      {netTotal || "-"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-emerald-900/20 bg-[#eef3e8]/90 text-emerald-900/85">
                <td className="border-r border-emerald-900/15 px-3 py-1.5 text-left text-xs font-medium">HCP</td>
                {holes.map((h) => (
                  <td key={`hcp-bottom-${h}`} className="border-r border-emerald-900/15 px-2 py-1.5 text-center font-mono text-xs">
                    {strokeIndexByHole.get(h) ?? "-"}
                  </td>
                ))}
                <td className="border-r border-emerald-900/15 px-3 py-1.5 text-right text-xs"> </td>
                <td className="px-3 py-1.5 text-right text-xs"> </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showComputedSections ? (
        <div className="rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]">
        <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2">
          <h2 className="text-sm font-semibold text-emerald-950">Match combined-net summary</h2>
        </div>
        <div className="px-4 py-3 text-sm text-emerald-950">
          <p className="font-mono tabular-nums">
            {teamLabelA}: {combinedNetA} net
          </p>
          <p className="font-mono tabular-nums">
            {teamLabelB}: {combinedNetB} net
          </p>
          <p className="mt-2 font-medium">
            {tenthPointWinner
              ? `10th point winner: ${tenthPointWinner}`
              : "10th point: tie (split 0.5 / 0.5)"}
          </p>
        </div>
      </div>
      ) : null}

      {showComputedSections ? (
        <div className="rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]">
        <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2">
          <h2 className="text-sm font-semibold text-emerald-950">Dots and combined-net by hole</h2>
          <p className="text-xs text-emerald-900/75">
            Only net dots are shown (difference between team dots). Combined gross is shown, but winner bolding still uses net after dots.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
                <th className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                  Detail
                </th>
                {holeSummaries.map((h) => (
                  <th
                    key={`detail-${h.hole}`}
                    className="border-r border-emerald-700/50 px-2 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider last:border-r-0"
                  >
                    {h.hole}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-emerald-900/15 bg-[#eef3e8]/90">
                <td className="border-r border-emerald-900/15 px-3 py-1.5 text-xs font-medium text-emerald-950">HCP</td>
                {holeSummaries.map((h) => (
                  <td
                    key={`dots-hcp-${h.hole}`}
                    className="border-r border-emerald-900/15 px-2 py-1.5 text-center font-mono text-xs text-emerald-900 last:border-r-0"
                  >
                    {strokeIndexByHole.get(h.hole) ?? "-"}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-emerald-900/15 bg-[#f3f0e6]/90">
                <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">Net dots</td>
                {holeSummaries.map((h) => (
                  <td
                    key={`net-dots-${h.hole}`}
                    className="border-r border-emerald-900/15 px-2 py-2 text-center last:border-r-0"
                  >
                    {h.netDotDiff > 0 && h.netDotTeam ? (
                      <div className="flex flex-col items-center justify-center">
                        <span className="font-mono text-base leading-none tracking-[0.1em] text-emerald-900">
                          {"•".repeat(h.netDotDiff)}
                        </span>
                        <span className="mt-1 text-[10px] leading-none text-zinc-600">{h.netDotTeam}</span>
                      </div>
                    ) : (
                      <span className="font-mono text-zinc-400">—</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-emerald-900/15 bg-[#faf8f0]">
                <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">
                  Combined gross ({teamLabelA})
                </td>
                {holeSummaries.map((h) => (
                  <td
                    key={`a-net-${h.hole}`}
                    className={`border-r border-emerald-900/15 px-2 py-2 text-center font-mono tabular-nums text-emerald-900 last:border-r-0 ${
                      h.netA < h.netB ? "font-bold text-emerald-950" : ""
                    }`}
                  >
                    {h.grossA}
                  </td>
                ))}
              </tr>
              <tr className="bg-[#f3f0e6]/90">
                <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">
                  Combined gross ({teamLabelB})
                </td>
                {holeSummaries.map((h) => (
                  <td
                    key={`b-net-${h.hole}`}
                    className={`border-r border-emerald-900/15 px-2 py-2 text-center font-mono tabular-nums text-emerald-900 last:border-r-0 ${
                      h.netB < h.netA ? "font-bold text-emerald-950" : ""
                    }`}
                  >
                    {h.grossB}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      ) : null}
    </div>
  );
}
