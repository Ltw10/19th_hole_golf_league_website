"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LooseNullableIntInput, LooseNumberInput } from "@/components/LooseNumberInput";
import { formatSeasonPhase } from "@/lib/nhgl";

type PlayerRoundAdmin = {
  id: string;
  week_id: string;
  match_id: string;
  player_id: string;
  player_name: string;
  played_for_team_id: string;
  team_name: string;
  played_skins: boolean;
  which_nine: string | null;
  handicap_at_submission: number | null;
  holes: { hole_number: number; strokes: number }[];
};

const EMPTY_PLAYER_ROUNDS: PlayerRoundAdmin[] = [];

type MatchRoundsDraft = {
  player_round_id: string;
  played_skins: boolean;
  holes: { hole_number: number; strokes: number }[];
};

type InProgressMatchup = {
  match_id: string;
  week_id: string;
  team_a_id: string;
  team_b_id: string;
  week_number: number;
  week_date: string;
  week_phase: string;
  matchup_label: string;
  players_in: number;
};

type WeekMatchupGroup = {
  weekId: string;
  week_number: number;
  week_date: string;
  week_phase: string;
  finalized: Row[];
  inProgress: InProgressMatchup[];
};

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
  team_id: string;
  team_name: string;
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

function buildWeekMatchupGroups(finalized: Row[], inProgress: InProgressMatchup[]): WeekMatchupGroup[] {
  const map = new Map<string, WeekMatchupGroup>();
  for (const r of finalized) {
    const existing = map.get(r.week_id);
    if (existing) {
      existing.finalized.push(r);
    } else {
      map.set(r.week_id, {
        weekId: r.week_id,
        week_number: r.week_number,
        week_date: r.week_date,
        week_phase: r.week_phase,
        finalized: [r],
        inProgress: [],
      });
    }
  }
  for (const m of inProgress) {
    const existing = map.get(m.week_id);
    if (existing) {
      existing.inProgress.push(m);
    } else {
      map.set(m.week_id, {
        weekId: m.week_id,
        week_number: m.week_number,
        week_date: m.week_date,
        week_phase: m.week_phase,
        finalized: [],
        inProgress: [m],
      });
    }
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      finalized: [...g.finalized].sort((a, b) => a.matchup_label.localeCompare(b.matchup_label)),
      inProgress: [...g.inProgress].sort((a, b) => a.matchup_label.localeCompare(b.matchup_label)),
    }))
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

function allowedNine(whichNine: string | null): number[] {
  const side = whichNine?.toLowerCase() === "back" ? "back" : "front";
  return side === "back" ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
}

function normalizeHolesDraft(
  whichNine: string | null,
  holes: { hole_number: number; strokes: number }[],
): { hole_number: number; strokes: number }[] {
  const allowed = allowedNine(whichNine);
  const by = new Map(holes.map((h) => [h.hole_number, h.strokes]));
  return allowed.map((hn) => ({ hole_number: hn, strokes: by.get(hn) ?? 4 }));
}

function buildMatchDrafts(rounds: PlayerRoundAdmin[]): MatchRoundsDraft[] {
  return rounds.map((row) => ({
    player_round_id: row.id,
    played_skins: row.played_skins,
    holes: normalizeHolesDraft(row.which_nine, row.holes),
  }));
}

