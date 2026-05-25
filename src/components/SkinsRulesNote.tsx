import { SKINS_GROSS_OVER_NET_TIEBREAK_RULE, SKINS_STANDARD_RULES } from "@/lib/scoring";

export function SkinsRulesNote({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-sm border border-emerald-900/15 bg-white/70 px-3 py-2 text-xs text-zinc-700 ${className}`}
    >
      <p className="font-semibold text-emerald-950">How skins are won</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        {SKINS_STANDARD_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
        <li>
          <span className="font-medium text-emerald-950">Gross-over-net tiebreak (two players only):</span>{" "}
          {SKINS_GROSS_OVER_NET_TIEBREAK_RULE}
        </li>
      </ul>
    </div>
  );
}
