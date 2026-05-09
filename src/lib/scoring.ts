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

/** Same integer as nhgl._handicap_for_strokes / v_handicap_helper_summary (vs-par style). */
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
 * For match team net, pass the sum of the two partners’ effective handicaps as `handicapEff`.
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

export function holeNet(
  strokes: number,
  holes: CourseHole[],
  handicapEff: number,
  holeNumber: number,
): number {
  const str = strokesReceivedOnHole(holes, handicapEff, holeNumber);
  return strokes - str;
}

export function formatPointsDisplay(a: number, b: number): string {
  const fa = Number(a);
  const fb = Number(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return "—";
  const fmt = (n: number) => {
    const r = Math.round(n * 100) / 100;
    return r % 1 === 0 ? String(r) : r.toFixed(1);
  };
  return `${fmt(fa)} · ${fmt(fb)}`;
}