export function AdminScoresClient() {
  const [secret, setSecret] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [inProgressMatchups, setInProgressMatchups] = useState<InProgressMatchup[]>([]);
  const [matchPlayerRoundsByMatch, setMatchPlayerRoundsByMatch] = useState<Record<string, PlayerRoundAdmin[]>>({});
  const [handicapRows, setHandicapRows] = useState<HandicapRow[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [cleanupWeekId, setCleanupWeekId] = useState("");
  const [recomputeWeekId, setRecomputeWeekId] = useState("");
  const [selectedHandicapPlayerId, setSelectedHandicapPlayerId] = useState<string | null>(null);
  const [editingHandicapRowId, setEditingHandicapRowId] = useState<string | null>(null);
  const [deletingHandicapRowId, setDeletingHandicapRowId] = useState<string | null>(null);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [draftPlayerName, setDraftPlayerName] = useState("");
  const [savingPlayerId, setSavingPlayerId] = useState<string | null>(null);
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

  type AdminTaskView =
    | "menu"
    | "championship"
    | "skins-buyin"
    | "course-holes"
    | "recompute-week"
    | "week-cleanup"
    | "handicap-helper"
    | "matchup-scores";

  const [adminTaskView, setAdminTaskView] = useState<AdminTaskView>("menu");

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
      setInProgressMatchups((json.in_progress_matchups as InProgressMatchup[] | undefined) ?? []);
      setMatchPlayerRoundsByMatch((json.match_player_rounds as Record<string, PlayerRoundAdmin[]> | undefined) ?? {});
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
      setInProgressMatchups([]);
      setMatchPlayerRoundsByMatch({});
      setHandicapRows([]);
      setPlayers([]);
      setWeeks([]);
      setAdminTaskView("menu");
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

  async function savePlayerName(playerId: string) {
    const trimmed = draftPlayerName.trim();
    if (!trimmed) {
      setErr("Name cannot be empty.");
      return;
    }
    setSavingPlayerId(playerId);
    setErr("");
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? "Save failed");
        return;
      }
      setEditingPlayerId(null);
      await load();
    } finally {
      setSavingPlayerId(null);
    }
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

  const weekGroups = useMemo(
    () => (rows ? buildWeekMatchupGroups(rows, inProgressMatchups) : []),
    [rows, inProgressMatchups],
  );
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

  const selectedPlayerRoster = useMemo(
    () => players.find((p) => p.id === selectedHandicapPlayerId) ?? null,
    [players, selectedHandicapPlayerId],
  );

  useEffect(() => {
    if (handicapSummary.length === 0) {
      setSelectedHandicapPlayerId(null);
      setEditingHandicapRowId(null);
      setEditingPlayerId(null);
      return;
    }
    if (!selectedHandicapPlayerId || !handicapSummary.some((p) => p.player_id === selectedHandicapPlayerId)) {
      setSelectedHandicapPlayerId(handicapSummary[0]?.player_id ?? null);
      setEditingHandicapRowId(null);
      setEditingPlayerId(null);
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
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (loading || !secret.trim()) return;
                void load();
              }}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !secret.trim()}
            className="min-h-[44px] rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Loading…" : "Enter"}
          </button>
        </div>
        {rows !== null ? (
          <div className="mt-4 w-full space-y-4 border-t border-amber-800/15 pt-4">
            {adminTaskView !== "menu" ? (
              <button
                type="button"
                onClick={() => setAdminTaskView("menu")}
                className="text-sm font-medium text-emerald-900 underline underline-offset-2 hover:text-emerald-950"
              >
                ← All tools
              </button>
            ) : null}

            {adminTaskView === "menu" ? (
              <div>
                <p className="mb-3 text-sm font-medium text-amber-950">What do you want to do?</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setAdminTaskView("championship")}
                    className="rounded-lg border-2 border-amber-900/20 bg-white p-4 text-left shadow-sm transition hover:border-emerald-700/40 hover:bg-emerald-50/50"
                  >
                    <span className="block text-sm font-semibold text-emerald-950">Set championship</span>
                    <span className="mt-1 block text-xs text-zinc-600">
                      Set the playoff match from the top two regular-season teams.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTaskView("skins-buyin")}
                    className="rounded-lg border-2 border-amber-900/20 bg-white p-4 text-left shadow-sm transition hover:border-emerald-700/40 hover:bg-emerald-50/50"
                  >
                    <span className="block text-sm font-semibold text-emerald-950">Set skins buy-in</span>
                    <span className="mt-1 block text-xs text-zinc-600">League-wide amount each player pays per skins week.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTaskView("course-holes")}
                    className="rounded-lg border-2 border-amber-900/20 bg-white p-4 text-left shadow-sm transition hover:border-emerald-700/40 hover:bg-emerald-50/50"
                  >
                    <span className="block text-sm font-semibold text-emerald-950">Set course holes</span>
                    <span className="mt-1 block text-xs text-zinc-600">Par and stroke index per hole for the selected course.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTaskView("handicap-helper")}
                    className="rounded-lg border-2 border-amber-900/20 bg-white p-4 text-left shadow-sm transition hover:border-emerald-700/40 hover:bg-emerald-50/50"
                  >
                    <span className="block text-sm font-semibold text-emerald-950">Edit handicap helper</span>
                    <span className="mt-1 block text-xs text-zinc-600">View and edit handicap helper rounds and roster names.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTaskView("matchup-scores")}
                    className="rounded-lg border-2 border-amber-900/20 bg-white p-4 text-left shadow-sm transition hover:border-emerald-700/40 hover:bg-emerald-50/50"
                  >
                    <span className="block text-sm font-semibold text-emerald-950">Edit matchup scores</span>
                    <span className="mt-1 block text-xs text-zinc-600">Points, scorecards, per-player rounds, and skins flags.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTaskView("recompute-week")}
                    className="rounded-lg border-2 border-amber-900/20 bg-white p-4 text-left shadow-sm transition hover:border-emerald-700/40 hover:bg-emerald-50/50"
                  >
                    <span className="block text-sm font-semibold text-emerald-950">Recompute week</span>
                    <span className="mt-1 block text-xs text-zinc-600">Refresh skins and match points for one week after handicap changes.</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTaskView("week-cleanup")}
                    className="rounded-lg border-2 border-red-200 bg-white p-4 text-left shadow-sm transition hover:border-red-400/60 hover:bg-red-50/40 sm:col-span-2"
                  >
                    <span className="block text-sm font-semibold text-red-900">Remove week data (test cleanup)</span>
                    <span className="mt-1 block text-xs text-zinc-600">
                      Clears scores, skins, and related rows for a chosen week. Cannot be undone.
                    </span>
                  </button>
                </div>
              </div>
            ) : null}

            {adminTaskView === "championship" ? (
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
            ) : null}

            {adminTaskView === "skins-buyin" ? (
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
            ) : null}

            {adminTaskView === "course-holes" ? (
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
                                type="text"
                                inputMode="numeric"
                                className="w-16 rounded border border-zinc-300 bg-white px-1 py-0.5 text-zinc-900"
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
                                type="text"
                                inputMode="numeric"
                                className="w-16 rounded border border-zinc-300 bg-white px-1 py-0.5 text-zinc-900"
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
                  <p className="text-xs text-zinc-500">Course data did not load. Try Enter again.</p>
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
            ) : null}

            {adminTaskView === "recompute-week" ? (
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
            ) : null}

            {adminTaskView === "week-cleanup" ? (
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
                      <strong>Admin:</strong> use Remove week data (test cleanup) here, or the week tool above.
                    </li>
                    <li>
                      <strong>Scores only:</strong> open Edit matchup scores and delete each submission row.
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
            ) : null}
          </div>
        ) : null}
      </div>

      {err && <p className="text-red-700">{err}</p>}

      {rows && adminTaskView === "handicap-helper" && (
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
                            if (p.player_id !== selectedHandicapPlayerId) {
                              setEditingPlayerId(null);
                              setDraftPlayerName("");
                            }
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
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-900/20 pb-2">
                  <div className="min-w-0 flex-1">
                    {editingPlayerId === selectedHandicapPlayer.player_id ? (
                      <div className="space-y-2">
                        <label className="block text-xs font-medium text-emerald-900/80">Roster name</label>
                        <input
                          type="text"
                          className="w-full max-w-md rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                          value={draftPlayerName}
                          onChange={(e) => setDraftPlayerName(e.target.value)}
                          disabled={savingPlayerId !== null}
                          autoComplete="off"
                        />
                        <p className="text-xs text-zinc-500">Must be unique across the league.</p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                            disabled={savingPlayerId !== null}
                            onClick={() => {
                              setEditingPlayerId(null);
                              setDraftPlayerName("");
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded border border-emerald-600 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                            disabled={savingPlayerId !== null}
                            onClick={() => void savePlayerName(selectedHandicapPlayer.player_id)}
                          >
                            {savingPlayerId === selectedHandicapPlayer.player_id ? "Saving…" : "Save name"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="text-base font-semibold text-emerald-950">{selectedHandicapPlayer.player_name}</h3>
                        {selectedPlayerRoster?.team_name ? (
                          <p className="text-xs text-zinc-600">{selectedPlayerRoster.team_name}</p>
                        ) : null}
                        <p className="text-xs text-emerald-900/70">
                          Handicap {formatVersusParHandicap(selectedHandicapPlayer.handicap)} (based on{" "}
                          {selectedHandicapPlayer.rounds_in_avg} round
                          {selectedHandicapPlayer.rounds_in_avg === 1 ? "" : "s"})
                        </p>
                      </>
                    )}
                  </div>
                  {editingPlayerId !== selectedHandicapPlayer.player_id ? (
                    <button
                      type="button"
                      className="shrink-0 rounded border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      disabled={savingPlayerId !== null || deletingHandicapRowId !== null}
                      onClick={() => {
                        setErr("");
                        setEditingHandicapRowId(null);
                        setEditingPlayerId(selectedHandicapPlayer.player_id);
                        setDraftPlayerName(selectedHandicapPlayer.player_name);
                      }}
                    >
                      Edit name
                    </button>
                  ) : null}
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
                                onClick={() => {
                                  setEditingPlayerId(null);
                                  setDraftPlayerName("");
                                  setEditingHandicapRowId(r.id);
                                }}
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
        </div>
      )}

      {rows && adminTaskView === "matchup-scores" && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-emerald-950">Matchup scores</h2>
            <p className="text-sm text-zinc-600">
              Open a week, then a matchup. Edit per-player hole scores anytime after someone submits; team points and
              scorecards appear once the match is finalized.
            </p>
          </div>
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
                    {g.finalized.length + g.inProgress.length} match
                    {g.finalized.length + g.inProgress.length === 1 ? "" : "es"}
                  </span>
                </span>
              </summary>
              <div className="border-t border-zinc-100 px-2 py-2">
                <ul className="space-y-2">
                  {g.finalized.map((r) => (
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
                            playerRounds={matchPlayerRoundsByMatch[r.match_id] ?? EMPTY_PLAYER_ROUNDS}
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
                            onMatchRoundsUpdated={() => load()}
                            onError={setErr}
                          />
                        </div>
                      </details>
                    </li>
                  ))}
                  {g.inProgress.map((m) => (
                    <li key={m.match_id} className="rounded-md border border-amber-200/80 bg-amber-50/40">
                      <details className="group/match rounded-md">
                        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-zinc-900 marker:hidden [&::-webkit-details-marker]:hidden">
                          <span className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              <AccordionChevron group="match" />
                              <span className="truncate">{m.matchup_label}</span>
                            </span>
                            <span className="shrink-0 text-xs font-normal text-amber-900/80">
                              In progress · {m.players_in}/4 in
                            </span>
                          </span>
                        </summary>
                        <div className="border-t border-amber-200/60 bg-white px-3 py-3">
                          <InProgressMatchupEditor
                            matchup={m}
                            playerRounds={matchPlayerRoundsByMatch[m.match_id] ?? EMPTY_PLAYER_ROUNDS}
                            authHeader={authHeader}
                            onMatchRoundsUpdated={() => load()}
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
          <LooseNumberInput
            min={18}
            max={200}
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900"
            value={draft.score}
            onValueChange={(n) => setDraft({ ...draft, score: n })}
          />
        </label>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <label className="block w-28">
          Par
          <LooseNumberInput
            min={18}
            max={144}
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900"
            value={draft.par}
            onValueChange={(n) => setDraft({ ...draft, par: n })}
          />
        </label>
          <label className="block w-36">
            Saved handicap
            <LooseNullableIntInput
              min={0}
              max={99}
              className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900"
              value={draft.handicap_at_submission}
              onValueChange={(n) => setDraft({ ...draft, handicap_at_submission: n })}
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

function InProgressMatchupEditor({
  matchup,
  playerRounds,
  authHeader,
  onMatchRoundsUpdated,
  onError,
}: {
  matchup: InProgressMatchup;
  playerRounds: PlayerRoundAdmin[];
  authHeader: () => { Authorization: string };
  onMatchRoundsUpdated: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  return (
    <div className="space-y-3 text-sm">
      <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
        Match not finalized yet ({matchup.players_in} of 4 players in). Edit hole scores and skins below; team points
        and the scorecard section appear after all players submit.
      </p>
      <MatchPlayerRoundsEditor
        weekId={matchup.week_id}
        matchId={matchup.match_id}
        rounds={playerRounds}
        authHeader={authHeader}
        onUpdated={onMatchRoundsUpdated}
        onError={onError}
      />
    </div>
  );
}

function MatchPlayerRoundsEditor({
  weekId,
  matchId,
  rounds,
  authHeader,
  onUpdated,
  onError,
}: {
  weekId: string;
  matchId: string;
  rounds: PlayerRoundAdmin[];
  authHeader: () => { Authorization: string };
  onUpdated: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const baselineRef = useRef("");
  const [drafts, setDrafts] = useState<MatchRoundsDraft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = buildMatchDrafts(rounds);
    setDrafts(next);
    baselineRef.current = JSON.stringify(next);
  }, [rounds]);

  const hasChanges = JSON.stringify(drafts) !== baselineRef.current;

  function updateSkins(roundId: string, played: boolean) {
    setDrafts((prev) =>
      prev.map((d) => (d.player_round_id === roundId ? { ...d, played_skins: played } : d)),
    );
  }

  function setHoleStrokes(roundId: string, holeNumber: number, strokes: number) {
    setDrafts((prev) =>
      prev.map((d) =>
        d.player_round_id !== roundId
          ? d
          : {
              ...d,
              holes: d.holes.map((h) =>
                h.hole_number === holeNumber ? { ...h, strokes } : h,
              ),
            },
      ),
    );
  }

  async function saveRounds() {
    onError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/match-rounds", {
        method: "PATCH",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          week_id: weekId,
          rounds: drafts,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        onError(json.error ?? "Save failed");
        return;
      }
      await onUpdated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (rounds.length === 0) {
    return (
      <div className="mt-4 border-t border-zinc-100 pt-3">
        <p className="text-xs font-medium text-zinc-700">Player rounds (Submit Round)</p>
        <p className="mt-1 text-xs text-zinc-500">
          No per-player hole scores on file for this match yet (players submit via Submit Round).
        </p>
      </div>
    );
  }

  const sideLabel =
    rounds[0]?.which_nine?.toLowerCase() === "back" ? "Back nine (holes 10–18)" : "Front nine (holes 1–9)";

  return (
    <div className="mt-4 space-y-4 border-t border-zinc-100 pt-3">
      <div>
        <p className="text-xs font-medium text-zinc-700">Player rounds (Submit Round)</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Edit strokes and skins for the week. Saving runs the same recomputation as a fresh submission ({sideLabel}).
        </p>
      </div>
      {drafts.map((d) => {
        const meta = rounds.find((r) => r.id === d.player_round_id);
        return (
          <div key={d.player_round_id} className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium text-zinc-900">{meta?.player_name ?? "Player"}</span>
                <span className="text-zinc-500"> · {meta?.team_name ?? "?"}</span>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
                <input
                  type="checkbox"
                  checked={d.played_skins}
                  onChange={(e) => updateSkins(d.player_round_id, e.target.checked)}
                  className="rounded border-zinc-400"
                />
                Skins this week
              </label>
            </div>
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-1.5">
                {d.holes.map((h) => (
                  <label
                    key={h.hole_number}
                    className="flex w-11 flex-col text-center text-[0.65rem] text-zinc-600"
                  >
                    <span className="font-mono tabular-nums">{h.hole_number}</span>
                    <LooseNumberInput
                      min={1}
                      max={20}
                      className="mt-0.5 w-full rounded border border-zinc-300 bg-white px-0.5 py-1 text-center font-mono text-xs text-zinc-900 tabular-nums"
                      value={h.strokes}
                      onValueChange={(n) => setHoleStrokes(d.player_round_id, h.hole_number, n)}
                    />
                  </label>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        disabled={saving || !hasChanges}
        className="rounded-md bg-zinc-800 px-3 py-2 text-sm text-white disabled:opacity-50"
        onClick={() => void saveRounds()}
      >
        {saving ? "Saving…" : "Save hole scores & skins"}
      </button>
    </div>
  );
}

function ScoreRowEditor({
  row,
  playerRounds,
  authHeader,
  onSave,
  onDelete,
  onScorecardReplaced,
  onMatchRoundsUpdated,
  onError,
}: {
  row: Row;
  playerRounds: PlayerRoundAdmin[];
  authHeader: () => { Authorization: string };
  onSave: (r: Row) => Promise<void>;
  onDelete: () => void;
  onScorecardReplaced: () => Promise<void>;
  onMatchRoundsUpdated: () => Promise<void>;
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
          <LooseNumberInput
            allowDecimal
            min={0}
            max={10}
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900"
            value={draft.team_a_points}
            onValueChange={(v) => {
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
          <LooseNumberInput
            allowDecimal
            min={0}
            max={10}
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900"
            value={draft.team_b_points}
            onValueChange={(v) => {
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
      <MatchPlayerRoundsEditor
        weekId={row.week_id}
        matchId={row.match_id}
        rounds={playerRounds}
        authHeader={authHeader}
        onUpdated={onMatchRoundsUpdated}
        onError={onError}
      />
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
