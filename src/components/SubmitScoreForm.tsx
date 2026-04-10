"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatSeasonPhase, SCORECARDS_BUCKET } from "@/lib/nhgl";

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
  /** From `/submit-scores?match=<id>` when valid */
  initialWeekId?: string;
  initialMatchId?: string;
};

export function SubmitScoreForm({
  weeks,
  matches,
  teams,
  players,
  initialWeekId,
  initialMatchId,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const teamName = useMemo(() => {
    const m = new Map(teams.map((t) => [t.id, t.name]));
    return (id: string | null) => (id ? m.get(id) ?? "?" : "?");
  }, [teams]);

  const scoreWeeks = useMemo(
    () => weeks.filter((w) => w.phase !== "handicap"),
    [weeks],
  );

  const [weekId, setWeekId] = useState(initialWeekId ?? "");
  const [matchId, setMatchId] = useState(initialMatchId ?? "");
  const [a, setA] = useState(5);
  const [b, setB] = useState(5);
  const [notes, setNotes] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");
  const scorecardFileId = useId();

  const matchesForWeek = useMemo(() => {
    if (!weekId) return [];
    return matches.filter((m) => m.week_id === weekId && m.team_a_id && m.team_b_id);
  }, [matches, weekId]);

  const selectedMatch = useMemo(
    () => (matchId ? matches.find((m) => m.id === matchId) : undefined),
    [matches, matchId],
  );

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
    setFile(null);
    router.push("/standings");
  }

  return (
    <form onSubmit={onSubmit} className="w-full min-w-0 max-w-lg space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-700">Week</label>
        <select
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
          value={weekId}
          onChange={(e) => {
            setWeekId(e.target.value);
            setMatchId("");
          }}
        >
          <option value="">Select week</option>
          {scoreWeeks.map((w) => (
            <option key={w.id} value={w.id}>
              Week {w.week_number} — {formatSeasonPhase(w.phase)} ({w.week_date})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Match</label>
        <select
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
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
          <label className="block text-sm font-medium text-zinc-700">
            {selectedMatch?.team_a_id
              ? `${teamName(selectedMatch.team_a_id)} points`
              : "Team A points"}
          </label>
          <input
            type="number"
            min={0}
            max={10}
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2.5 text-base"
            value={a}
            onChange={(e) => {
              const na = Number(e.target.value);
              setA(na);
              setB(10 - na);
            }}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700">
            {selectedMatch?.team_b_id
              ? `${teamName(selectedMatch.team_b_id)} points`
              : "Team B points"}
          </label>
          <input
            type="number"
            min={0}
            max={10}
            required
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2.5 text-base"
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
        <span className="block text-sm font-medium text-zinc-700">Scorecard photo (optional)</span>
        <div className="mt-2 rounded-lg border-2 border-dashed border-emerald-300/90 bg-gradient-to-b from-emerald-50/90 to-white px-4 py-5 text-center shadow-sm">
          <input
            id={scorecardFileId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <label htmlFor={scorecardFileId} className="flex cursor-pointer flex-col items-center gap-2">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800"
              aria-hidden
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="h-7 w-7"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </span>
            <span className="text-sm font-semibold text-emerald-950">Upload a picture of the scorecard</span>
            <span className="text-xs text-zinc-600">
              Click or tap here — take a photo or choose an image from your device
            </span>
            <span className="mt-1 inline-flex items-center justify-center rounded-md border border-emerald-800/20 bg-emerald-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-900">
              {file ? "Change photo" : "Choose photo"}
            </span>
          </label>
          {file ? (
            <p className="mt-3 border-t border-emerald-200/80 pt-3 text-xs text-zinc-600">
              Selected file:{" "}
              <span className="font-medium text-zinc-800">{file.name}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Notes (optional)</label>
        <textarea
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2.5 text-base"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Submitted by (optional)</label>
        <select
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
          value={playerId}
          onChange={(e) => setPlayerId(e.target.value)}
        >
          <option value="">Select player</option>
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
        className="min-h-[44px] w-full rounded-md bg-emerald-800 px-4 py-3 text-base font-medium text-white hover:bg-emerald-900 disabled:opacity-50 sm:w-auto"
      >
        {status === "loading" ? "Submitting…" : "Submit score"}
      </button>

      {message && (
        <p className={status === "ok" ? "text-emerald-800" : "text-red-700"}>{message}</p>
      )}
    </form>
  );
}
