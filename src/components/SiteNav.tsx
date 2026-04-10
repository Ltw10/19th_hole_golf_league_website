"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/schedule", label: "Schedule" },
  { href: "/standings", label: "Standings" },
  { href: "/submit-scores", label: "Submit Scores" },
  { href: "/submit-skins", label: "Submit Skins" },
  { href: "/admin/scores", label: "Admin" },
] as const;

function MenuIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (mq.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-emerald-900/15 bg-emerald-950/95 backdrop-blur-sm">
      <div className="relative mx-auto max-w-5xl px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div className="flex min-h-[3.25rem] items-center justify-between gap-2 py-2">
          <Link
            href="/"
            className="flex min-w-0 max-w-[min(100%,calc(100%-3.25rem))] items-center gap-2 text-white md:max-w-none"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/19th_hole_golf_league_logo_cropped.png"
              alt=""
              width={40}
              height={40}
              className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
            />
            <span className="truncate text-sm font-semibold leading-snug tracking-tight sm:text-base">
              19th Hole Golf League
            </span>
          </Link>

          <nav
            className="hidden items-center gap-x-1 md:flex md:flex-wrap lg:gap-x-3"
            aria-label="Main"
          >
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-2.5 py-2 text-sm text-emerald-100/90 hover:bg-white/10 hover:text-white lg:px-3"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            className="inline-flex h-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md border border-white/25 text-white hover:bg-white/10 md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {open ? (
          <nav
            id="mobile-nav"
            className="border-t border-white/15 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 md:hidden"
            aria-label="Main"
          >
            <ul className="flex flex-col">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block min-h-[44px] rounded-md px-3 py-3 text-base leading-snug text-emerald-50 active:bg-white/10"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
