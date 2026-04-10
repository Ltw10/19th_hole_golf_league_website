"use client";

import { useCallback, useState } from "react";

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
  created_at: string;
};

export function AdminScoresClient() {
  const [secret, setSecret] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const authHeader = useCallback(() => {
    return { Authorization: `Bearer ${secret}` };
  }, [secret]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/scores", { headers: authHeader() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setRows(json.data as Row[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
      setRows(null);
    } finally {
      setLoading(false);
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

  async function save(row: Row) {
    if (row.team_a_points + row.team_b_points !== 10) {
      setErr("Points must sum to 10.");
      return;
    }
    const res = await fetch(`/api/admin/scores/${row.id}`, {
      method: "PATCH",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        team_a_points: row.team_a_points,
        team_b_points: row.team_b_points,
        notes: row.notes,
        scorecard_image_url: row.scorecard_image_url,
        submitter_label: row.submitter_label,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error ?? "Save failed");
      return;
    }
    setErr("");
    await load();
  }

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
      alert("Championship match updated to top two teams by regular-season points.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-800/20 bg-amber-50/80 p-4 text-sm text-amber-950">
        <p>
          Enter the league admin secret from <code className="rounded bg-white/80 px-1">NHGL_ADMIN_SECRET</code>{" "}
          (server env). It is never sent to the browser bundle — only to your API routes on submit.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700">Admin secret</label>
          <input
            type="password"
            className="mt-1 w-64 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || !secret}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load submissions"}
        </button>
        <button
          type="button"
          onClick={refreshChampionship}
          disabled={loading || !secret}
          className="rounded-md border border-emerald-800 bg-white px-4 py-2 text-sm font-medium text-emerald-900 disabled:opacity-50"
        >
          Set championship to top 2
        </button>
      </div>

      {err && <p className="text-red-700">{err}</p>}

      {rows && (
        <ul className="space-y-6">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <ScoreRowEditor row={r} onSave={save} onDelete={() => remove(r.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreRowEditor({
  row,
  onSave,
  onDelete,
}: {
  row: Row;
  onSave: (r: Row) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(row);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-zinc-500">
        <span>id: {row.id}</span>
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
        Scorecard image URL
        <input
          className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 font-mono text-xs"
          value={draft.scorecard_image_url ?? ""}
          onChange={(e) => setDraft({ ...draft, scorecard_image_url: e.target.value || null })}
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
      {draft.scorecard_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={draft.scorecard_image_url}
          alt="Scorecard"
          className="max-h-48 rounded border border-zinc-200"
        />
      )}
      <div className="flex gap-2">
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
