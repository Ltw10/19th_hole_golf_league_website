"use client";

import { useMemo, useState } from "react";

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

export function VirtualDotsPreview({
  front,
  back,
}: {
  front: SideData;
  back: SideData;
}) {
  const [side, setSide] = useState<"front" | "back">("front");
  const data = useMemo(() => (side === "back" ? back : front), [side, back, front]);

  return (
    <div className="space-y-3 p-3">
      <fieldset className="rounded-md border border-zinc-200 bg-white px-3 py-2">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">Show nine</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input type="radio" name="virtual-nine" checked={side === "front"} onChange={() => setSide("front")} />
            Front 9
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input type="radio" name="virtual-nine" checked={side === "back"} onChange={() => setSide("back")} />
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
                  <div className="leading-tight">
                    <div>{h}</div>
                    <div className="mt-0.5 text-[0.55rem] font-medium tracking-normal text-emerald-100/90">
                      HCP {data.strokeIndexByHole[h] ?? "-"}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
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
    </div>
  );
}
