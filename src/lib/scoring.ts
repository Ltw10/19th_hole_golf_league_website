/**
 * Mirrors nhgl stroke allocation and scoring helpers for UI previews.
 * Source of truth for league calculations is Postgres (submit_player_round RPC).
 */

export type CourseHole = {
  hole_number: number;
  par: number;
  stroke_index: number;
};

export type ScoreRow = {
  played_date: string;
  score: number;
  par: number;
  created_at?: string;
};

/** Uses frozen `handicap_at_submission` when present (same rule as Postgres match recompute). */
export function effectiveHandicapForRound(
  snapshot: number | null | undefined,
  rows: ScoreRow[],
  excludePlayedDate?: string,
): number {
  if (snapshot !== null && snapshot !== undefined) {
    return Math.max(0, Math.round(snapshot));
  }
  return handicapFromScores(rows, excludePlayedDate);
}

/** Same integer as nhgl._handicap_for_strokes / v_handicap_helper_summary (vs-par style). */
export function handicapFromScores(rows: ScoreRow[], excludePlayedDate?: string): number {
  const filtered = excludePlayedDate
    ? rows.filter((r) => r.played_date !== excludePlayedDate)
    : rows;
  const sorted = [...filtered].sort((a, b) => {
    const d = b.played_date.localeCompare(a.played_date);
    if (d !== 0) return d;
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    return cb.localeCompare(ca);
  });
  const last5 = sorted.slice(0, 5);
  if (last5.length === 0) return 0;
  const avg = last5.reduce((s, r) => s + (r.score - r.par), 0) / last5.length;
  return Math.round(avg * 0.8);
}

/**
 * `holes` must be exactly the nine holes being played (1–9 or 10–18).
 */
export function strokesReceivedOnHole(
  holes: CourseHole[],
  handicapEff: number,
  holeNumber: number,
): number {
  const hEff = Math.max(0, Math.round(handicapEff));
  const base = Math.floor(hEff / 9);
  const extra = hEff % 9;
  if (extra === 0) return base;
  const hole = holes.find((x) => x.hole_number === holeNumber);
  if (!hole) return base;
  const lower = holes.filter((x) => x.stroke_index < hole.stroke_index).length;
  return lower < extra ? base + 1 : base;
}

/** Match play: spread only |team A − team B| across the nine (same allocation rule); higher-handicap team receives those strokes on each hole. */
export function strokesFromTeamHandicapDiffOnHole(
  holes: CourseHole[],
  teamHcpA: number,
  teamHcpB: number,
  holeNumber: number,
): { strokesA: number; strokesB: number } {
  const a = Math.max(0, Math.round(teamHcpA));
  const b = Math.max(0, Math.round(teamHcpB));
  const d = a - b;
  const mag = Math.abs(d);
  if (mag === 0) return { strokesA: 0, strokesB: 0 };
  const onHole = strokesReceivedOnHole(holes, mag, holeNumber);
  if (d > 0) return { strokesA: onHole, strokesB: 0 };
  return { strokesA: 0, strokesB: onHole };
}

export function holeNet(
  strokes: number,
  holes: CourseHole[],
  handicapEff: number,
  holeNumber: number,
): number {
  const str = strokesReceivedOnHole(holes, handicapEff, holeNumber);
  return strokes - str;
}

/** One team's league points (half-point allowed). */
export function formatLeaguePointValue(n: unknown): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const r = Math.round(x * 100) / 100;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

export function formatPointsDisplay(a: number, b: number): string {
  const aS = formatLeaguePointValue(a);
  const bS = formatLeaguePointValue(b);
  if (aS === "—" || bS === "—") return "—";
  return `${aS} · ${bS}`;
}

export const SKINS_STANDARD_RULES = [
  "Lowest net score on a hole wins the skin when that net is unique.",
  "If three or more players share the low net, or everyone ties at the low net with two or more players, no skin is awarded on that hole.",
] as const;

export const SKINS_GROSS_OVER_NET_TIEBREAK_RULE =
  "When exactly two players tie for the lowest net on a hole and one played straight up (no handicap strokes on that hole) while the other received one or more strokes, the straight-up gross score wins the skin. This does not apply when three or more players share the low net, or when both tied players received strokes on the hole.";

export type SkinsHolePlayerScore = {
  player_id: string;
  net: number;
  strokesOnHole: number;
};

export type SkinsHoleResolution =
  | { kind: "none" }
  | { kind: "skin"; winnerPlayerIds: [string] }
  | { kind: "tie" }
  | { kind: "gross_tiebreak"; winnerPlayerIds: [string] };

/** Mirrors nhgl._recompute_skins_for_week hole winner logic for UI previews. */
export function resolveSkinsHole(scores: SkinsHolePlayerScore[]): SkinsHoleResolution {
  if (scores.length === 0) return { kind: "none" };
  const lowestNet = Math.min(...scores.map((s) => s.net));
  const tied = scores.filter((s) => s.net === lowestNet);
  if (tied.length === 1) {
    return { kind: "skin", winnerPlayerIds: [tied[0].player_id] };
  }
  if (tied.length === 2) {
    const straightUp = tied.filter((s) => s.strokesOnHole === 0);
    const withStrokes = tied.filter((s) => s.strokesOnHole > 0);
    if (straightUp.length === 1 && withStrokes.length === 1) {
      return { kind: "gross_tiebreak", winnerPlayerIds: [straightUp[0].player_id] };
    }
  }
  return { kind: "tie" };
}
