"use client";

import { useState } from "react";

export type SkinsHoleDetail = {
  hole: number;
  lowestNet: number | null;
  players: string[];
  result: "skin" | "tie" | "none";
};

export type SkinsWeekDetail = {
  whichNine: "front" | "back" | null;
  playerCount: number;
  buyers: string[];
  holes: SkinsHoleDetail[];
};

export function SkinsWeekDetailButton({
  weekLabel,
  detail,
}: {
  weekLabel: string;
  detail: SkinsWeekDetail | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="rounded-sm border border-emerald-800/25 bg-white px-2 py-1 text-xs font-medium text-emerald-900 shadow-sm hover:bg-[#f4f1e8]"
        onClick={() => setOpen(true)}
      >
        View details
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-md border-2 border-emerald-900/40 bg-[#faf8f0] shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-emerald-900/20 bg-[#e8efe3] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-emerald-950">Skins details - {weekLabel}</h3>
              </div>
              <button
                type="button"
                className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            {!detail || detail.playerCount === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-700">No skins participants submitted rounds for this week yet.</p>
            ) : (
              <div className="p-4">
                <p className="mb-3 text-xs text-zinc-600">
                  Nine: {detail.whichNine === "back" ? "Back 9 (10-18)" : "Front 9 (1-9)"} - Players in:{" "}
                  <span className="font-mono">{detail.playerCount}</span>
                </p>
                <div className="mb-3 rounded-sm border border-emerald-900/15 bg-white/70 px-3 py-2">
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-emerald-900/70">
                    Bought in ({detail.buyers.length})
                  </p>
                  <p className="mt-1 text-sm text-zinc-800">
                    {detail.buyers.length > 0 ? detail.buyers.join(", ") : "No buy-ins recorded."}
                  </p>
                </div>
                <div className="overflow-x-auto rounded-sm border border-emerald-900/20">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-emerald-900/20 bg-emerald-950 text-[#f2efe4]">
                        <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide">Hole</th>
                        <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide">Low net</th>
                        <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide">Players</th>
                        <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wide">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.holes.map((h, i) => (
                        <tr key={h.hole} className={`border-b border-emerald-900/10 last:border-b-0 ${i % 2 ? "bg-[#f3f0e6]/90" : "bg-[#faf8f0]"}`}>
                          <td className="px-3 py-2 font-mono text-emerald-950">{h.hole}</td>
                          <td className="px-3 py-2 text-center font-mono tabular-nums text-emerald-900">
                            {h.lowestNet == null ? "" : h.lowestNet}
                          </td>
                          <td className="px-3 py-2 text-zinc-800">{h.players.length > 0 ? h.players.join(", ") : ""}</td>
                          <td className="px-3 py-2 text-center">
                            {h.result === "skin" ? (
                              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Skin</span>
                            ) : h.result === "tie" ? (
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Tie</span>
                            ) : (
                              <span className="text-xs text-zinc-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
