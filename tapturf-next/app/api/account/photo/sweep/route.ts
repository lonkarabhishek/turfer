import { NextResponse } from "next/server";
import { revalidateSecretOk } from "@/lib/cache/secret";
import { sweepPhotoFiles } from "@/lib/account/photoRoutes";
import { removeAvatarFiles } from "@/lib/account/photoServer";

// POST /api/account/photo/sweep, from the database's quarter-hour job
// (private.user_photos_tick in 20261030_profile_photos.sql) with the
// x-revalidate-secret header. Removes the profile photo files a change
// listed but couldn't remove at the time, and those of unused tickets,
// as /api/my/photos/sweep does for owner photos.

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  if (!(await revalidateSecretOk(req.headers.get("x-revalidate-secret")))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const r = await sweepPhotoFiles({ remove: removeAvatarFiles });
  return NextResponse.json(r, { status: r.ok ? 200 : 503, headers: PRIVATE });
}
