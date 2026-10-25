import { NextResponse } from "next/server";
import { revalidateSecretOk } from "@/lib/cache/secret";
import { sweepOwnerPhotos } from "@/lib/my/photoJudge";

// POST /api/my/photos/sweep, from the database's minute job
// (private.owner_photos_tick in 20261025_owner_photos.sql) with the
// x-revalidate-secret header. Checks owner photos the upload's own check
// missed (a closed tab, a failed call) and removes the files of removed
// photos and unused tickets. The photos' pages refresh through the cache
// queue, as for any turf edit.

export const maxDuration = 60;

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  if (!(await revalidateSecretOk(req.headers.get("x-revalidate-secret")))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const r = await sweepOwnerPhotos();
  return NextResponse.json(r, { status: r.ok ? 200 : 503, headers: PRIVATE });
}
