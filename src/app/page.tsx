import Link from "next/link";

export default function Home() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-emerald-950">
          19th Hole Golf League
        </h1>
        <p className="mt-2 max-w-xl text-zinc-600">
          Tuesday evenings at 6:00. View the schedule and standings, submit match scores and
          scorecards, and enter weekly skins results.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        <li>
          <Link
            href="/schedule"
            className="block rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:border-emerald-800/25"
          >
            <span className="font-medium text-emerald-900">Schedule</span>
            <p className="mt-1 text-sm text-zinc-600">Week-by-week matchups</p>
          </Link>
        </li>
        <li>
          <Link
            href="/standings"
            className="block rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:border-emerald-800/25"
          >
            <span className="font-medium text-emerald-900">Standings</span>
            <p className="mt-1 text-sm text-zinc-600">Team points and skins leaders</p>
          </Link>
        </li>
        <li>
          <Link
            href="/submit-scores"
            className="block rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:border-emerald-800/25"
          >
            <span className="font-medium text-emerald-900">Submit scores</span>
            <p className="mt-1 text-sm text-zinc-600">Match points and scorecard photo</p>
          </Link>
        </li>
        <li>
          <Link
            href="/submit-skins"
            className="block rounded-lg border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:border-emerald-800/25"
          >
            <span className="font-medium text-emerald-900">Submit skins</span>
            <p className="mt-1 text-sm text-zinc-600">Hole winners, buy-ins, payouts</p>
          </Link>
        </li>
      </ul>
    </div>
  );
}
