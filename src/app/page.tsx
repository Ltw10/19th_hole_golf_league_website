import Image from "next/image";
import Link from "next/link";
import { getChampionshipResult } from "@/lib/championship";
import { SCHEDULE_CURRENT_WEEK_ANCHOR } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const links = [
  {
    href: "/submit-round",
    title: "Submit round",
    description: "Hole-by-hole scores, skins opt-in, optional scorecard — one form",
    tone: "primary" as const,
  },
  {
    href: `/schedule#${SCHEDULE_CURRENT_WEEK_ANCHOR}`,
    title: "Schedule",
    description: "Week-by-week matchups",
    tone: "default" as const,
  },
  {
    href: "/standings",
    title: "Standings",
    description: "Team points and skins leaders",
    tone: "default" as const,
  },
  {
    href: "/handicap-helper",
    title: "Handicap helper",
    description: "Log rounds and track average strokes vs par",
    tone: "default" as const,
  },
];

export default async function Home() {
  const championship = await getChampionshipResult();
  const championNames = championship?.championPlayerNames ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-10 sm:gap-12 lg:gap-14">
      {championNames.length > 0 ? (
        <section
          aria-labelledby="championship-preview-heading"
          className="championship-ribbon relative mx-auto w-full max-w-3xl px-1 sm:px-2"
        >
          <div className="championship-ribbon__frame relative">
            <svg
              className="championship-ribbon__svg pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 800 160"
              preserveAspectRatio="none"
              aria-hidden
            >
              <defs>
                <linearGradient id="champ-ribbon-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff8e4" />
                  <stop offset="55%" stopColor="#f1d98f" />
                  <stop offset="100%" stopColor="#e4c26a" />
                </linearGradient>
                <linearGradient id="champ-ribbon-edge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d4a84a" />
                  <stop offset="100%" stopColor="#a87a28" />
                </linearGradient>
              </defs>
              {/* Left fold */}
              <path
                d="M78 28 L18 12 L42 80 L18 148 L78 132 Z"
                fill="url(#champ-ribbon-edge)"
              />
              {/* Right fold */}
              <path
                d="M722 28 L782 12 L758 80 L782 148 L722 132 Z"
                fill="url(#champ-ribbon-edge)"
              />
              {/* Curved ribbon body */}
              <path
                d="M78 28
                   C 180 8, 320 2, 400 2
                   C 480 2, 620 8, 722 28
                   L 722 132
                   C 620 152, 480 158, 400 158
                   C 320 158, 180 152, 78 132
                   Z"
                fill="url(#champ-ribbon-fill)"
                stroke="#b8862c"
                strokeWidth="2"
              />
            </svg>
            <div className="relative z-10 px-10 py-6 text-center sm:px-16 sm:py-7">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.28em] text-amber-950/75 sm:text-xs">
                Championship Final
              </p>
              <h2
                id="championship-preview-heading"
                className="mt-1 text-xl font-bold tracking-tight text-emerald-950 sm:text-2xl"
              >
                🏆 Congrats to the 2026 Champions!
              </h2>
              <p className="mt-1.5 text-sm font-medium text-emerald-900/85 sm:text-base">
                {championNames.join(" & ")}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section
        aria-labelledby="home-heading"
        className="relative isolate overflow-hidden rounded-2xl border border-amber-200/50 bg-gradient-to-br from-[#faf6ed] via-[#f5f0e6] to-[#e6efe4] px-4 py-8 shadow-[0_8px_40px_-12px_rgba(20,60,40,0.18)] sm:rounded-[2rem] sm:px-8 sm:py-12 lg:px-12 lg:py-14"
      >
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-600/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl"
          aria-hidden
        />

        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-8 text-center md:flex-row md:items-center md:gap-10 md:text-left lg:gap-14">
          <div className="relative shrink-0">
            <div
              className="absolute inset-[-18%] rounded-full bg-gradient-to-br from-amber-200/35 to-emerald-800/10 blur-2xl"
              aria-hidden
            />
            <Image
              src="/19th_hole_golf_league_logo.png"
              alt="19th Hole Golf League — Est. 2024"
              width={320}
              height={320}
              priority
              sizes="(max-width: 768px) min(72vw, 260px), 240px"
              className="relative mx-auto h-auto w-[min(78vw,260px)] drop-shadow-md sm:w-56 md:w-60 lg:w-64"
            />
          </div>

          <div className="min-w-0 max-w-xl space-y-4 text-pretty break-words md:flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-900/85 sm:text-sm">
              Tuesday evenings · 6:00
            </p>
            <h1
              id="home-heading"
              className="text-[1.65rem] font-bold leading-tight tracking-tight text-emerald-950 sm:text-3xl md:text-4xl lg:text-[2.35rem] lg:leading-[1.15]"
            >
              19th Hole Golf League @ Hickory Sticks
            </h1>
            <p className="text-base leading-relaxed text-zinc-700 sm:text-lg">
              View the schedule and standings, submit your round once for handicaps, skins, and team points — all in one
              place.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-links-heading" className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="quick-links-heading"
            className="text-lg font-semibold tracking-tight text-emerald-950 sm:text-xl"
          >
            League hub
          </h2>
          <p className="text-sm text-zinc-500">Jump to a page</p>
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {links.map((item) => {
            const linkClass =
              item.tone === "primary"
                ? "border-emerald-800/30 bg-[#f4faf6] ring-emerald-900/10 hover:border-emerald-700/50"
                : "border-emerald-900/10 bg-white/90 hover:border-amber-300/60";
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex min-h-[3.5rem] h-full flex-col rounded-2xl border p-5 shadow-sm ring-1 ring-black/[0.03] transition duration-200 active:bg-zinc-50 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600/70 sm:p-6 ${linkClass}`}
                >
                  <span className="font-semibold text-emerald-950 transition group-hover:text-emerald-900">
                    {item.title}
                  </span>
                  <span className="mt-1.5 text-sm leading-snug text-zinc-600">{item.description}</span>
                  <span className="mt-3 inline-flex items-center text-sm font-medium text-amber-900/75 sm:mt-4">
                    Continue
                    <span className="ml-1 transition group-hover:translate-x-0.5 motion-reduce:transform-none">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
