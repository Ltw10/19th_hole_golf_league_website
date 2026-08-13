import Link from "next/link";
import { SkinsWeekDetailButton, type SkinsWeekDetail } from "@/components/SkinsWeekDetailButton";
import { ScrollToScheduleAnchor } from "@/components/ScrollToScheduleAnchor";
import { SupabaseConnectionHelp } from "@/components/SupabaseConnectionHelp";
import { WeatherCancelWeek } from "@/components/WeatherCancelWeek";
import { formatSeasonPhase } from "@/lib/nhgl";
import {
  effectiveHandicapForRound,
  formatLeaguePointValue,
  formatPointsDisplay,
  resolveSkinsHole,
  strokesReceivedOnHole,
} from "@/lib/scoring";
import { currentScheduleWeekId, SCHEDULE_CURRENT_WEEK_ANCHOR } from "@/lib/schedule";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Team = { id: string; name: string };
type Week = {
  id: string;
  week_number: number;
  week_date: string;
  phase: string;
  is_cancelled?: boolean;
  notes?: string | null;
};
type Match = {
  id: string;
  week_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
};

type ScoreRow = {
  match_id: string;
  team_a_points: number | string;
  team_b_points: number | string;
  scorecard_image_url: string | null;
};

/** Desktop only: Match | Pts | In | Card — Pts column sized for half-point scores (e.g. 2.5 - 7.5) */
const MATCH_HEADER_DESKTOP =
  "hidden sm:grid sm:w-full sm:grid-cols-[minmax(0,1fr)_6.25rem_4.5rem_10.5rem] sm:items-stretch sm:border-b sm:border-emerald-900/20 sm:bg-[#eef3e8]/90 sm:px-2";

const MATCH_ROW_DESKTOP =
  "hidden sm:grid sm:w-full sm:grid-cols-[minmax(0,1fr)_6.25rem_4.5rem_10.5rem] sm:items-center sm:px-2 sm:py-0";

const scorecardShell =
  "overflow-hidden rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]";

type SkinAgg = {
  player_id: string;
  player_name: string;
  holes: number[];
  amount_won: number;
};

type SkinsRoundRow = {
  id: string;
  match_id: string;
  week_id: string;
  player_id: string;
  played_skins: boolean;
  which_nine: "front" | "back" | null;
  handicap_at_submission: number | null;
};

type HoleScoreRow = {
  player_round_id: string;
  hole_number: number;
  strokes: number;
};

type HandicapScoreRow = {
  player_id: string;
  played_date: string;
  score: number;
  par: number;
  created_at: string;
};

type CourseHoleRow = {
  hole_number: number;
  stroke_index: number;
};

