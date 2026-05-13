"use client";

import { useId, useMemo, useState } from "react";

type HoleNetDot = {
  hole: number;
  diff: number;
  team: string | null;
};

type SideData = {
  sideHoles: number[];
  strokeIndexByHole: Record<number, number>;
  perHole: HoleNetDot[];
};

export type DotsCalcSummary = {
  teamLabelA: string;
  teamLabelB: string;
  hcpA: number;
  hcpB: number;
};

export function VirtualDotsPreview({
  front,
  back,
  initialNine = "front",
  calcSummary,
}: {
  front: SideData;
  back: SideData;
  /** Which nine to show first (e.g. match `which_nine` from submitted rounds). */
  initialNine?: "front" | "back";
  /** When set, explains handicap difference math when expanding calculation details. */
  calcSummary?: DotsCalcSummary;
}) {
  const nineGroupId = useId();
  const [side, setSide] = useState<"front" | "back">(initialNine);
  const [showCalc, setShowCalc] = useState(false);
  const data = useMemo(() => (side === "back" ? back : front), [side, back, front]);

  return (
    <div className="space-y-3 p-3">
      <fieldset className="rounded-md border border-zinc-200 bg-white px-3 py-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">Show nine</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input
              type="radio"
              name={`virtual-nine-${nineGroupId}`}
              checked={side === "front"}
              onChange={() => setSide("front")}
            />
            Front 9
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input
              type="radio"
              name={`virtual-nine-${nineGroupId}`}
              checked={side === "back"}
              onChange={() => setSide("back")}
            />
            Back 9
          </label>
        </div>
      </fieldset>

      <div className="overflow-x-auto rounded-sm border border-emerald-900/20">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-emerald-900/25 bg-emerald-950 text-[#f2efe4]">
              <th className="border-r border-emerald-700/50 px-3 py-2 text-left text-[0.65rem] font-bold uppercase tracking-wider">
                {side === "front" ? "Front 9" : "Back 9"}
              </th>
              {data.sideHoles.map((h) => (
                <th
                  key={`${side}-${h}`}
                  className="border-r border-emerald-700/50 px-2 py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider last:border-r-0"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-emerald-900/15 bg-[#eef3e8]/90">
              <td className="border-r border-emerald-900/15 px-3 py-1.5 text-xs font-medium text-emerald-950">Stroke index</td>
              {data.sideHoles.map((h) => (
                <td
                  key={`${side}-si-${h}`}
                  className="border-r border-emerald-900/15 px-2 py-1.5 text-center font-mono text-xs text-emerald-900 last:border-r-0"
                >
                  {data.strokeIndexByHole[h] ?? "-"}
                </td>
              ))}
            </tr>
            <tr className="bg-[#f3f0e6]/90">
              <td className="border-r border-emerald-900/15 px-3 py-2 font-medium text-emerald-950">Net dots</td>
              {data.perHole.map((h) => (
                <td key={`${side}-net-${h.hole}`} className="border-r border-emerald-900/15 px-2 py-2 text-center last:border-r-0">
                  {h.diff > 0 && h.team ? (
                    <div className="flex flex-col items-center justify-center">
                      <span className="font-mono text-base leading-none tracking-[0.1em] text-emerald-900">
                        {"•".repeat(h.diff)}
                      </span>
                      <span className="mt-1 text-[10px] leading-none text-zinc-600">{h.team}</span>
                    </div>
                  ) : (
                    <span className="font-mono text-zinc-400">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-sm border border-emerald-900/20 bg-white/70 px-3 py-3">
        <button
          type="button"
          className="rounded-sm border border-emerald-800/25 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-900 shadow-sm hover:bg-[#f4f1e8]"
          onClick={() => setShowCalc((v) => !v)}
        >
          {showCalc ? "Hide calculation details" : "See how this was calculated"}
        </button>
        {showCalc ? (
          <div className="mt-3 space-y-3">
            {calcSummary ? (
              <div className="rounded-md border border-emerald-900/25 bg-[#f4f7f0] px-3 py-2.5 text-xs leading-relaxed text-emerald-950">
                <p className="font-semibold text-emerald-950">Handicap difference → match strokes</p>
                <p className="mt-1 font-mono tabular-nums">
                  <span className="font-sans font-normal text-emerald-900/85">{calcSummary.teamLabelA} combined:</span>{" "}
                  {calcSummary.hcpA}
                  <span className="mx-1 font-sans text-emerald-700">·</span>
                  <span className="font-sans font-normal text-emerald-900/85">{calcSummary.teamLabelB} combined:</span>{" "}
                  {calcSummary.hcpB}
                </p>
                <p className="mt-1 font-mono tabular-nums">
                  Difference: {calcSummary.hcpA} − {calcSummary.hcpB} ={" "}
                  <strong>{calcSummary.hcpA - calcSummary.hcpB}</strong>
                </p>
                {calcSummary.hcpA === calcSummary.hcpB ? (
                  <p className="mt-1 text-emerald-900/90">
                    Combined handicaps are equal, so net scoring uses gross only—no handicap strokes on either side.
                  </p>
                ) : (
                  <p className="mt-1 text-emerald-900/90">
                    Only the magnitude <strong>{Math.abs(calcSummary.hcpA - calcSummary.hcpB)}</strong> is spread across
                    this nine (extra strokes on the lowest stroke-index holes first). Those strokes apply only to{" "}
                    <strong>
                      {calcSummary.hcpA > calcSummary.hcpB ? calcSummary.teamLabelA : calcSummary.teamLabelB}
                    </strong>{" "}
                    (the higher combined handicap). The <strong>Net dots</strong> row on the scorecard above shows how many
                    of those strokes fall on each hole (the other team has no handicap strokes on net).
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
