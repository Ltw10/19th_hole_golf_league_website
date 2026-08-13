import { StormWeekPhoto } from "@/components/StormWeekPhoto";

export function WeatherCancelWeek({
  weekNumber,
  weekDate,
  notes,
}: {
  weekNumber: number;
  weekDate: string;
  notes: string | null;
}) {
  return (
    <div className="weather-cancel-week relative overflow-hidden bg-gradient-to-b from-[#1a2332] via-[#243044] to-[#1e293b] text-slate-100">
      <div className="weather-cancel-sky pointer-events-none absolute inset-0" aria-hidden />
      <div className="weather-lightning pointer-events-none absolute inset-0" aria-hidden />
      <div className="weather-lightning weather-lightning--delay pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative border-b border-slate-500/30 px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-300/70">
              Week {weekNumber}
              <span className="ml-2 inline-block rounded-sm bg-amber-500/90 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-slate-950">
                Cancelled
              </span>
            </p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight text-slate-50">Weather cancel</h2>
          </div>
          <time dateTime={weekDate} className="font-mono text-xs text-slate-300/85 sm:text-sm">
            {formatDate(weekDate)}
            <span className="block text-right text-[0.65rem] font-sans uppercase tracking-wider text-slate-400/80 sm:ml-2 sm:inline sm:text-xs">
              No play
            </span>
          </time>
        </div>
      </div>

      <div className="relative grid gap-5 px-3 py-5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] sm:gap-6 sm:px-4 sm:py-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <TornadoIcon className="weather-tornado mt-0.5 h-12 w-12 shrink-0 text-slate-200/90" />
            <div>
              <p className="text-sm leading-relaxed text-slate-200/90">
                {notes ??
                  "Cancelled due to a tornado warning and severe thunderstorms. Matchups postponed one week."}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Regular-season play resumes Week 16 · Championship is Week 17.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1" aria-hidden>
            <LightningBolt className="weather-bolt h-8 w-8 text-amber-200/90" />
            <LightningBolt className="weather-bolt weather-bolt--alt h-7 w-7 text-yellow-100/80" />
            <LightningBolt className="weather-bolt weather-bolt--late h-9 w-9 text-amber-100/85" />
          </div>
        </div>

        <StormWeekPhoto />
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function TornadoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M8 10c8-4 40-4 48 0-6 3-38 3-48 0Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M14 18c6-3 30-3 36 0-5 2.5-29 2.5-36 0Z"
        fill="currentColor"
        opacity="0.5"
      />
      <path
        d="M20 26c5-2.2 20-2.2 24 0-4 2-18 2-24 0Z"
        fill="currentColor"
        opacity="0.65"
      />
      <path
        d="M24 34c3.5-1.6 13-1.6 16 0-3 1.4-12 1.4-16 0Z"
        fill="currentColor"
        opacity="0.8"
      />
      <path
        d="M28 42c2.2-1 8-1 10 0-2 0.9-7.5 0.9-10 0Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path d="M30.5 50c1.2-0.6 4-0.6 5 0-1.2 0.55-3.6 0.55-5 0Z" fill="currentColor" />
      <path
        className="weather-debris"
        d="M12 22h3M48 28h4M18 36h2.5M42 40h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

function LightningBolt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 40" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 0 3 22h8l-2 18 14-24h-8L21 0H13Z" />
    </svg>
  );
}
