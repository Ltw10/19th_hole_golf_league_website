import Link from "next/link";
import { SCHEDULE_CURRENT_WEEK_ANCHOR } from "@/lib/schedule";

export function BackToScheduleButton() {
  return (
    <div className="w-full shrink-0">
      <Link
        href={`/schedule#${SCHEDULE_CURRENT_WEEK_ANCHOR}`}
        className="inline-flex min-h-[44px] items-center rounded-sm border border-emerald-800/25 bg-white px-2.5 py-1.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-[#f4f1e8]"
      >
        Back to schedule
      </Link>
    </div>
  );
}
