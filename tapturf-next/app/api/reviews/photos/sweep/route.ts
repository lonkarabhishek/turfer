import { NextResponse } from "next/server";
import { revalidateSecretOk } from "@/lib/cache/secret";
import { sweepReviewPhotos } from "@/lib/reviews/photoRoutes";
import { removeReviewPhotoFiles } from "@/lib/reviews/photoServer";

// POST /api/reviews/photos/sweep, from the database's quarter-hour job
// (private.review_photos_tick in 20261102_reviews_trust.sql) with the
// x-revalidate-secret header. Takes away the files of review photos
// nothing shows any more, as /api/account/photo/sweep does for profile photos.

const PRIVATE = { "Cache-Control": "private, no-store" };

export async function POST(req: Request) {
  if (!(await revalidateSecretOk(req.headers.get("x-revalidate-secret")))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const r = await sweepReviewPhotos({ remove: removeReviewPhotoFiles });
  return NextResponse.json(r, { status: r.ok ? 200 : 503, headers: PRIVATE });
}
