import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { SCORECARDS_BUCKET } from "@/lib/nhgl";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function verify(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const expected = process.env.NHGL_ADMIN_SECRET;
  if (!expected || !secret || secret !== expected) return false;
  return true;
}

/** Extract object path within bucket from a public Storage URL for this project. */
function storagePathFromPublicUrl(publicUrl: string, supabaseProjectUrl: string): string | null {
  const marker = `/storage/v1/object/public/${SCORECARDS_BUCKET}/`;
  const normalized = publicUrl.trim();
  const idx = normalized.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(normalized.slice(idx + marker.length).split("?")[0] ?? "");
}

type Params = { params: Promise<{ id: string }> };

/** Upload a new scorecard image, update the row, then remove the previous object from Storage. */
export async function POST(req: Request, { params }: Params) {
  if (!verify(req)) return unauthorized();
  const { id } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.type && !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!projectUrl) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL" }, { status: 500 });
  }

  const admin = createAdminSupabaseClient();

  const { data: row, error: fetchErr } = await admin
    .from("score_submissions")
    .select("id, scorecard_image_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const oldUrl = row.scorecard_image_url;
  const oldPath = oldUrl ? storagePathFromPublicUrl(oldUrl, projectUrl) : null;

  const path = `nhgl/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(SCORECARDS_BUCKET)
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const {
    data: { publicUrl },
  } = admin.storage.from(SCORECARDS_BUCKET).getPublicUrl(path);

  const { data: updated, error: updateErr } = await admin
    .from("score_submissions")
    .update({ scorecard_image_url: publicUrl })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (updateErr) {
    await admin.storage.from(SCORECARDS_BUCKET).remove([path]);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (oldPath) {
    const { error: rmErr } = await admin.storage.from(SCORECARDS_BUCKET).remove([oldPath]);
    if (rmErr) {
      console.warn("[admin scorecard] failed to remove old object", oldPath, rmErr.message);
    }
  }

  return NextResponse.json({ data: updated });
}
