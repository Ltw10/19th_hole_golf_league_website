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

export function AdminScoresClient() {
  const [secret, setSecret] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [cleanupWeekId, setCleanupWeekId] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

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
      setWeeks((json.weeks as WeekOption[] | undefined) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setRows(null);
      setWeeks([]);
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

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

  const weekGroups = useMemo(() => (rows ? groupByWeek(rows) : []), [rows]);

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

  async function cleanupTestWeek() {
    if (!cleanupWeekId) {
      setErr("Choose a week.");
      return;
    }
    if (
      !confirm(
        "Remove all score submissions for this week and delete the full skins bundle (hole wins, buy-ins, payouts, week row)? This cannot be undone.",
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
            <div className="rounded-md border border-zinc-200 bg-white/80 p-3">
              <p className="text-sm font-medium text-zinc-900">Test cleanup (scores + skins for one week)</p>
              <p className="mt-1 text-xs text-zinc-600">
                Clears match score rows and the skins submission for the chosen week so you can resubmit. Does not
                delete scorecard image files in Storage.
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
                              if (draft.team_a_points + draft.team_b_points !== 10) {
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
      )}
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
