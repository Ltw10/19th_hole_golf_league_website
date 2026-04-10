"use client";

import { useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Week = { id: string; week_number: number; week_date: string; phase: string };
type Player = { id: string; name: string };

type HoleRow = { player_id: string; hole: number };

type Props = {
  weeks: Week[];
  players: Player[];
};

export function SubmitSkinsForm({ weeks, players }: Props) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [weekId, setWeekId] = useState("");
  const [notes, setNotes] = useState("");
  const [holes, setHoles] = useState<HoleRow[]>([{ player_id: "", hole: 1 }]);
  const [buyinAmounts, setBuyinAmounts] = useState<Record<string, string>>({});
  const [payoutAmounts, setPayoutAmounts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  function toggleBuyin(playerId: string) {
    setBuyinAmounts((prev) => {
      const next = { ...prev };
      if (playerId in next) delete next[playerId];
      else next[playerId] = "";
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!weekId) return;
    setStatus("loading");
    setMessage("");

    const holeWins = holes
      .filter((h) => h.player_id && h.hole >= 1 && h.hole <= 18)
      .map((h) => ({ player_id: h.player_id, hole: h.hole }));

    const buyins = Object.entries(buyinAmounts).map(([player_id, amount]) => ({
      player_id,
      amount: amount === "" ? null : amount,
    }));

    const payouts = players
      .map((p) => {
        const raw = payoutAmounts[p.id];
        if (raw === undefined || raw === "" || Number(raw) === 0) return null;
        return { player_id: p.id, amount_won: Number(raw) };
      })
      .filter(Boolean) as { player_id: string; amount_won: number }[];

    const { error } = await supabase.rpc("submit_skins_week", {
      p_week_id: weekId,
      p_notes: notes || null,
      p_hole_wins: holeWins,
      p_buyins: buyins,
      p_payouts: payouts,
    });

    if (error) {
      setStatus("err");
      setMessage(error.message);
      return;
    }
    setStatus("ok");
    setMessage("Skins week saved. Thanks!");
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-700">Week</label>
        <select
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={weekId}
          onChange={(e) => setWeekId(e.target.value)}
        >
          <option value="">Select week</option>
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>
              Week {w.week_number} ({w.week_date}) — {w.phase}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Hole skins (player + hole 1–18)</label>
        <ul className="mt-2 space-y-2">
          {holes.map((row, idx) => (
            <li key={idx} className="flex flex-wrap gap-2">
              <select
                className="flex-1 min-w-[140px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                value={row.player_id}
                onChange={(e) => {
                  const next = [...holes];
                  next[idx] = { ...next[idx]!, player_id: e.target.value };
                  setHoles(next);
                }}
              >
                <option value="">Player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={18}
                className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                value={row.hole}
                onChange={(e) => {
                  const next = [...holes];
                  next[idx] = { ...next[idx]!, hole: Number(e.target.value) };
                  setHoles(next);
                }}
              />
              <button
                type="button"
                className="text-sm text-red-700"
                onClick={() => setHoles(holes.filter((_, i) => i !== idx))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-emerald-800"
          onClick={() => setHoles([...holes, { player_id: "", hole: 1 }])}
        >
          + Add hole win
        </button>
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-700">Buy-ins</p>
        <p className="text-xs text-zinc-500">Check each player who bought in; optional amount.</p>
        <ul className="mt-2 space-y-2">
          {players.map((p) => {
            const on = p.id in buyinAmounts;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleBuyin(p.id)}
                  />
                  {p.name}
                </label>
                {on && (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="$"
                    className="w-24 rounded-md border border-zinc-300 px-2 py-1"
                    value={buyinAmounts[p.id] ?? ""}
                    onChange={(e) =>
                      setBuyinAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-700">Payouts ($ won this week)</p>
        <p className="text-xs text-zinc-500">Enter amounts for players who cashed (0 or blank skips).</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{p.name}</span>
              <input
                type="text"
                inputMode="decimal"
                className="w-24 rounded-md border border-zinc-300 px-2 py-1"
                value={payoutAmounts[p.id] ?? ""}
                onChange={(e) =>
                  setPayoutAmounts((prev) => ({ ...prev, [p.id]: e.target.value }))
                }
              />
            </li>
          ))}
        </ul>
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

      <button
        type="submit"
        disabled={status === "loading" || !weekId}
        className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-50"
      >
        {status === "loading" ? "Saving…" : "Submit skins week"}
      </button>

      {message && (
        <p className={status === "ok" ? "text-emerald-800" : "text-red-700"}>{message}</p>
      )}
    </form>
  );
}
