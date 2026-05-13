"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { SCHEDULE_CURRENT_WEEK_ANCHOR } from "@/lib/schedule";

/** Ensures `/schedule#schedule-current-week` scrolls to the current week after App Router client navigations. */
export function ScrollToScheduleAnchor() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (pathname !== "/schedule") return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== `#${SCHEDULE_CURRENT_WEEK_ANCHOR}`) return;
    const el = document.getElementById(SCHEDULE_CURRENT_WEEK_ANCHOR);
    if (el) el.scrollIntoView({ block: "start" });
  }, [pathname]);

  return null;
}
