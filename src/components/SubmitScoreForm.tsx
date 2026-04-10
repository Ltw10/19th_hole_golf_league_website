"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { SCORECARDS_BUCKET } from "@/lib/nhgl";

type Team = { id: string; name: string };
type Player = { id: string; name: string };
type Week = { id: string; week_number: number; week_date: string; phase: string };
type Match = {
  id: string;
  week_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
};

type Props = {
  weeks: Week[];
  matches: Match[];
  teams: Team[];
  players: Player[];
};

export function SubmitScoreForm({ weeks, matches, teams, players }: Props) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const teamName = useMemo(() => {
    const m = new Map(teams.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? m.get(id) ?? "?" : "?");
  }, [teams]);

  const [weekId, setWeekId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [a, setA] = useState(5);
  const [b, setB] = useState(5);
  const [notes, setNotes] = useState("");
  const [submitterLabel, setSubmitterLabel] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  const matchesForWeek = useMemo(() => {
    if (!weekId) return [];
    return matches.filter((m) => m.week_id === weekId && m.team_a_id && m.team_b_id);
  }, [matches, weekId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const match = matches.find((m) => m.id === matchId);
    if (!match || !match.team_a_id || !match.team_b_id) {
      setStatus("err");
      setMessage("Pick a valid match.");
      return;
    }
    if (a + b !== 10) {
      setStatus("err");
      setMessage("Points must add up to 10.");
      return;
    }

    let scorecardUrl: string | null = null;
    if (file) {
      const path = `nhgl/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from(SCORECARDS_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) {
        setStatus("err");
        setMessage(upErr.message);
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from(SCORECARDS_BUCKET).getPublicUrl(path);
      scorecardUrl = publicUrl;
    }

    const { error } = await supabase.from("score_submissions").insert({
      week_id: match.week_id,
      match_id: match.id,
      team_a_id: match.team_a_id,
      team_b_id: match.team_b_id,
      team_a_points: a,
      team_b_points: b,
      scorecard_image_url: scorecardUrl,
      notes: notes || null,
      submitter_label: submitterLabel || null,
      submitted_by_player_id: playerId || null,
    });

    if (error) {
      if (error.code === "23505") {
        setMessage(
          "A score for this match is already on file. Ask a league admin to edit or remove it.",
        );
      } else {
        setMessage(error.message);
      }
      setStatus("err");
      return;
    }
    setStatus("ok");
    setMessage("Score submitted. Thanks!");
    setFile(null);
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700">Week</label>
        <select
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={weekId}
          onChange={(e) => {
            setWeekId(e.target.value);
            setMatchId("");
          }}
        >
          <option value="">Select week</option>
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>
              Week {w.week_number} — {w.phase} ({w.week_date})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Match</label>
        <select
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          disabled={!weekId || matchesForWeek.length === 0}
        >
          <option value="">
            {!weekId ? "Select a week first" : matchesForWeek.length === 0 ? "No matches" : "Select match"}
          </option>
          {matchesForWeek.map((m) => (
            <option key={m.id} value={m.id}>
              {teamName(m.team_a_id)} vs {teamName(m.team_b_id)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-zinc-700">Team A points</label>
          <input
            type="number"
            min={0}
            max={10}
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={a}
            onChange={(e) => {
              const na = Number(e.target.value);
              setA(na);
              setB(10 - na);
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700">Team B points</label>
          <input
            type="number"
            min={0}
            max={10}
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            value={b}
            onChange={(e) => {
              const nb = Number(e.target.value);
              setB(nb);
              setA(10 - nb);
            }}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Scorecard photo (optional)</label>
        <input
          type="file"
          accept="image/*"
          className="mt-1 text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Notes (optional)</label>
        <textarea
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Who submitted? (optional)</label>
        <input
          type="text"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Name"
          value={submitterLabel}
          onChange={(e) => setSubmitterLabel(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Player (optional)</label>
        <select
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
        >
          <option value="">—</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
      >
        {status === "loading" ? "Submitting…" : "Submit score"}
      </button>

      {message && (
        <p className={status === "ok" ? "text-emerald-800" : "text-red-700"}>{message}</p>
      )}
    </form>
  );
}
