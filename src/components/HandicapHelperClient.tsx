"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type HandicapSummaryRow = {
  player_id: string;
  player_name: string;
  handicap: number;
  rounds_in_avg: number;
  rounds_submitted: number;
};

type PlayerOption = { id: string; name: string };

type ScoreDetail = {
  id: string;
  played_date: string;
  score: number;
  par: number;
  created_at: string;
};

const scorecardShell =
  "overflow-hidden rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] shadow-[3px_4px_0_0_rgba(6,60,45,0.1)]";

function todayLocalISODate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function HandicapHelperClient({
  initialSummary,
  players,
}: {
  initialSummary: HandicapSummaryRow[];
  players: PlayerOption[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const addFormId = useId();

  const [addOpen, setAddOpen] = useState(false);
  const [detailFor, setDetailFor] = useState<HandicapSummaryRow | null>(null);
  const [detailRows, setDetailRows] = useState<ScoreDetail[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [playerId, setPlayerId] = useState("");
  const [playedDate, setPlayedDate] = useState(todayLocalISODate);
  const [score, setScore] = useState("");
  const [par, setPar] = useState("36");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [submitMessage, setSubmitMessage] = useState("");

  const [addedPlayers, setAddedPlayers] = useState<PlayerOption[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [addPlayerLoading, setAddPlayerLoading] = useState(false);
  const [addPlayerError, setAddPlayerError] = useState("");

  const allPlayerOptions = useMemo(() => {
    const byId = new Map<string, PlayerOption>();
    for (const p of players) byId.set(p.id, p);
    for (const p of addedPlayers) byId.set(p.id, p);
    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [players, addedPlayers]);

  const loadDetail = useCallback(
    async (row: HandicapSummaryRow) => {
      setDetailFor(row);
      setDetailRows(null);
      setDetailError(null);
      setDetailLoading(true);
      const { data, error } = await supabase
        .from("handicap_helper_scores")
        .select("id, played_date, score, par, created_at")
        .eq("player_id", row.player_id)
        .order("played_date", { ascending: false })
        .order("created_at", { ascending: false });
      setDetailLoading(false);
      if (error) {
        setDetailRows([]);
        setDetailError(error.message);
        return;
      }
      setDetailRows((data ?? []) as ScoreDetail[]);
    },
    [supabase],
  );

  useEffect(() => {
    if (!addOpen && !detailFor) return;
    const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
        setAddOpen(false);
        setDetailFor(null);
        setDetailRows(null);
        setDetailError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, detailFor]);

  async function addNewPlayer() {
    const name = newPlayerName.trim();
    if (!name) {
      setAddPlayerError("Enter a name.");
      return;
    }
    setAddPlayerLoading(true);
    setAddPlayerError("");
    const { data, error } = await supabase.rpc("create_handicap_helper_player", { p_name: name });
    setAddPlayerLoading(false);
    if (error) {
      setAddPlayerError(error.message);
      return;
    }
    const id = String(data);
    setAddedPlayers((prev) => [...prev, { id, name }]);
    setPlayerId(id);
    setNewPlayerName("");
    router.refresh();
  }

  async function onSubmitScore(e: React.FormEvent) {
    e.preventDefault();
    setSubmitStatus("loading");
    setSubmitMessage("");
    const pid = playerId.trim();
    const s = Number(score);
    const p = Number(par);
    if (!pid) {
      setSubmitStatus("err");
      setSubmitMessage("Choose your name.");
      return;
    }
    if (!playedDate) {
      setSubmitStatus("err");
      setSubmitMessage("Pick a date.");
      return;
    }
    if (!Number.isFinite(s) || s < 18 || s > 200) {
      setSubmitStatus("err");
      setSubmitMessage("Enter a valid score (18–200).");
      return;
    }
    if (!Number.isFinite(p) || p < 18 || p > 144) {
      setSubmitStatus("err");
      setSubmitMessage("Enter a valid par (18–144).");
      return;
    }

    const { error } = await supabase.from("handicap_helper_scores").insert({
      player_id: pid,
      played_date: playedDate,
      score: Math.round(s),
      par: Math.round(p),
    });

    if (error) {
      setSubmitStatus("err");
      setSubmitMessage(error.message);
      return;
    }

    setSubmitStatus("ok");
    setSubmitMessage("Score saved.");
    setScore("");
    setPar("36");
    setPlayedDate(todayLocalISODate());
    setAddOpen(false);
    router.refresh();
    if (detailFor?.player_id === pid) {
      await loadDetail(detailFor);
    }
  }

  const sortedSummary = useMemo(
    () =>
      [...initialSummary].sort((a, b) => {
        const d = Number(a.handicap) - Number(b.handicap);
        if (d !== 0) return d;
        const roundsDiff = Number(b.rounds_submitted) - Number(a.rounds_submitted);
        if (roundsDiff !== 0) return roundsDiff;
        return a.player_name.localeCompare(b.player_name, undefined, { sensitivity: "base" });
      }),
    [initialSummary],
  );

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-emerald-950 sm:text-2xl">Handicap helper</h1>
          <p className="mt-1 text-sm text-zinc-600 sm:text-base">
            Log <span className="font-semibold text-emerald-900/90">9-hole</span> rounds to track
            your handicap as 80% of your average strokes over or under par from up to five most
            recent scores (score minus par for each round, then rounded to a whole number). Tap a
            row to see every round on file.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border-2 border-emerald-900/40 bg-emerald-950 px-4 py-2.5 text-sm font-semibold text-[#f2efe4] shadow-[2px_3px_0_0_rgba(6,60,45,0.2)] hover:bg-emerald-900"
          onClick={() => {
            setSubmitStatus("idle");
            setSubmitMessage("");
            setNewPlayerName("");
            setAddPlayerError("");
            setAddOpen(true);
          }}
        >
          Add score
        </button>
      </div>

      {addOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) setAddOpen(false);
          }}
        >
          <div
            className="max-h-[min(90dvh,640px)] w-full max-w-md overflow-y-auto rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] p-4 shadow-[4px_5px_0_0_rgba(6,60,45,0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby={addFormId}
          >
            <div className="flex items-start justify-between gap-2 border-b border-emerald-900/20 pb-3">
              <h2 id={addFormId} className="text-lg font-semibold text-emerald-950">
                Add score
              </h2>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-emerald-900/80 hover:bg-emerald-900/10"
                onClick={() => setAddOpen(false)}
              >
                Close
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={onSubmitScore}>
              <label className="block text-sm font-medium text-emerald-950">
                Player
                <select
                  required
                  className="mt-1 w-full rounded-md border border-emerald-900/25 bg-white px-3 py-2 text-sm"
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                >
                  <option value="">Select name…</option>
                  {allPlayerOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-2 rounded-md border border-emerald-900/20 bg-white/50 px-3 py-3">
                <p className="text-xs font-medium text-emerald-900/80">Or add a new name</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                  <input
                    type="text"
                    autoComplete="name"
                    placeholder="e.g. Tim"
                    className="min-w-0 flex-1 rounded-md border border-emerald-900/25 bg-white px-3 py-2 text-sm"
                    value={newPlayerName}
                    onChange={(e) => {
                      setNewPlayerName(e.target.value);
                      setAddPlayerError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void addNewPlayer();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-emerald-900/30 px-3 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-900/5 disabled:opacity-50"
                    disabled={addPlayerLoading}
                    onClick={() => void addNewPlayer()}
                  >
                    {addPlayerLoading ? "Adding…" : "Add name"}
                  </button>
                </div>
                {addPlayerError ? <p className="text-xs text-red-700">{addPlayerError}</p> : null}
              </div>
              <label className="block text-sm font-medium text-emerald-950">
                Date played
                <input
                  type="date"
                  required
                  className="mt-1 w-full rounded-md border border-emerald-900/25 bg-white px-3 py-2 text-sm"
                  value={playedDate}
                  onChange={(e) => setPlayedDate(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium text-emerald-950">
                Score (strokes)
                <input
                  type="number"
                  required
                  min={18}
                  max={200}
                  className="mt-1 w-full rounded-md border border-emerald-900/25 bg-white px-3 py-2 text-sm tabular-nums"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="e.g. 42"
                />
              </label>
              <label className="block text-sm font-medium text-emerald-950">
                Par for the round
                <input
                  type="number"
                  required
                  min={18}
                  max={144}
                  className="mt-1 w-full rounded-md border border-emerald-900/25 bg-white px-3 py-2 text-sm tabular-nums"
                  value={par}
                  onChange={(e) => setPar(e.target.value)}
                />
              </label>
              {submitMessage ? (
                <p
                  className={
                    submitStatus === "ok" ? "text-sm text-emerald-800" : "text-sm text-red-700"
                  }
                >
                  {submitMessage}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitStatus === "loading"}
                  className="rounded-md bg-emerald-950 px-4 py-2 text-sm font-semibold text-[#f2efe4] disabled:opacity-60"
                >
                  {submitStatus === "loading" ? "Saving…" : "Save score"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-emerald-900/30 px-4 py-2 text-sm text-emerald-950"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {detailFor ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) {
              setDetailFor(null);
              setDetailRows(null);
              setDetailError(null);
            }
          }}
        >
          <div
            className="max-h-[min(90dvh,560px)] w-full max-w-lg overflow-y-auto rounded-sm border-2 border-emerald-900/35 bg-[#faf8f0] p-4 shadow-[4px_5px_0_0_rgba(6,60,45,0.15)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hh-detail-title"
          >
            <div className="flex items-start justify-between gap-2 border-b border-emerald-900/20 pb-3">
              <div>
                <h2 id="hh-detail-title" className="text-lg font-semibold text-emerald-950">
                  {detailFor.player_name}
                </h2>
                <p className="mt-0.5 text-xs text-emerald-900/65">
                  9-hole handicap (80% of avg vs par, up to five rounds):{" "}
                  <span className="font-mono font-semibold tabular-nums text-emerald-950">
                    {formatVersusParHandicap(Number(detailFor.handicap))}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-emerald-900/80 hover:bg-emerald-900/10"
                onClick={() => {
                  setDetailFor(null);
                  setDetailRows(null);
                  setDetailError(null);
                }}
              >
                Close
              </button>
            </div>
            {detailError ? <p className="mt-3 text-sm text-red-700">{detailError}</p> : null}
            {detailLoading ? (
              <p className="mt-4 text-sm text-zinc-600">Loading scores…</p>
            ) : detailRows && detailRows.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">No scores found.</p>
            ) : detailRows ? (
              <div className="mt-4 overflow-x-auto rounded-sm border border-emerald-900/20">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-emerald-950 text-[#f2efe4]">
                      <th className="px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                        Date
                      </th>
                      <th className="w-20 px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">
                        Score
                      </th>
                      <th className="w-16 px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">
                        Par
                      </th>
                      <th className="w-[4.5rem] px-2 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider">
                        Vs par
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((r, i) => (
                      <tr
                        key={r.id}
                        className={i % 2 === 1 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"}
                      >
                        <td className="border-t border-emerald-900/10 px-3 py-2 font-medium text-emerald-950">
                          {formatDisplayDate(r.played_date)}
                        </td>
                        <td className="border-t border-emerald-900/10 px-3 py-2 text-right font-mono tabular-nums">
                          {r.score}
                        </td>
                        <td className="border-t border-emerald-900/10 px-3 py-2 text-right font-mono tabular-nums text-emerald-900/85">
                          {r.par}
                        </td>
                        <td className="border-t border-emerald-900/10 px-2 py-2 text-right font-mono text-sm tabular-nums text-emerald-950">
                          {formatVersusParHandicap(r.score - r.par)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-emerald-900/70">
          League members using handicap helper
        </h2>
        <div className={scorecardShell}>
          <div className="border-b-2 border-emerald-900/25 bg-[#e8efe3] px-3 py-2 text-center">
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-emerald-900/65">
              9-hole handicap — 80% of avg strokes vs par (up to 5 rounds)
            </span>
          </div>
          <div className="overflow-x-auto">
            {sortedSummary.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-emerald-900/70">
                No scores yet. Use <strong>Add score</strong> to start tracking.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
                    <th
                      scope="col"
                      className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider"
                    >
                      Player
                    </th>
                    <th
                      scope="col"
                      className="min-w-[6.5rem] px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider"
                    >
                      #
                      <br />
                      submitted
                    </th>
                    <th
                      scope="col"
                      className="min-w-[6.5rem] px-3 py-2 text-right text-[0.65rem] font-bold uppercase tracking-wider"
                    >
                      9-hole
                      <br />
                      handicap
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSummary.map((row, i) => (
                    <tr
                      key={row.player_id}
                      tabIndex={0}
                      className={`cursor-pointer border-b border-emerald-900/15 last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-700 ${
                        i % 2 === 1 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"
                      } hover:bg-emerald-100/50`}
                      onClick={() => loadDetail(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          loadDetail(row);
                        }
                      }}
                    >
                      <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">
                        {row.player_name}
                      </td>
                      <td className="border-r border-emerald-900/15 px-3 py-2 text-right font-mono text-sm tabular-nums text-emerald-900/90">
                        {Number(row.rounds_submitted)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-sm font-semibold tabular-nums text-emerald-950">
                        {formatVersusParHandicap(Number(row.handicap))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** Handicap value is stored as rounded integer: over par as plain number; under par as +N. */
function formatVersusParHandicap(diff: number): string {
  if (!Number.isFinite(diff)) return "—";
  const v = Math.round(diff);
  if (v === 0) return "0";
  if (v < 0) return `+${Math.abs(v)}`;
  return String(v);
}

function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
