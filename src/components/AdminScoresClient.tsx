"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatSeasonPhase } from "@/lib/nhgl";

type Row = {
  id: string;
  week_id: string;
  match_id: string;
  team_a_id: string;
  team_b_id: string;
  team_a_points: number;
  team_b_points: number;
  scorecard_image_url: string | null;
  notes: string | null;
  submitter_label: string | null;
  submitted_by_player_id: string | null;
  created_at: string;
  week_number: number;
  week_date: string;
  week_phase: string;
  matchup_label: string;
  submitter_player_name: string | null;
};

type WeekOption = {
  id: string;
  week_number: number;
  week_date: string;
  phase: string;
};

type PlayerOption = {
  id: string;
  name: string;
};

type HandicapRow = {
  id: string;
  player_id: string;
  player_name: string;
  played_date: string;
  score: number;
  par: number;
  handicap_at_submission: number | null;
  created_at: string;
};

type HandicapPlayerSummary = {
  player_id: string;
  player_name: string;
  handicap: number;
  rounds_in_avg: number;
};

function AccordionChevron({ group, className }: { group: "week" | "match"; className?: string }) {
  const openRotate =
    group === "week" ? "group-open/week:rotate-180" : "group-open/match:rotate-180";
  return (
    <svg
      className={`shrink-0 text-zinc-500 transition-transform duration-200 ${openRotate} ${className ?? ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      width={group === "week" ? 20 : 18}
      height={group === "week" ? 20 : 18}
    >
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function groupByWeek(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const list = map.get(r.week_id) ?? [];
    list.push(r);
    map.set(r.week_id, list);
  }
  return [...map.entries()]
    .map(([weekId, list]) => {
      const first = list[0]!;
      return {
        weekId,
        week_number: first.week_number,
        week_date: first.week_date,
        week_phase: first.week_phase,
        rows: [...list].sort((a, b) => a.matchup_label.localeCompare(b.matchup_label)),
      };
    })
    .sort((a, b) => a.week_number - b.week_number);
}

function formatVersusParHandicap(diff: number): string {
  if (!Number.isFinite(diff)) return "—";
  if (diff === 0) return "0";
  if (diff < 0) return `+${Math.abs(diff)}`;
  return String(diff);
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AdminScoresClient() {
  const [secret, setSecret] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [handicapRows, setHandicapRows] = useState<HandicapRow[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [cleanupWeekId, setCleanupWeekId] = useState("");
  const [recomputeWeekId, setRecomputeWeekId] = useState("");
  const [selectedHandicapPlayerId, setSelectedHandicapPlayerId] = useState<string | null>(null);
  const [editingHandicapRowId, setEditingHandicapRowId] = useState<string | null>(null);
  const [deletingHandicapRowId, setDeletingHandicapRowId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [skinsBuyinDraft, setSkinsBuyinDraft] = useState("");
  const [adminCourses, setAdminCourses] = useState<{ id: string; name: string }[]>([]);
  const [adminCourseId, setAdminCourseId] = useState("");
  type HoleDraft = { hole_number: number; par: string; stroke_index: string };
  const [holeDrafts, setHoleDrafts] = useState<HoleDraft[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingHoles, setSavingHoles] = useState(false);
  const [recomputingWeek, setRecomputingWeek] = useState(false);

  const authHeader = useCallback(() => {
    return { Authorization: `Bearer ${secret}` };
  }, [secret]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/scores", { headers: authHeader() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setRows(json.data as Row[]);
      setHandicapRows((json.handicap_scores as HandicapRow[] | undefined) ?? []);
      setPlayers((json.players as PlayerOption[] | undefined) ?? []);
      setWeeks((json.weeks as WeekOption[] | undefined) ?? []);

      const [lsRes, courseRes] = await Promise.all([
        fetch("/api/admin/league-settings", { headers: authHeader() }),
        fetch("/api/admin/courses", { headers: authHeader() }),
      ]);
      const lsJson = await lsRes.json();
      if (lsRes.ok && Array.isArray(lsJson.data)) {
        const amt = (lsJson.data as { key: string; value: string }[]).find((x) => x.key === "skins_buyin_amount")
          ?.value;
        if (amt != null) setSkinsBuyinDraft(String(amt));
      }
      const cJson = await courseRes.json();
      if (courseRes.ok && Array.isArray(cJson.courses)) {
        const courses = cJson.courses as { id: string; name: string }[];
        setAdminCourses(courses);
        const pick =
          courses.find((c) => c.name.toLowerCase().includes("hickory")) ?? courses[0] ?? null;
        if (pick) {
          setAdminCourseId(pick.id);
          const hr = await fetch(`/api/admin/courses/${pick.id}`, { headers: authHeader() });
          const hj = await hr.json();
          if (hr.ok && Array.isArray(hj.holes)) {
            setHoleDrafts(
              (hj.holes as { hole_number: number; par: number; stroke_index: number }[]).map((h) => ({
                hole_number: h.hole_number,
                par: String(h.par),
                stroke_index: String(h.stroke_index),
              })),
            );
          }
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setRows(null);
      setHandicapRows([]);
      setPlayers([]);
      setWeeks([]);
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  async function removeHandicapRound(row: HandicapRow) {
    if (
      !confirm(
        "Delete this handicap helper round? If it was submitted as a league round, the hole-by-hole scores for that match are removed too.",
      )
    ) {
      return;
    }
    setDeletingHandicapRowId(row.id);
    setErr("");
    try {
      const res = await fetch(`/api/admin/handicap-helper/${row.id}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Delete failed");
        return;
      }
      setEditingHandicapRowId(null);
      await load();
    } finally {
      setDeletingHandicapRowId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this submission?")) return;
    const res = await fetch(`/api/admin/scores/${id}`, {
      method: "DELETE",
      headers: authHeader(),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? "Delete failed");
      return;
    }
    await load();
  }

  async function recomputeWeek() {
    if (!recomputeWeekId) return;
    if (!confirm("Recompute skins + match scores for this week using the saved handicap snapshots?")) return;
    setRecomputingWeek(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/week-recompute", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ week_id: recomputeWeekId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Recompute failed");
        return;
      }
      await load();
    } finally {
      setRecomputingWeek(false);
    }
  }

  const weekGroups = useMemo(() => (rows ? groupByWeek(rows) : []), [rows]);
  const handicapSummary = useMemo<HandicapPlayerSummary[]>(() => {
    const byPlayer = new Map<string, HandicapRow[]>();
    for (const row of handicapRows) {
      const list = byPlayer.get(row.player_id) ?? [];
      list.push(row);
      byPlayer.set(row.player_id, list);
    }
    return [...byPlayer.entries()]
      .map(([player_id, list]) => {
        const sorted = [...list].sort((a, b) => {
          const d = b.played_date.localeCompare(a.played_date);
          if (d !== 0) return d;
          return b.created_at.localeCompare(a.created_at);
        });
        const latest = sorted.slice(0, 5);
        const avgDiff =
          latest.reduce((sum, r) => sum + (Number(r.score) - Number(r.par)), 0) / Math.max(latest.length, 1);
        return {
          player_id,
          player_name: list[0]?.player_name ?? "Unknown player",
          handicap: Math.round(avgDiff * 0.8),
          rounds_in_avg: latest.length,
        };
      })
      .sort((a, b) => {
        const d = a.handicap - b.handicap;
        if (d !== 0) return d;
        return a.player_name.localeCompare(b.player_name, undefined, { sensitivity: "base" });
      });
  }, [handicapRows]);

  const selectedHandicapPlayer = useMemo(
    () => handicapSummary.find((p) => p.player_id === selectedHandicapPlayerId) ?? null,
    [handicapSummary, selectedHandicapPlayerId],
  );

  const selectedHandicapRows = useMemo(() => {
    if (!selectedHandicapPlayerId) return [];
    return handicapRows
      .filter((r) => r.player_id === selectedHandicapPlayerId)
      .sort((a, b) => {
        const d = b.played_date.localeCompare(a.played_date);
        if (d !== 0) return d;
        return b.created_at.localeCompare(a.created_at);
      });
  }, [handicapRows, selectedHandicapPlayerId]);

  useEffect(() => {
    if (handicapSummary.length === 0) {
      setSelectedHandicapPlayerId(null);
      setEditingHandicapRowId(null);
      return;
    }
    if (!selectedHandicapPlayerId || !handicapSummary.some((p) => p.player_id === selectedHandicapPlayerId)) {
      setSelectedHandicapPlayerId(handicapSummary[0]?.player_id ?? null);
      setEditingHandicapRowId(null);
    }
  }, [handicapSummary, selectedHandicapPlayerId]);

  async function refreshChampionship() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/championship", {
        method: "POST",
        headers: authHeader(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      alert("Championship match updated to top two teams by Regular Season points.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveSkinsBuyin() {
    setSavingSettings(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/league-settings", {
        method: "PUT",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ skins_buyin_amount: skinsBuyinDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      alert("Skins buy-in amount saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveCourseHoles() {
    if (!adminCourseId) return;
    setSavingHoles(true);
    setErr("");
    try {
      const holes = holeDrafts.map((h) => ({
        hole_number: Number(h.hole_number),
        par: Number(h.par),
        stroke_index: Number(h.stroke_index),
      }));
      const res = await fetch(`/api/admin/courses/${encodeURIComponent(adminCourseId)}/holes`, {
        method: "PUT",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ holes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      alert("Course holes saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingHoles(false);
    }
  }

  async function cleanupTestWeek() {
    if (!cleanupWeekId) {
      setErr("Choose a week.");
      return;
    }
    if (
      !confirm(
        "Remove player rounds, scorecards, handicap helper rows for that league date, score submissions, and the full skins bundle for this week? This cannot be undone.",
      )
    ) {
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/week-cleanup", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ week_id: cleanupWeekId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      await load();
      setCleanupWeekId("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <div className="rounded-lg border border-amber-800/20 bg-amber-50/80 p-4 text-sm text-amber-950">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="sr-only" htmlFor="admin-secret">
              League admin secret
            </label>
            <input
              id="admin-secret"
              type="password"
              className="w-full max-w-md rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading || !secret}
            className="min-h-[44px] rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load submissions"}
          </button>
        </div>
        {rows !== null ? (
          <div className="mt-4 w-full space-y-4 border-t border-amber-800/15 pt-4">
            <div>
              <button
                type="button"
                onClick={refreshChampionship}
                disabled={loading || !secret}
                className="rounded-md border border-emerald-800 bg-white px-4 py-2 text-sm font-medium text-emerald-900 disabled:opacity-50"
              >
                Set championship to top 2
              </button>
            </div>
            <div className="rounded-md border border-zinc-200 bg-white/80 p-3 space-y-3">
              <p className="text-sm font-medium text-zinc-900">Skins buy-in (each player)</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
                  Amount ($)
                  <input
                    type="text"
                    inputMode="decimal"
                    className="w-32 rounded border border-zinc-300 px-2 py-1.5 text-sm"
                    value={skinsBuyinDraft}
                    onChange={(e) => setSkinsBuyinDraft(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={savingSettings || !secret}
                  className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-white disabled:opacity-50"
                  onClick={() => void saveSkinsBuyin()}
                >
                  {savingSettings ? "Saving…" : "Save buy-in"}
                </button>
              </div>
            </div>
            <div className="rounded-md border border-zinc-200 bg-white/80 p-3 space-y-3">
              <p className="text-sm font-medium text-zinc-900">Course holes</p>
              <label className="block text-xs text-zinc-600">
                Course
                <select
                  className="mt-1 block w-full max-w-md rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  value={adminCourseId}
                  onChange={async (e) => {
                    const id = e.target.value;
                    setAdminCourseId(id);
                    const hr = await fetch(`/api/admin/courses/${encodeURIComponent(id)}`, {
                      headers: authHeader(),
                    });
                    const hj = await hr.json();
                    if (hr.ok && Array.isArray(hj.holes)) {
                      setHoleDrafts(
                        (hj.holes as { hole_number: number; par: number; stroke_index: number }[]).map((h) => ({
                          hole_number: h.hole_number,
                          par: String(h.par),
                          stroke_index: String(h.stroke_index),
                        })),
                      );
                    }
                  }}
                >
                  {adminCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {holeDrafts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-700">
                        <th className="px-2 py-1">Hole</th>
                        <th className="px-2 py-1">Par</th>
                        <th className="px-2 py-1">Stroke idx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {holeDrafts.map((h, idx) => (
                        <tr key={h.hole_number} className="border-b border-zinc-100">
                          <td className="px-2 py-1 font-mono">{h.hole_number}</td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min={3}
                              max={6}
                              className="w-16 rounded border border-zinc-300 px-1 py-0.5"
                              value={h.par}
                              onChange={(e) => {
                                const next = [...holeDrafts];
                                next[idx] = { ...next[idx]!, par: e.target.value };
                                setHoleDrafts(next);
                              }}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min={1}
                              max={18}
                              className="w-16 rounded border border-zinc-300 px-1 py-0.5"
                              value={h.stroke_index}
                              onChange={(e) => {
                                const next = [...holeDrafts];
                                next[idx] = { ...next[idx]!, stroke_index: e.target.value };
                                setHoleDrafts(next);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">Load submissions first to fetch course data.</p>
              )}
              <button
                type="button"
                disabled={savingHoles || !secret || !adminCourseId || holeDrafts.length === 0}
                className="rounded-md bg-emerald-800 px-3 py-2 text-sm text-white disabled:opacity-50"
                onClick={() => void saveCourseHoles()}
              >
                {savingHoles ? "Saving…" : "Save course holes"}
              </button>
            </div>
            <div className="rounded-md border border-zinc-200 bg-white/80 p-3">
              <p className="text-sm font-medium text-zinc-900">Recompute skins + match scores for one week</p>
              <p className="mt-1 text-xs text-zinc-600">
                Use after changing saved handicaps to refresh the week&apos;s skins results and matchup points.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
                  Week
                  <select
                    className="min-w-[14rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                    value={recomputeWeekId}
                    onChange={(e) => setRecomputeWeekId(e.target.value)}
                  >
                    <option value="">Select week</option>
                    {weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        Week {w.week_number} — {formatSeasonPhase(w.phase)} ({w.week_date})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={recomputeWeek}
                  disabled={loading || recomputingWeek || !secret || !recomputeWeekId}
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {recomputingWeek ? "Recomputing…" : "Recompute week"}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-zinc-200 bg-white/80 p-3">
              <p className="text-sm font-medium text-zinc-900">Test cleanup (scores + skins for one week)</p>
              <p className="mt-1 text-xs text-zinc-600">
                Clears per-player rounds (hole scores), matchup scorecards, handicap helper rows for that Tuesday&apos;s
                date, match score rows, and the skins submission for the chosen week. Does not delete scorecard image
                files in Storage.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-xs text-zinc-600">
                  Week
                  <select
                    className="min-w-[14rem] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                    value={cleanupWeekId}
                    onChange={(e) => setCleanupWeekId(e.target.value)}
                  >
                    <option value="">Select week</option>
                    {weeks.map((w) => (
                      <option key={w.id} value={w.id}>
                        Week {w.week_number} — {formatSeasonPhase(w.phase)} ({w.week_date})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={cleanupTestWeek}
                  disabled={loading || !secret || !cleanupWeekId}
                  className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                >
                  Remove scores + skins for week
                </button>
              </div>
              <details className="mt-3 text-xs text-zinc-500">
                <summary className="cursor-pointer text-zinc-600">Manual cleanup steps</summary>
                <ul className="mt-2 list-inside list-disc space-y-1 pl-1">
                  <li>
                    <strong>Admin (above):</strong> choose the week and use &quot;Remove scores + skins for week&quot;.
                  </li>
                  <li>
                    <strong>Scores only:</strong> load submissions below and use Delete on each row.
                  </li>
                  <li>
                    <strong>Supabase SQL:</strong> for week UUID <code className="rounded bg-zinc-100 px-0.5">$week</code>
                    , delete from <code className="rounded bg-zinc-100 px-0.5">nhgl.score_submissions</code>,{" "}
                    <code className="rounded bg-zinc-100 px-0.5">skins_hole_wins</code>,{" "}
                    <code className="rounded bg-zinc-100 px-0.5">skins_buyins</code>,{" "}
                    <code className="rounded bg-zinc-100 px-0.5">skins_week_payouts</code>, then{" "}
                    <code className="rounded bg-zinc-100 px-0.5">skins_week_results</code> where{" "}
                    <code className="rounded bg-zinc-100 px-0.5">week_id</code> matches.
                  </li>
                  <li>
                    <strong>Storage:</strong> remove leftover scorecard images from the{" "}
                    <code className="rounded bg-zinc-100 px-0.5">nhgl-scorecards</code> bucket in the Supabase
                    dashboard if you care about orphaned files.
                  </li>
                </ul>
              </details>
            </div>
          </div>
        ) : null}
      </div>

      {err && <p className="text-red-700">{err}</p>}

      {rows && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-emerald-950">Handicap helper scores</h2>
            <p className="text-sm text-zinc-600">Click a player to view submitted scores and edit each row.</p>
            <div className="overflow-hidden rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]">
              <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2 text-center">
                <span className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-emerald-900/65">
                  9-hole handicap leaderboard
                </span>
              </div>
              <div className="overflow-x-auto">
                {handicapSummary.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-emerald-900/70">No handicap helper scores found.</p>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
                        <th className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                          Player
                        </th>
                        <th className="w-24 px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">
                          Handicap
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {handicapSummary.map((p, i) => (
                        <tr
                          key={p.player_id}
                          className={`cursor-pointer border-b border-emerald-900/15 last:border-b-0 ${
                            i % 2 === 1 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"
                          } ${selectedHandicapPlayerId === p.player_id ? "ring-2 ring-inset ring-emerald-700/40" : ""}`}
                          onClick={() => {
                            setSelectedHandicapPlayerId(p.player_id);
                            setEditingHandicapRowId(null);
                          }}
                        >
                          <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">
                            {p.player_name}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums text-emerald-950">
                            {formatVersusParHandicap(p.handicap)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {selectedHandicapPlayer ? (
              <div className="rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] p-3 shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]">
                <div className="flex items-center justify-between gap-2 border-b border-emerald-900/20 pb-2">
                  <div>
                    <h3 className="text-base font-semibold text-emerald-950">{selectedHandicapPlayer.player_name}</h3>
                    <p className="text-xs text-emerald-900/70">
                      Handicap {formatVersusParHandicap(selectedHandicapPlayer.handicap)} (based on{" "}
                      {selectedHandicapPlayer.rounds_in_avg} round
                      {selectedHandicapPlayer.rounds_in_avg === 1 ? "" : "s"})
                    </p>
                  </div>
                </div>
                {selectedHandicapRows.length === 0 ? (
                  <p className="mt-3 text-sm text-zinc-600">No scores for this player.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {selectedHandicapRows.map((r) => (
                      <li key={r.id} className="rounded-md border border-emerald-900/15 bg-white/70 p-3">
                        {editingHandicapRowId === r.id ? (
                          <HandicapScoreEditor
                            row={r}
                            players={players}
                            deleteBusy={deletingHandicapRowId !== null}
                            isDeleting={deletingHandicapRowId === r.id}
                            onDelete={() => void removeHandicapRound(r)}
                            onCancel={() => setEditingHandicapRowId(null)}
                            onError={setErr}
                            onSave={async (draft) => {
                              const res = await fetch(`/api/admin/handicap-helper/${draft.id}`, {
                                method: "PATCH",
                                headers: { ...authHeader(), "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  player_id: draft.player_id,
                                  played_date: draft.played_date,
                                  score: draft.score,
                                  par: draft.par,
                                  handicap_at_submission: draft.handicap_at_submission,
                                }),
                              });
                              const json = await res.json();
                              if (!res.ok) {
                                setErr(json.error ?? "Save failed");
                                return;
                              }
                              setErr("");
                              setEditingHandicapRowId(null);
                              await load();
                            }}
                          />
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-medium text-emerald-950">{formatDate(r.played_date)}</span>
                              <span className="font-mono tabular-nums text-zinc-700">
                                Score {r.score} / Par {r.par}
                              </span>
                              <span className="font-mono tabular-nums text-emerald-900">
                                Vs par {formatVersusParHandicap(r.score - r.par)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded border border-emerald-700 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                                disabled={deletingHandicapRowId !== null}
                                onClick={() => setEditingHandicapRowId(r.id)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="rounded border border-red-300 bg-red-50 px-3 py-1 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
                                disabled={deletingHandicapRowId !== null}
                                onClick={() => void removeHandicapRound(r)}
                              >
                                {deletingHandicapRowId === r.id ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

          <div className="space-y-3">
          {weekGroups.map((g) => (
            <details
              key={g.weekId}
              className="group/week rounded-lg border border-zinc-200 bg-white shadow-sm open:shadow-md"
            >
              <summary className="cursor-pointer list-none rounded-lg px-4 py-3 font-medium text-emerald-950 marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <AccordionChevron group="week" />
                    <span>
                      Week {g.week_number} — {formatSeasonPhase(g.week_phase)} ({g.week_date})
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-normal text-zinc-500">
                    {g.rows.length} match{g.rows.length === 1 ? "" : "es"}
                  </span>
                </span>
              </summary>
              <div className="border-t border-zinc-100 px-2 py-2">
                <ul className="space-y-2">
                  {g.rows.map((r) => (
                    <li key={r.id} className="rounded-md border border-zinc-100 bg-zinc-50/80">
                      <details className="group/match rounded-md">
                        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-zinc-900 marker:hidden [&::-webkit-details-marker]:hidden">
                          <span className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              <AccordionChevron group="match" />
                              <span className="truncate">{r.matchup_label}</span>
                            </span>
                            <span className="shrink-0 tabular-nums text-xs font-normal text-zinc-500">
                              {r.team_a_points}–{r.team_b_points}
                            </span>
                          </span>
                        </summary>
                        <div className="border-t border-zinc-100 bg-white px-3 py-3">
                          <ScoreRowEditor
                            row={r}
                            authHeader={authHeader}
                            onSave={async (draft) => {
                              const sum = Number(draft.team_a_points) + Number(draft.team_b_points);
                              if (Math.abs(sum - 10) > 0.001) {
                                setErr("Points must sum to 10.");
                                return;
                              }
                              const res = await fetch(`/api/admin/scores/${draft.id}`, {
                                method: "PATCH",
                                headers: { ...authHeader(), "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  team_a_points: draft.team_a_points,
                                  team_b_points: draft.team_b_points,
                                  notes: draft.notes,
                                  submitter_label: draft.submitter_label,
                                }),
                              });
                              const json = await res.json();
                              if (!res.ok) {
                                setErr(json.error ?? "Save failed");
                                return;
                              }
                              setErr("");
                              await load();
                            }}
                            onDelete={() => remove(r.id)}
                            onScorecardReplaced={() => {
                              setErr("");
                              return load();
                            }}
                            onError={setErr}
                          />
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HandicapScoreEditor({
  row,
  players,
  onSave,
  onCancel,
  onDelete,
  onError,
  deleteBusy,
  isDeleting,
}: {
  row: HandicapRow;
  players: PlayerOption[];
  onSave: (row: HandicapRow) => Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
  onError: (msg: string) => void;
  deleteBusy: boolean;
  isDeleting: boolean;
}) {
  const [draft, setDraft] = useState(row);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(row);
  }, [row]);

  const hasChanges =
    draft.player_id !== row.player_id ||
    draft.played_date !== row.played_date ||
    draft.score !== row.score ||
    draft.par !== row.par ||
    draft.handicap_at_submission !== row.handicap_at_submission;

  return (
    <div className="space-y-2 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          Player
          <select
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            value={draft.player_id}
            onChange={(e) => setDraft({ ...draft, player_id: e.target.value })}
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Date
          <input
            type="date"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            value={draft.played_date}
            onChange={(e) => setDraft({ ...draft, played_date: e.target.value })}
          />
        </label>
        <label className="block">
          Score
          <input
            type="number"
            min={18}
            max={200}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            value={draft.score}
            onChange={(e) => setDraft({ ...draft, score: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <label className="block w-28">
          Par
          <input
            type="number"
            min={18}
            max={144}
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            value={draft.par}
            onChange={(e) => setDraft({ ...draft, par: Number(e.target.value) })}
          />
        </label>
          <label className="block w-36">
            Saved handicap
            <input
              type="number"
              min={0}
              max={99}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
              value={draft.handicap_at_submission ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  handicap_at_submission: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-50"
            disabled={deleteBusy || saving}
            onClick={onDelete}
          >
            {isDeleting ? "Deleting…" : "Delete round"}
          </button>
          <button
            type="button"
            className="rounded border border-zinc-300 px-3 py-1.5 text-zinc-700 disabled:opacity-50"
            disabled={deleteBusy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !hasChanges || deleteBusy}
            className="rounded bg-emerald-800 px-3 py-1.5 text-white disabled:opacity-50"
            onClick={async () => {
              onError("");
              setSaving(true);
              try {
                await onSave(draft);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScoreRowEditor({
  row,
  authHeader,
  onSave,
  onDelete,
  onScorecardReplaced,
  onError,
}: {
  row: Row;
  authHeader: () => { Authorization: string };
  onSave: (r: Row) => Promise<void>;
  onDelete: () => void;
  onScorecardReplaced: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [draft, setDraft] = useState(row);
  const [replacing, setReplacing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(row);
  }, [row]);

  async function onReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || file.size === 0) return;
    if (!file.type.startsWith("image/")) {
      onError("Please choose an image file.");
      return;
    }
    setReplacing(true);
    onError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/admin/scores/${row.id}/scorecard`, {
        method: "POST",
        headers: authHeader(),
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      await onScorecardReplaced();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Replace failed");
    } finally {
      setReplacing(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
        <span>
          Submission: {row.id}
          <span className="text-zinc-400"> · match {row.match_id}</span>
        </span>
        <span>{new Date(row.created_at).toLocaleString()}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          Team A points
          <input
            type="number"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            value={draft.team_a_points}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDraft({
                ...draft,
                team_a_points: v,
                team_b_points: 10 - v,
              });
            }}
          />
        </label>
        <label className="block">
          Team B points
          <input
            type="number"
            className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
            value={draft.team_b_points}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDraft({
                ...draft,
                team_b_points: v,
                team_a_points: 10 - v,
              });
            }}
          />
        </label>
      </div>
      <label className="block">
        Notes
        <textarea
          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          rows={2}
          value={draft.notes ?? ""}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
        />
      </label>
      <label className="block">
        Submitter label
        <input
          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
          value={draft.submitter_label ?? ""}
          onChange={(e) => setDraft({ ...draft, submitter_label: e.target.value || null })}
        />
      </label>
      {row.submitted_by_player_id && (
        <div className="rounded border border-zinc-100 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
          <span className="text-zinc-500">Submitted by player: </span>
          {row.submitter_player_name ?? "—"} <span className="text-zinc-400">({row.submitted_by_player_id})</span>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-600">Scorecard image</p>
        {draft.scorecard_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={draft.scorecard_image_url}
            alt="Scorecard"
            className="max-h-56 max-w-full rounded border border-zinc-200 object-contain"
          />
        ) : (
          <p className="text-xs text-zinc-500">No scorecard uploaded.</p>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onReplaceFile} />
        <button
          type="button"
          disabled={replacing}
          className="rounded-md border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
        >
          {replacing ? "Uploading…" : draft.scorecard_image_url ? "Replace scorecard image" : "Upload scorecard image"}
        </button>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className="rounded bg-emerald-800 px-3 py-1.5 text-white"
          onClick={() => onSave(draft)}
        >
          Save
        </button>
        <button type="button" className="rounded border border-red-300 px-3 py-1.5 text-red-800" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
