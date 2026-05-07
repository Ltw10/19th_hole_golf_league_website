"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatSeasonPhase, SCORECARDS_BUCKET } from "@/lib/nhgl";
import {
  handicapFromScores,
  holeNet,
  type CourseHole,
  type ScoreRow,
} from "@/lib/scoring";

type Team = { id: string; name: string };
type Player = { id: string; name: string; team_id: string; is_league_member: boolean };
type Week = { id: string; week_number: number; week_date: string; phase: string };
type Match = {
  id: string;
  week_id: string;
  team_a_id: string | null;
  team_b_id: string | null;
};

export type SubmitRoundFormProps = {
  weeks: Week[];
  matches: Match[];
  teams: Team[];
  players: Player[];
  courseHoles: CourseHole[];
  skinsBuyinAmount: number;
  handicapByPlayer: Record<string, number>;
  hhScoresByPlayer: Record<string, ScoreRow[]>;
  weekDatesByWeekId: Record<string, string>;
  subsTeamId: string | null;
  initialWeekId?: string;
  initialMatchId?: string;
};

export function SubmitRoundForm({
  weeks,
  matches,
  teams,
  players,
  courseHoles,
  skinsBuyinAmount,
  handicapByPlayer,
  hhScoresByPlayer,
  weekDatesByWeekId,
  subsTeamId,
  initialWeekId,
  initialMatchId,
}: SubmitRoundFormProps) {
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
  const [playerId, setPlayerId] = useState("");
  const [playedForTeamId, setPlayedForTeamId] = useState("");
  const [subbingForPlayerId, setSubbingForPlayerId] = useState("");
  const [playedSkins, setPlayedSkins] = useState(false);
  const [whichNine, setWhichNine] = useState<"front" | "back">("front");
  const [strokes, setStrokes] = useState<number[]>(() => Array(9).fill(4));
  const [notesFile, setNotesFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");
  const scorecardFileId = useId();

  const [subs, setSubs] = useState<Player[]>([]);
  const [newSubName, setNewSubName] = useState("");
  const [addSubLoading, setAddSubLoading] = useState(false);
  const [addSubError, setAddSubError] = useState("");

  const allPlayers = useMemo(() => {
    const byId = new Map<string, Player>();
    for (const p of players) byId.set(p.id, p);
    for (const s of subs) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [players, subs]);

  const matchesForWeek = useMemo(() => {
    if (!weekId) return [];
    return matches.filter((m) => m.week_id === weekId && m.team_a_id && m.team_b_id);
  }, [matches, weekId]);

  const selectedMatch = useMemo(
    () => (matchId ? matches.find((m) => m.id === matchId) : undefined),
    [matches, matchId],
  );
  const selectedPlayer = useMemo(
    () => (playerId ? allPlayers.find((p) => p.id === playerId) : undefined),
    [allPlayers, playerId],
  );
  const isSubstitutePlayer = selectedPlayer ? !selectedPlayer.is_league_member : false;
  const subbingForOptions = useMemo(() => {
    if (!playedForTeamId) return [];
    return players.filter(
      (p) => p.team_id === playedForTeamId && p.id !== playerId && p.is_league_member,
    );
  }, [players, playedForTeamId, playerId]);

  const weekDate = weekId ? weekDatesByWeekId[weekId] : undefined;

  const effectiveHandicap = useMemo(() => {
    if (!playerId || !weekDate) return 0;
    const rows = hhScoresByPlayer[playerId] ?? [];
    return handicapFromScores(rows, weekDate);
  }, [hhScoresByPlayer, playerId, weekDate]);

  const holesSorted = useMemo(() => {
    const list = [...courseHoles].sort((a, b) => a.hole_number - b.hole_number);
    const side =
      whichNine === "back"
        ? list.filter((h) => h.hole_number >= 10 && h.hole_number <= 18)
        : list.filter((h) => h.hole_number >= 1 && h.hole_number <= 9);
    return side.slice(0, 9);
  }, [courseHoles, whichNine]);

  const totals = useMemo(() => {
    const holes = holesSorted.slice(0, 9);
    const gross = holes.reduce((sum, _hole, idx) => sum + (strokes[idx] ?? 4), 0);
    const net = holes.reduce((sum, hole, idx) => {
      const grossHole = strokes[idx] ?? 4;
      return sum + holeNet(grossHole, holes, effectiveHandicap, hole.hole_number);
    }, 0);
    const par = holes.reduce((sum, hole) => sum + hole.par, 0);
    return { gross, net, par };
  }, [holesSorted, strokes, effectiveHandicap]);

  useEffect(() => {
    const defaults = holesSorted.length > 0 ? holesSorted.map((h) => h.par) : Array(9).fill(4);
    setStrokes(defaults);
  }, [holesSorted]);

  useEffect(() => {
    if (!isSubstitutePlayer) {
      setSubbingForPlayerId("");
      return;
    }
    if (!subbingForOptions.some((p) => p.id === subbingForPlayerId)) {
      setSubbingForPlayerId("");
    }
  }, [isSubstitutePlayer, subbingForPlayerId, subbingForOptions]);

  async function addSubstitute() {
    const name = newSubName.trim();
    if (!name) return;
    setAddSubLoading(true);
    setAddSubError("");
    const { data, error } = await supabase.rpc("create_skins_substitute_player", {
      p_name: name,
    });
    setAddSubLoading(false);
    if (error) {
      setAddSubError(error.message);
      return;
    }
    const id = data as string;
    const subTeam = subsTeamId ?? "";
    setSubs((prev) => [...prev, { id, name, team_id: subTeam, is_league_member: false }]);
    setPlayerId(id);
    setNewSubName("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    const match = matches.find((m) => m.id === matchId);
    if (!match?.team_a_id || !match.team_b_id) {
      setStatus("err");
      setMessage("Pick a valid match.");
      return;
    }
    if (!playerId || !playedForTeamId) {
      setStatus("err");
      setMessage("Choose player and which team you played for.");
      return;
    }
    if (playedForTeamId !== match.team_a_id && playedForTeamId !== match.team_b_id) {
      setStatus("err");
      setMessage("Team must match the matchup.");
      return;
    }
    if (isSubstitutePlayer && !subbingForPlayerId) {
      setStatus("err");
      setMessage("Choose which player you are subbing for.");
      return;
    }
    if (holesSorted.length < 9) {
      setStatus("err");
      setMessage("Course holes are not configured — ask an admin.");
      return;
    }

    let scorecardUrl: string | null = null;
    if (notesFile) {
      const path = `nhgl/${crypto.randomUUID()}-${notesFile.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from(SCORECARDS_BUCKET)
        .upload(path, notesFile, { contentType: notesFile.type || "application/octet-stream" });
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

    const p_holes = strokes.map((s, i) => ({
      hole: i + 1,
      strokes: Math.round(Number(s)) || 4,
    }));

    const { error } = await supabase.rpc("submit_player_round", {
      p_week_id: weekId,
      p_player_id: playerId,
      p_match_id: matchId,
      p_played_for_team_id: playedForTeamId,
      p_played_skins: playedSkins,
      p_holes: p_holes,
      p_scorecard_image_url: scorecardUrl ?? null,
      p_which_nine: whichNine,
      p_subbing_for_player_id: isSubstitutePlayer ? subbingForPlayerId : null,
    });

    if (error) {
      setMessage(error.message);
      setStatus("err");
      return;
    }

    setNotesFile(null);
    router.push("/standings");
  }

  return (
    <form onSubmit={onSubmit} className="w-full min-w-0 max-w-2xl space-y-6">
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
          onChange={(e) => {
            const mid = e.target.value;
            setMatchId(mid);
            const m = matches.find((x) => x.id === mid);
            const pl = allPlayers.find((p) => p.id === playerId);
            if (m?.team_a_id && m.team_b_id && pl) {
              if (pl.team_id === m.team_a_id) setPlayedForTeamId(m.team_a_id);
              else if (pl.team_id === m.team_b_id) setPlayedForTeamId(m.team_b_id);
              else setPlayedForTeamId("");
            }
          }}
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

      <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-3">
        <p className="text-sm font-medium text-emerald-950">Need a substitute?</p>
        <p className="mt-1 text-xs text-zinc-600">
          Add a guest name — they pick which side of the matchup they&apos;re playing for below.
        </p>
        {!subsTeamId ? (
          <p className="mt-2 text-xs text-amber-800">
            Substitutes aren&apos;t available until database migrations are applied (Skins substitutes team).
          </p>
        ) : null}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input
            type="text"
            className="min-h-[44px] min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-base sm:min-w-[12rem]"
            placeholder="Player name"
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addSubstitute();
              }
            }}
            maxLength={120}
          />
          <button
            type="button"
            disabled={addSubLoading || !newSubName.trim() || !subsTeamId}
            className="min-h-[44px] shrink-0 rounded-md border border-emerald-700 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
            onClick={() => void addSubstitute()}
          >
            {addSubLoading ? "Adding…" : "Add guest"}
          </button>
        </div>
        {addSubError ? <p className="mt-2 text-sm text-red-700">{addSubError}</p> : null}
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Player</label>
        <select
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
          value={playerId}
          onChange={(e) => {
            const pid = e.target.value;
            setPlayerId(pid);
            const pl = allPlayers.find((p) => p.id === pid);
            const m = matches.find((x) => x.id === matchId);
            if (pl && m?.team_a_id && m.team_b_id) {
              if (pl.team_id === m.team_a_id) setPlayedForTeamId(m.team_a_id);
              else if (pl.team_id === m.team_b_id) setPlayedForTeamId(m.team_b_id);
              else setPlayedForTeamId("");
            }
          }}
        >
          <option value="">Select player</option>
          {allPlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {selectedMatch?.team_a_id && selectedMatch.team_b_id ? (
        <div>
          <label className="block text-sm font-medium text-zinc-700">Playing for</label>
          <select
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
            value={playedForTeamId}
            onChange={(e) => setPlayedForTeamId(e.target.value)}
          >
            <option value="">Select team</option>
            <option value={selectedMatch.team_a_id}>{teamName(selectedMatch.team_a_id)}</option>
            <option value={selectedMatch.team_b_id}>{teamName(selectedMatch.team_b_id)}</option>
          </select>
        </div>
      ) : null}

      {isSubstitutePlayer ? (
        <div>
          <label className="block text-sm font-medium text-zinc-700">Subbing for</label>
          <select
            required
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
            value={subbingForPlayerId}
            onChange={(e) => setSubbingForPlayerId(e.target.value)}
            disabled={!playedForTeamId || subbingForOptions.length === 0}
          >
            <option value="">
              {!playedForTeamId
                ? "Select team first"
                : subbingForOptions.length === 0
                  ? "No eligible roster players"
                  : "Select player"}
            </option>
            {subbingForOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Required for substitutes so we can track who this round replaces.
          </p>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-200 bg-zinc-50/80 px-3 py-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 rounded border-zinc-300"
          checked={playedSkins}
          onChange={(e) => setPlayedSkins(e.target.checked)}
        />
        <span className="text-sm text-zinc-800">
          I&apos;m in for skins this week (${skinsBuyinAmount.toFixed(2)} buy-in per player)
        </span>
      </label>

      <fieldset className="rounded-md border border-zinc-200 bg-white px-3 py-3">
        <legend className="px-1 text-sm font-medium text-zinc-700">Which nine?</legend>
        <p className="mb-2 text-xs text-zinc-500">
          Everyone in the same match must play the same side. Hole columns show the course hole number (1–9 or 10–18).
        </p>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input
              type="radio"
              name="which-nine"
              className="h-4 w-4 border-zinc-300"
              checked={whichNine === "front"}
              onChange={() => setWhichNine("front")}
            />
            Front nine (holes 1–9)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input
              type="radio"
              name="which-nine"
              className="h-4 w-4 border-zinc-300"
              checked={whichNine === "back"}
              onChange={() => setWhichNine("back")}
            />
            Back nine (holes 10–18)
          </label>
        </div>
      </fieldset>

      <div>
        <p className="text-sm font-medium text-zinc-700">Strokes — Hickory Sticks</p>
        <p className="mt-1 text-xs text-zinc-500">
          Handicap for net preview (strokes before this round):{" "}
          <span className="font-mono font-semibold text-emerald-900">{effectiveHandicap}</span>
          {playerId && handicapByPlayer[playerId] !== undefined ? (
            <span className="text-zinc-400"> — roster summary {handicapByPlayer[playerId]}</span>
          ) : null}
        </p>
        {holesSorted.length < 9 ? (
          <p className="mt-2 text-sm text-amber-800">
            Course data is missing nine holes. Ask an admin to run migrations or edit Pars in admin.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-2 py-2 text-left font-medium text-zinc-700">Hole</th>
                  <th className="px-2 py-2 text-center font-medium text-zinc-700">Par</th>
                  <th className="px-2 py-2 text-center font-medium text-zinc-700">Handicap</th>
                  <th className="px-2 py-2 text-center font-medium text-zinc-700">Gross</th>
                  <th className="px-2 py-2 text-right font-medium text-zinc-700">Net</th>
                </tr>
              </thead>
              <tbody>
                {holesSorted.map((hole, idx) => {
                  const g = strokes[idx] ?? 4;
                  const net = holeNet(g, holesSorted, effectiveHandicap, hole.hole_number);
                  return (
                    <tr key={hole.hole_number} className="border-b border-zinc-100">
                      <td className="px-2 py-2 font-medium text-zinc-900">{hole.hole_number}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-zinc-700">{hole.par}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-zinc-700">{hole.stroke_index}</td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          required
                          min={1}
                          max={20}
                          className="w-full min-w-[4rem] rounded border border-zinc-300 px-2 py-1.5 text-center tabular-nums"
                          value={g}
                          onChange={(e) => {
                            const n = [...strokes];
                            n[idx] = Number(e.target.value);
                            setStrokes(n);
                          }}
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-emerald-900">{net}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-emerald-200 bg-emerald-50/70">
                  <td className="px-2 py-2 font-semibold text-emerald-950">Total</td>
                  <td className="px-2 py-2 text-center font-mono font-semibold tabular-nums text-emerald-950">
                    {totals.par}
                  </td>
                  <td className="px-2 py-2 text-center text-zinc-500">—</td>
                  <td className="px-2 py-2 text-center font-mono font-semibold tabular-nums text-emerald-950">
                    {totals.gross}
                  </td>
                  <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-emerald-950">
                    {totals.net}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <span className="block text-sm font-medium text-zinc-700">Scorecard photo (optional)</span>
        <p className="mt-0.5 text-xs text-zinc-500">
          If you upload a picture, it becomes the scorecard image for this matchup (latest upload wins).
        </p>
        <div className="mt-2 rounded-lg border-2 border-dashed border-emerald-300/90 bg-gradient-to-b from-emerald-50/90 to-white px-4 py-5 text-center shadow-sm">
          <input
            id={scorecardFileId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setNotesFile(e.target.files?.[0] ?? null)}
          />
          <label htmlFor={scorecardFileId} className="flex cursor-pointer flex-col items-center gap-2">
            <span className="mt-1 inline-flex items-center justify-center rounded-md border border-emerald-800/20 bg-emerald-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-900">
              {notesFile ? "Change photo" : "Choose photo"}
            </span>
          </label>
          {notesFile ? (
            <p className="mt-3 border-t border-emerald-200/80 pt-3 text-xs text-zinc-600">
              Selected: <span className="font-medium text-zinc-800">{notesFile.name}</span>
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="submit"
        disabled={status === "loading" || holesSorted.length < 9}
        className="min-h-[44px] w-full rounded-md bg-emerald-800 px-4 py-3 text-base font-medium text-white hover:bg-emerald-900 disabled:opacity-50 sm:w-auto"
      >
        {status === "loading" ? "Submitting…" : "Submit round"}
      </button>

      {message && (
        <p className={status === "ok" ? "text-emerald-800" : "text-red-700"}>{message}</p>
      )}
    </form>
  );
}
