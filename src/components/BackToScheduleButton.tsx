"use client";

import { useRouter } from "next/navigation";

export function BackToScheduleButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="rounded-sm border border-emerald-800/25 bg-white px-2.5 py-1.5 text-sm font-medium text-emerald-900 shadow-sm hover:bg-[#f4f1e8]"
      onClick={() => router.push("/schedule")}
    >
      Back to schedule
    </button>
  );
}
