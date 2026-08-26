import { existsSync } from "node:fs";
import path from "node:path";

const CANDIDATES = [
  "2026_champions_tyler_crew.jpeg",
  "2026_champions_tyler_crew.jpg",
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

export function ChampionshipWeekPhoto({
  caption,
}: {
  caption?: string;
}) {
  const src = resolveChampionshipPhotoSrc();
  if (!src) return null;

  return (
    <figure className="overflow-hidden rounded-2xl border border-amber-400/50 bg-[#fff8e8] shadow-[0_10px_28px_-14px_rgba(120,53,15,0.35)]">
      <div className="relative aspect-[3/4] w-full max-h-[28rem]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static public champion photo */}
        <img
          src={src}
          alt={caption ? `${caption} on the course` : "2026 champions on the course"}
          className="absolute inset-0 h-full w-full object-cover object-[center_72%]"
        />
      </div>
      {caption ? (
        <figcaption className="border-t border-amber-300/40 px-3 py-2 text-center text-[0.7rem] font-medium text-amber-950/75">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
