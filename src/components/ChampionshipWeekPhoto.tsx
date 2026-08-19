import { existsSync } from "node:fs";
import path from "node:path";

const CANDIDATES = [
  "championship-week-2026.jpeg",
  "championship-week-2026.jpg",
  "championship-week-2026.png",
  "championship-week-2026.webp",
] as const;

function resolveChampionshipPhotoSrc(): string | null {
  const publicDir = path.join(process.cwd(), "public");
  for (const name of CANDIDATES) {
    if (existsSync(path.join(publicDir, name))) return `/${name}`;
  }
  return null;
}

export function ChampionshipWeekPhoto() {
  const src = resolveChampionshipPhotoSrc();

  return (
    <figure className="overflow-hidden rounded-sm border-2 border-amber-700/40 bg-emerald-950/35 shadow-[inset_0_0_40px_rgba(0,0,0,0.3)]">
      <div className="relative aspect-[3/4] w-full sm:aspect-[16/10]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- static public upload resolved at request time
          <img
            src={src}
            alt="2026 championship team photo on the course"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-amber-200/70">
              Championship photo
            </p>
            <p className="max-w-sm text-sm text-amber-50/85">
              Add a photo as{" "}
              <span className="font-mono text-xs text-amber-100/95">public/championship-week-2026.jpeg</span>.
            </p>
          </div>
        )}
      </div>
      <figcaption className="border-t border-amber-300/25 px-3 py-2 text-center text-[0.7rem] text-amber-100/75">
        Championship night · 2026 season
      </figcaption>
    </figure>
  );
}
