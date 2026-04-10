import Image from "next/image";
import Link from "next/link";

const links = [
  {
    href: "/schedule",
    title: "Schedule",
    description: "Week-by-week matchups",
  },
  {
    href: "/standings",
    title: "Standings",
    description: "Team points and skins leaders",
  },
  {
    href: "/submit-scores",
    title: "Submit scores",
    description: "Match points and scorecard photo",
  },
  {
    href: "/submit-skins",
    title: "Submit skins",
    description: "Hole winners, buy-ins, payouts",
  },
] as const;

export default function Home() {
  return (
    <div className="flex min-w-0 flex-col gap-10 sm:gap-12 lg:gap-14">
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
              View the schedule and standings, submit match scores and scorecards, and enter weekly skins
              results — all in one place.
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
          {links.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex min-h-[3.5rem] h-full flex-col rounded-2xl border border-emerald-900/10 bg-white/90 p-5 shadow-sm ring-1 ring-black/[0.03] transition duration-200 active:bg-zinc-50 hover:-translate-y-0.5 hover:border-amber-300/60 hover:shadow-md motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600/70 sm:p-6"
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
          ))}
        </ul>
      </section>
    </div>
  );
}
