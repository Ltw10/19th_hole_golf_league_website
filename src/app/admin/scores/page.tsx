import { AdminScoresClient } from "@/components/AdminScoresClient";

export const metadata = {
  title: "Admin — scores",
  robots: "noindex, nofollow",
};

export default function AdminScoresPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-950">Admin — score submissions</h1>
        <p className="mt-1 text-zinc-600">
          Edit or delete bad submissions. Requires the server-side admin secret.
        </p>
      </div>
      <AdminScoresClient />
    </div>
  );
}
