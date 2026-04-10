import { AdminScoresClient } from "@/components/AdminScoresClient";

export const metadata = {
  title: "Admin — scores",
  robots: "noindex, nofollow",
};

export default function AdminScoresPage() {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-emerald-950 sm:text-2xl">Admin — score submissions</h1>
        <p className="mt-1 text-sm text-zinc-600 sm:text-base">Enter the league admin secret.</p>
      </div>
      <AdminScoresClient />
    </div>
  );
}
