"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatSeasonPhase } from "@/lib/nhgl";

type Week = { id: string; week_number: number; week_date: string; phase: string };
type Player = { id: string; name: string };

type HoleRow = { player_id: string; hole: number };

type Props = {
  weeks: Week[];
  players: Player[];
};

function parseMoney(raw: string): number {
  const n = Number(String(raw).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Total pot = each buy-in × number of buyers; each winner gets (pot × their wins) / total skins. */
function payoutRowsFromSkins(
  holeWins: { player_id: string; hole: number }[],
  amountEach: number,
  buyerCount: number,
): { player_id: string; amount_won: number }[] {
  const totalPot = amountEach * buyerCount;
  const skinCount = holeWins.length;
  if (skinCount === 0 || totalPot <= 0) return [];

  const winsByPlayer = new Map<string, number>();
  for (const h of holeWins) {
    winsByPlayer.set(h.player_id, (winsByPlayer.get(h.player_id) ?? 0) + 1);
  }

  const rows: { player_id: string; amount_won: number }[] = [];
  for (const [player_id, wins] of winsByPlayer) {
    const amount_won = Math.round(((totalPot * wins) / skinCount) * 100) / 100;
    if (amount_won > 0) rows.push({ player_id, amount_won });
  }
  return rows;
}

export function SubmitSkinsForm({ weeks, players }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [weekId, setWeekId] = useState("");
  const [notes, setNotes] = useState("");
  const [holes, setHoles] = useState<HoleRow[]>([{ player_id: "", hole: 1 }]);

  const [substitutes, setSubstitutes] = useState<Player[]>([]);
  const [newSubName, setNewSubName] = useState("");
  const [addSubLoading, setAddSubLoading] = useState(false);
  const [addSubError, setAddSubError] = useState("");

  const [buyinIds, setBuyinIds] = useState<string[]>([]);
  const [buyinAmountEach, setBuyinAmountEach] = useState("");

  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [message, setMessage] = useState("");

  const allPlayers = useMemo(() => {
    const byId = new Map<string, Player>();
    for (const p of players) byId.set(p.id, p);
    for (const s of substitutes) byId.set(s.id, s);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [players, substitutes]);

  const buyinPlayers = useMemo(
    () => allPlayers.filter((p) => buyinIds.includes(p.id)),
    [allPlayers, buyinIds],
  );

  function toggleBuyin(id: string) {
    setBuyinIds((prev) => {
      if (prev.includes(id)) {
        setHoles((rows) =>
          rows.map((h) => (h.player_id === id ? { ...h, player_id: "" } : h)),
        );
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  }

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
    setSubstitutes((prev) => [...prev, { id, name }]);
    setNewSubName("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!weekId) return;
    setStatus("loading");
    setMessage("");

    const buyinSet = new Set(buyinIds);
    const holeWins = holes
      .filter(
        (h) =>
          h.player_id &&
          buyinSet.has(h.player_id) &&
          h.hole >= 1 &&
          h.hole <= 18,
      )
      .map((h) => ({ player_id: h.player_id, hole: h.hole }));

    const buyinAmtRaw = buyinAmountEach.trim();
    if (buyinIds.length > 0 && buyinAmtRaw !== "") {
      const n = Number(buyinAmtRaw.replace(/,/g, ""));
      if (Number.isNaN(n) || n < 0) {
        setStatus("err");
        setMessage("Buy-in amount must be a valid number (or leave blank if not tracking dollars).");
        return;
      }
    }

    const buyins = buyinIds.map((player_id) => ({
      player_id,
      amount: buyinAmtRaw === "" ? null : buyinAmtRaw.replace(/,/g, ""),
    }));

    const amountEachNum =
      buyinAmtRaw === "" ? 0 : parseMoney(buyinAmtRaw.replace(/,/g, ""));
    const payoutRows = payoutRowsFromSkins(holeWins, amountEachNum, buyinIds.length);

    const { error } = await supabase.rpc("submit_skins_week", {
      p_week_id: weekId,
      p_notes: notes || null,
      p_hole_wins: holeWins,
      p_buyins: buyins,
      p_payouts: payoutRows,
    });

    if (error) {
      setStatus("err");
      setMessage(error.message);
      return;
    }
    router.push("/standings");
  }

  return (
    <form onSubmit={onSubmit} className="w-full min-w-0 max-w-xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-zinc-700">Week</label>
        <select
          required
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-base"
          value={weekId}
          onChange={(e) => setWeekId(e.target.value)}
        >
          <option value="">Select week</option>
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>
              Week {w.week_number} ({w.week_date}) — {formatSeasonPhase(w.phase)}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-3">
        <p className="text-sm font-medium text-emerald-950">Substitute / guest players</p>
        <p className="mt-1 text-xs text-zinc-600">
          Add someone who is not on a league team for match play. They appear on the skins leaderboard only.
        </p>
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
            disabled={addSubLoading || !newSubName.trim()}
            className="min-h-[44px] shrink-0 rounded-md border border-emerald-700 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50"
            onClick={() => void addSubstitute()}
          >
            {addSubLoading ? "Adding…" : "Add player"}
          </button>
        </div>
        {addSubError ? <p className="mt-2 text-sm text-red-700">{addSubError}</p> : null}
        {substitutes.length > 0 ? (
          <ul className="mt-2 text-xs text-zinc-700">
            {substitutes.map((s) => (
              <li key={s.id}>
                Added: <span className="font-medium">{s.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-700">Who bought in?</p>
        <p className="text-xs text-zinc-500">Check every player who paid into the skins pot for this week.</p>
        <ul className="mt-3 space-y-2">
          {allPlayers.map((p) => {
            const on = buyinIds.includes(p.id);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 rounded border-zinc-300"
                    checked={on}
                    onChange={() => toggleBuyin(p.id)}
                  />
                  <span className="text-base">{p.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700">Hole skins (player + hole 1–18)</label>
        <p className="mt-1 text-xs text-zinc-500">
          Only players who bought in can win a hole skin. Payouts are calculated from the buy-in total and the number
          of skins below.
        </p>
        {buyinIds.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">Select who bought in above to record hole skins.</p>
        ) : (
          <>
            <ul className="mt-2 space-y-2">
              {holes.map((row, idx) => (
                <li key={idx} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                  <select
                    className="min-h-[44px] min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-base sm:min-w-[140px]"
                    value={row.player_id}
                    onChange={(e) => {
                      const next = [...holes];
                      next[idx] = { ...next[idx]!, player_id: e.target.value };
                      setHoles(next);
                    }}
                  >
                    <option value="">Player</option>
                    {buyinPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={18}
                    className="h-11 w-16 shrink-0 rounded-md border border-zinc-300 px-2 py-2 text-base sm:w-20"
                    value={row.hole}
                    onChange={(e) => {
                      const next = [...holes];
                      next[idx] = { ...next[idx]!, hole: Number(e.target.value) };
                      setHoles(next);
                    }}
                  />
                  <button
                    type="button"
                    className="min-h-[44px] shrink-0 px-1 text-sm text-red-700"
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
          </>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-zinc-700">Buy-in money</p>
        <p className="text-xs text-zinc-500">
          Total in the skins pot = (amount below) × (number of players who bought in). Each hole skin gets an equal
          share of that pot; if someone wins multiple holes, their payout is that share times how many skins they won.
          Leave blank if you are not tracking cash.
        </p>
        <label className="mt-2 flex max-w-xs flex-col gap-0.5 text-xs text-zinc-600">
          Amount each player paid ($)
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 5"
            className="mt-0.5 min-h-[44px] rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900"
            value={buyinAmountEach}
            onChange={(e) => setBuyinAmountEach(e.target.value)}
          />
        </label>
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

      <button
        type="submit"
        disabled={status === "loading" || !weekId}
        className="min-h-[44px] w-full rounded-md bg-emerald-800 px-4 py-3 text-base font-medium text-white hover:bg-emerald-900 disabled:opacity-50 sm:w-auto"
      >
        {status === "loading" ? "Saving…" : "Submit skins week"}
      </button>

      {message && (
        <p className={status === "ok" ? "text-emerald-800" : "text-red-700"}>{message}</p>
      )}
    </form>
  );
}
