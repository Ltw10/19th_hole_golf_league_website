import { existsSync } from "node:fs";
import path from "node:path";

const CANDIDATES = [
  "week-15-storm.jpeg",
  "week-15-storm.jpg",
  "week-15-storm.png",
  "week-15-storm.webp",
] as const;

function resolveStormPhotoSrc(): string | null {
  const publicDir = path.join(process.cwd(), "public");
  for (const name of CANDIDATES) {
    if (existsSync(path.join(publicDir, name))) return `/${name}`;
  }
  return null;
}

export function StormWeekPhoto() {
  const src = resolveStormPhotoSrc();

  return (
    <figure className="overflow-hidden rounded-sm border-2 border-slate-700/50 bg-slate-950/40 shadow-[inset_0_0_40px_rgba(0,0,0,0.35)]">
      <div className="relative aspect-[3/4] w-full sm:aspect-[16/10]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- static public upload resolved at request time
          <img
            src={src}
            alt="Downed tree on the golf course after the Week 15 storm"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-slate-300/70">
              Storm photo
            </p>
            <p className="max-w-sm text-sm text-slate-200/80">
              Space reserved for the downed-tree photo from the course. Add the file as{" "}
              <span className="font-mono text-xs text-amber-100/90">public/week-15-storm.jpeg</span>.
            </p>
          </div>
        )}
      </div>
      <figcaption className="border-t border-slate-600/40 px-3 py-2 text-center text-[0.7rem] text-slate-300/75">
        On the course · Aug 11, 2026
      </figcaption>
    </figure>
  );
}
