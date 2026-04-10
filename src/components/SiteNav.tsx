import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "/schedule", label: "Schedule" },
  { href: "/standings", label: "Standings" },
  { href: "/submit-scores", label: "Submit scores" },
  { href: "/submit-skins", label: "Submit skins" },
  { href: "/admin/scores", label: "Admin" },
];

export function SiteNav() {
  return (
    <header className="border-b border-emerald-900/15 bg-emerald-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-white">
          <Image
            src="/logo.png"
            alt=""
            width={40}
            height={40}
            className="rounded-sm"
          />
          <span className="font-semibold tracking-tight">19th Hole Golf League</span>
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-emerald-100/90 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