export default async function SchedulePage() {
  let loadError: string | null = null;
  let weeks: Week[] = [];
  let matches: Match[] = [];
  let teams: Team[] = [];
  let scoresByMatchId = new Map<
    string,
    { a: number; b: number; scorecardImageUrl: string | null }
  >();
  let submissionCountByMatch = new Map<string, number>();
  let skinsByWeek = new Map<string, SkinAgg[]>();
  let skinsPotByWeek = new Map<string, number>();
  let skinsDetailByWeek = new Map<string, SkinsWeekDetail>();
  let skinsBuyerCountByWeek = new Map<string, number>();
  let skinsBuyinAmount = 5;

  try {
    const supabase = await createServerSupabaseClient();

    const [
      { data: w, error: wErr },
      { data: m, error: mErr },
      { data: t, error: tErr },
      { data: subs, error: sErr },
      { data: rounds, error: rErr },
      { data: holeWins, error: hwErr },
      { data: payouts, error: pyErr },
      { data: playersRows, error: pErr },
      { data: settingsRows, error: setErr },
      { data: buyins, error: biErr },
    ] = await Promise.all([
      supabase.from("season_weeks").select("*").order("week_number", { ascending: true }),
      supabase.from("matches").select("*"),
      supabase.from("teams").select("*"),
      supabase
        .from("score_submissions")
        .select("match_id, team_a_points, team_b_points, scorecard_image_url"),
      supabase
        .from("player_rounds")
        .select("id, match_id, week_id, player_id, played_skins, which_nine, handicap_at_submission"),
      supabase.from("skins_hole_wins").select("week_id, player_id, hole"),
      supabase.from("skins_week_payouts").select("week_id, player_id, amount_won"),
      supabase.from("players").select("id, name"),
      supabase.from("league_settings").select("key, value"),
      supabase.from("skins_buyins").select("week_id, player_id"),
    ]);

    const firstErr =
      wErr ??
      mErr ??
      tErr ??
      sErr ??
      rErr ??
      hwErr ??
      pyErr ??
      pErr ??
      setErr ??
      biErr;
    if (firstErr) {
      loadError = firstErr.message;
    } else {
      weeks = (w ?? []) as Week[];
      matches = (m ?? []) as Match[];
      teams = (t ?? []) as Team[];
      for (const row of (subs ?? []) as ScoreRow[]) {
        scoresByMatchId.set(row.match_id, {
          a: Number(row.team_a_points),
          b: Number(row.team_b_points),
          scorecardImageUrl: row.scorecard_image_url,
        });
      }
      for (const row of rounds ?? []) {
        const mid = (row as { match_id: string }).match_id as string;
        submissionCountByMatch.set(mid, (submissionCountByMatch.get(mid) ?? 0) + 1);
      }

      for (const row of settingsRows ?? []) {
        if (row.key === "skins_buyin_amount") {
          const n = Number(String(row.value).replace(/,/g, ""));
          if (Number.isFinite(n)) skinsBuyinAmount = n;
        }
      }

      const playerName = new Map((playersRows ?? []).map((p) => [p.id as string, p.name as string]));
      const roundRows = (rounds ?? []) as SkinsRoundRow[];
      const skinsRounds = roundRows.filter((r) => r.played_skins);
      const skinsRoundIds = skinsRounds.map((r) => r.id);
      const skinsPlayerIds = [...new Set(skinsRounds.map((r) => r.player_id))];

      const { data: holeScoresRows, error: hsErr } =
        skinsRoundIds.length === 0
          ? { data: [] as HoleScoreRow[], error: null }
          : await supabase
              .from("player_hole_scores")
              .select("player_round_id, hole_number, strokes")
              .in("player_round_id", skinsRoundIds);
      if (hsErr) {
        loadError = hsErr.message;
      }

      const { data: hhRows, error: hhErr } =
        skinsPlayerIds.length === 0
          ? { data: [] as HandicapScoreRow[], error: null }
          : await supabase
              .from("handicap_helper_scores")
              .select("player_id, played_date, score, par, created_at")
              .in("player_id", skinsPlayerIds)
              .order("played_date", { ascending: false });
      if (hhErr) {
        loadError = hhErr.message;
      }

      const { data: courseRows, error: chErr } = await supabase.from("course_holes").select("hole_number, stroke_index");
      if (chErr) {
        loadError = chErr.message;
      }

      const hhByPlayer: Record<string, HandicapScoreRow[]> = {};
      for (const row of (hhRows ?? []) as HandicapScoreRow[]) {
        const pid = row.player_id as string;
        const list = hhByPlayer[pid] ?? [];
        list.push(row);
        hhByPlayer[pid] = list;
      }

      const weekDateById = new Map(weeks.map((wk) => [wk.id, wk.week_date]));
      const courseByHole = new Map<number, CourseHoleRow>();
      for (const ch of (courseRows ?? []) as CourseHoleRow[]) {
        courseByHole.set(ch.hole_number, ch);
      }

      const handicapByRoundId = new Map<string, number>();
      for (const rr of skinsRounds) {
        const rows = hhByPlayer[rr.player_id] ?? [];
        handicapByRoundId.set(
          rr.id,
          effectiveHandicapForRound(
            rr.handicap_at_submission,
            rows.map((x) => ({
              played_date: x.played_date,
              score: Number(x.score),
              par: Number(x.par),
              created_at: x.created_at,
            })),
            weekDateById.get(rr.week_id),
          ),
        );
      }

      const roundById = new Map(skinsRounds.map((r) => [r.id, r]));
      const scoresByWeekHole = new Map<
        string,
        Array<{ player_id: string; net: number; strokesOnHole: number }>
      >();
      for (const hs of (holeScoresRows ?? []) as HoleScoreRow[]) {
        const rr = roundById.get(hs.player_round_id);
        if (!rr) continue;
        const sideHoles = (rr.which_nine ?? "front") === "back" ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
        const sideCourse = sideHoles
          .map((h) => courseByHole.get(h))
          .filter((h): h is CourseHoleRow => Boolean(h))
          .map((h) => ({ hole_number: h.hole_number, par: 4, stroke_index: h.stroke_index }));
        const hcap = handicapByRoundId.get(rr.id) ?? 0;
        const dots = strokesReceivedOnHole(sideCourse, hcap, hs.hole_number);
        const net = hs.strokes - dots;
        const key = `${rr.week_id}:${hs.hole_number}`;
        const list = scoresByWeekHole.get(key) ?? [];
        list.push({ player_id: rr.player_id, net, strokesOnHole: dots });
        scoresByWeekHole.set(key, list);
      }

      const skinsRoundsByWeek = new Map<string, SkinsRoundRow[]>();
      for (const rr of skinsRounds) {
        const list = skinsRoundsByWeek.get(rr.week_id) ?? [];
        list.push(rr);
        skinsRoundsByWeek.set(rr.week_id, list);
      }

      const holesByWeekPlayer = new Map<string, Map<string, number[]>>();
      const skinWinnerByWeekHole = new Map<string, string>();
      for (const row of holeWins ?? []) {
        const wid = row.week_id as string;
        const pid = row.player_id as string;
        const hole = Number(row.hole);
        skinWinnerByWeekHole.set(`${wid}:${hole}`, pid);
        const weekMap = holesByWeekPlayer.get(wid) ?? new Map<string, number[]>();
        const arr = weekMap.get(pid) ?? [];
        arr.push(hole);
        weekMap.set(pid, arr);
        holesByWeekPlayer.set(wid, weekMap);
      }

      const payoutByWeekPlayer = new Map<string, Map<string, number>>();
      for (const row of payouts ?? []) {
        const wid = row.week_id as string;
        const pid = row.player_id as string;
        const amt = Number(row.amount_won);
        const wm = payoutByWeekPlayer.get(wid) ?? new Map<string, number>();
        wm.set(pid, amt);
        payoutByWeekPlayer.set(wid, wm);
      }

      for (const [wid, pmap] of holesByWeekPlayer) {
        const rows: SkinAgg[] = [];
        for (const [pid, holes] of pmap) {
          holes.sort((x, y) => x - y);
          const amount_won = payoutByWeekPlayer.get(wid)?.get(pid) ?? 0;
          rows.push({
            player_id: pid,
            player_name: playerName.get(pid) ?? "?",
            holes,
            amount_won,
          });
        }
        rows.sort((a, b) => {
          if (b.holes.length !== a.holes.length) return b.holes.length - a.holes.length;
          if (b.amount_won !== a.amount_won) return b.amount_won - a.amount_won;
          return a.player_name.localeCompare(b.player_name);
        });
        skinsByWeek.set(wid, rows);
      }

      const buyerCountByWeek = new Map<string, number>();
      const buyerNamesByWeek = new Map<string, string[]>();
      for (const row of buyins ?? []) {
        const wid = row.week_id as string;
        const pid = row.player_id as string;
        buyerCountByWeek.set(wid, (buyerCountByWeek.get(wid) ?? 0) + 1);
        const list = buyerNamesByWeek.get(wid) ?? [];
        list.push(playerName.get(pid) ?? "?");
        buyerNamesByWeek.set(wid, list);
      }
      for (const [wid, n] of buyerCountByWeek) {
        skinsPotByWeek.set(wid, skinsBuyinAmount * n);
        skinsBuyerCountByWeek.set(wid, n);
      }

      for (const wk of weeks) {
        if (!skinsByWeek.has(wk.id)) skinsByWeek.set(wk.id, []);
        if (!skinsPotByWeek.has(wk.id)) skinsPotByWeek.set(wk.id, 0);
        const roundsInWeek = skinsRoundsByWeek.get(wk.id) ?? [];
        const whichNine = (roundsInWeek[0]?.which_nine ?? "front") as "front" | "back";
        const holes = whichNine === "back" ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
        const holesDetail = holes.map((hole) => {
          const scores = scoresByWeekHole.get(`${wk.id}:${hole}`) ?? [];
          if (scores.length === 0) {
            return { hole, lowestNet: null, players: [], result: "none" as const };
          }
          const lowestNet = Math.min(...scores.map((s) => s.net));
          const resolution = resolveSkinsHole(scores);
          const tiedNames = scores
            .filter((s) => s.net === lowestNet)
            .map((s) => playerName.get(s.player_id) ?? "?")
            .sort((a, b) => a.localeCompare(b));
          const storedWinnerId = skinWinnerByWeekHole.get(`${wk.id}:${hole}`);
          if (storedWinnerId) {
            const grossTiebreak =
              resolution.kind === "gross_tiebreak" && resolution.winnerPlayerIds[0] === storedWinnerId;
            const winnerName = playerName.get(storedWinnerId) ?? "?";
            return {
              hole,
              lowestNet,
              players: grossTiebreak ? tiedNames : [winnerName],
              result: "skin" as const,
              grossTiebreakWinner: grossTiebreak ? winnerName : undefined,
            };
          }
          if (resolution.kind === "skin") {
            const winnerId = resolution.winnerPlayerIds[0];
            return {
              hole,
              lowestNet,
              players: [playerName.get(winnerId) ?? "?"],
              result: "skin" as const,
            };
          }
          return {
            hole,
            lowestNet,
            players: tiedNames,
            result: "tie" as const,
          };
        });
        skinsDetailByWeek.set(wk.id, {
          whichNine,
          playerCount: new Set(roundsInWeek.map((r) => r.player_id)).size,
          buyers: [...new Set((buyerNamesByWeek.get(wk.id) ?? []).sort((a, b) => a.localeCompare(b)))],
          holes: holesDetail,
        });
      }
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

  const highlightedWeekId = !loadError && weeks.length > 0 ? currentScheduleWeekId(weeks) : null;

  return (
    <div className="min-w-0 space-y-6">
      <ScrollToScheduleAnchor />
      <div className="rounded-sm border-2 border-emerald-900/30 bg-[#f4f1e8] px-4 py-3 shadow-[3px_4px_0_0_rgba(6,60,45,0.12)]">
        <p className="text-center text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-emerald-900/70">
          League schedule
        </p>
        <h1 className="mt-1 text-center text-2xl font-bold tracking-tight text-emerald-950">Schedule</h1>
        <p className="mt-1 text-center text-sm text-emerald-900/75">Every Tuesday · 6:00 PM</p>
      </div>

      {loadError && (
        <>
          <p className="text-red-700">{loadError}</p>
          <SupabaseConnectionHelp errorMessage={loadError} />
        </>
      )}

      {!loadError && (
        <ul className="space-y-7">
          {weeks.map((w) => {
            const cancelled = Boolean(w.is_cancelled);
            const ms = byWeek.get(w.id) ?? [];
            const skinRows = skinsByWeek.get(w.id) ?? [];
            const pot = skinsPotByWeek.get(w.id) ?? 0;
            const skinsPlayers = skinsBuyerCountByWeek.get(w.id) ?? 0;

            if (cancelled) {
              return (
                <li
                  key={w.id}
                  className="overflow-hidden rounded-sm border-2 border-slate-700/60 shadow-[3px_4px_0_0_rgba(15,23,42,0.2)]"
                >
                  <WeatherCancelWeek
                    weekNumber={w.week_number}
                    weekDate={w.week_date}
                    notes={w.notes ?? null}
                  />
                </li>
              );
            }

            return (
              <li
                key={w.id}
                id={highlightedWeekId === w.id ? SCHEDULE_CURRENT_WEEK_ANCHOR : undefined}
                className={
                  highlightedWeekId === w.id
                    ? "relative z-[1] scroll-mt-24 overflow-hidden rounded-sm border-2 border-amber-700/90 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)] outline outline-2 outline-offset-2 outline-amber-700/95 sm:scroll-mt-28"
                    : "overflow-hidden rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]"
                }
              >
                <div className="border-b-2 border-emerald-900/30 bg-[#e8efe3] px-3 py-2.5 sm:px-4">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-900/65">
                        Week {w.week_number}
                        {highlightedWeekId === w.id ? (
                          <span className="ml-2 inline-block rounded-sm bg-amber-700 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-[#fffef8]">
                            This week
                          </span>
                        ) : null}
                      </p>
                      <h2 className="text-lg font-bold text-emerald-950">
                        {formatSeasonPhase(w.phase, { isCancelled: cancelled })}
                      </h2>
                      {w.notes && w.week_number === 16 ? (
                        <p className="mt-1 max-w-xl text-xs text-emerald-900/70">{w.notes}</p>
                      ) : null}
                    </div>
                    <time dateTime={w.week_date} className="font-mono text-xs text-emerald-900/80 sm:text-sm">
                      {formatDate(w.week_date)}
                      <span className="block text-right text-[0.65rem] font-sans uppercase tracking-wider text-emerald-800/70 sm:inline sm:ml-2 sm:text-xs">
                        6:00 PM
                      </span>
                    </time>
                  </div>
                </div>
                {ms.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-emerald-900/60">
                    {w.phase === "handicap"
                      ? "Handicap weeks — matchups follow Regular Season scheduling."
                      : "No matches listed."}
                  </p>
                ) : (
                  <div className="border-t border-emerald-900/15">
                    <div className="border-b border-emerald-900/20 bg-[#eef3e8]/90 px-3 py-2 sm:hidden">
                      <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-emerald-900/75">
                        Matches
                      </p>
                    </div>
                    <div className={MATCH_HEADER_DESKTOP}>
                      <div className="flex items-center border-r border-emerald-900/15 py-2 pr-2 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-emerald-900/75 sm:px-3 sm:py-2.5 sm:text-[0.65rem] sm:tracking-[0.14em]">
                        Match
                      </div>
                      <div className="flex items-center justify-center border-r border-emerald-900/15 py-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-900/75 sm:text-[0.65rem] sm:tracking-[0.14em]">
                        Pts
                      </div>
                      <div className="flex items-center justify-center border-r border-emerald-900/15 py-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-900/75 sm:text-[0.65rem] sm:tracking-[0.14em]">
                        In
                      </div>
                      <div className="flex min-w-0 items-center justify-center py-2 text-[0.6rem] font-bold uppercase tracking-[0.12em] text-emerald-900/75 sm:text-[0.65rem] sm:tracking-[0.14em]">
                        Card
                      </div>
                    </div>
                    <ul className="max-sm:border-t max-sm:border-emerald-900/10">
                      {ms.map((m, idx) => {
                        const submitted = scoresByMatchId.get(m.id);
                        const n = submissionCountByMatch.get(m.id) ?? 0;
                        return (
                          <ScheduleMatchRow
                            key={m.id}
                            m={m}
                            idx={idx}
                            teamMap={teamMap}
                            submitted={submitted}
                            submissionCount={n}
                            highlightWeek={highlightedWeekId === w.id}
                          />
                        );
                      })}
                    </ul>
                  </div>
                )}
                <div className={`${scorecardShell} border-t-0`}>
                  <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2 text-center">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-emerald-900/65">
                        Skins · Week {w.week_number}
                      </span>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        <SkinsWeekDetailButton
                          weekLabel={`Week ${w.week_number} (${w.week_date})`}
                          detail={skinsDetailByWeek.get(w.id) ?? null}
                        />
                        <Link
                          href={`/schedule/skins-scorecard/${encodeURIComponent(w.id)}`}
                          className="rounded-sm border border-emerald-800/25 bg-white px-2 py-1 text-xs font-medium text-emerald-900 shadow-sm hover:bg-[#f4f1e8]"
                        >
                          View skins scorecard
                        </Link>
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-2 text-xs text-emerald-900/80">
                    Pot:{" "}
                    <span className="font-mono font-semibold tabular-nums">
                      ${pot.toFixed(2)}
                    </span>{" "}
                    <span className="text-emerald-800/60">
                      (${skinsBuyinAmount.toFixed(2)} × buyers) · Players in:{" "}
                      <span className="font-mono tabular-nums">{skinsPlayers}</span>
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    {skinRows.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-emerald-900/65">
                        No skins yet — players haven&apos;t submitted, or no one bought in for this week.
                      </p>
                    ) : (
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
                            <th className="w-20 px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">
                              $ won
                            </th>
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
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type ScheduleMatchSubmitted = {
  a: number;
  b: number;
  scorecardImageUrl: string | null;
};

function ScheduleMatchRow({
  m,
  idx,
  teamMap,
  submitted,
  submissionCount,
  highlightWeek,
}: {
  m: Match;
  idx: number;
  teamMap: Map<string, string>;
  submitted: ScheduleMatchSubmitted | undefined;
  submissionCount: number;
  highlightWeek: boolean;
}) {
  const matchup = formatMatchup(m.team_a_id, m.team_b_id, teamMap);
  const stripe = idx % 2 === 1 ? "bg-[#f3f0e6]/70" : "bg-[#faf8f0]";

  const teamAName = m.team_a_id ? teamMap.get(m.team_a_id) ?? "—" : "—";
  const teamBName = m.team_b_id ? teamMap.get(m.team_b_id) ?? "—" : "—";

  const pts = submitted ? (
    <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-emerald-950 sm:text-sm">
      {formatPointsDisplay(submitted.a, submitted.b)}
    </span>
  ) : (
    <span className="font-mono text-sm text-emerald-800/35 sm:text-base">—</span>
  );

  const ins =
    m.team_a_id && m.team_b_id ? (
      <span
        className={`rounded-sm px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold tabular-nums sm:text-xs ${
          submissionCount >= 4
            ? "bg-emerald-100 text-emerald-950"
            : submissionCount > 0
              ? "bg-amber-100 text-amber-950"
              : "bg-zinc-100 text-zinc-600"
        }`}
      >
        {submissionCount}/4
      </span>
    ) : (
      <span className="text-zinc-400">—</span>
    );

  const actions =
    m.team_a_id && m.team_b_id ? (
      <div className="flex flex-wrap items-center justify-center gap-1.5 max-sm:justify-start sm:justify-center">
        {submitted || highlightWeek || submissionCount > 0 ? (
          <Link
            href={`/schedule/virtual-scorecard/${encodeURIComponent(m.id)}`}
            className="shrink-0 whitespace-nowrap rounded-sm border border-emerald-800/25 bg-white px-2 py-1 text-xs font-medium text-emerald-900 shadow-sm hover:bg-[#f4f1e8] sm:px-2.5"
          >
            View virtual
          </Link>
        ) : null}
        {submitted?.scorecardImageUrl ? (
          <a
            href={submitted.scorecardImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 whitespace-nowrap rounded-sm border border-emerald-800/25 bg-white px-2 py-1 text-xs font-medium text-emerald-900 shadow-sm hover:bg-[#f4f1e8] sm:px-2.5"
          >
            View card
          </a>
        ) : null}
        {!submitted ? (
          <Link
            href={`/submit-round?match=${encodeURIComponent(m.id)}`}
            className="shrink-0 rounded-sm border-2 border-emerald-800/40 bg-emerald-900 px-2 py-1.5 text-[0.65rem] font-semibold leading-none text-[#f5f2e8] shadow-sm hover:bg-emerald-950 sm:px-2.5 sm:py-1 sm:text-xs"
          >
            Enter
          </Link>
        ) : null}
      </div>
    ) : null;

  return (
    <li
      className={`border-b border-emerald-900/15 last:border-b-0 text-sm ${stripe}`}
    >
      <div className="sm:hidden px-3 py-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-emerald-900/70">Teams</div>
          <div className="text-right text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-emerald-900/70">
            Pts
          </div>
          <div className="min-w-0 text-sm font-medium leading-snug text-emerald-950">{teamAName}</div>
          <div className="border-l border-emerald-900/15 pl-3 text-right font-mono text-sm font-semibold tabular-nums text-emerald-950">
            {submitted ? formatLeaguePointValue(submitted.a) : "—"}
          </div>
          <div className="min-w-0 text-sm font-medium leading-snug text-emerald-950">{teamBName}</div>
          <div className="border-l border-emerald-900/15 pl-3 text-right font-mono text-sm font-semibold tabular-nums text-emerald-950">
            {submitted ? formatLeaguePointValue(submitted.b) : "—"}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-emerald-900/10 pt-3">
          <span className="text-xs text-zinc-700">
            <span className="mr-1.5 font-semibold uppercase tracking-wide text-emerald-900/75">In</span>
            {ins}
          </span>
          {actions}
        </div>
      </div>

      <div className={`${MATCH_ROW_DESKTOP} items-center text-sm`}>
        <span className="min-w-0 border-r border-emerald-900/15 px-3 py-2.5 text-sm font-medium leading-snug text-emerald-950">
          {matchup}
        </span>
        <div className="flex items-center justify-center border-r border-emerald-900/15 px-2 py-2.5">{pts}</div>
        <div className="flex items-center justify-center border-r border-emerald-900/15 px-1 py-2.5">{ins}</div>
        <div className="flex min-w-0 items-center justify-center px-3 py-2">{actions}</div>
      </div>
    </li>
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
