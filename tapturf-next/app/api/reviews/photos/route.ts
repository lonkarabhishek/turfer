import { deleteReviewPhoto, getReviewPhotos, postReviewPhoto, type ReviewPhotoDeps } from "@/lib/reviews/photoRoutes";
import { judgeReviewPhoto, reviewPhotoJudgeReady } from "@/lib/reviews/photoJudge";
import { removeReviewPhotoFiles, uploadReviewPhotoFile } from "@/lib/reviews/photoServer";

// Photos from the game on a signed-in player's report: lib/reviews/photoRoutes.ts
// has the handlers, lib/reviews/types.ts the API.

// The check can take a while on a slow judge.
export const maxDuration = 60;

const deps: ReviewPhotoDeps = {
  judgeReady: reviewPhotoJudgeReady,
  judge: judgeReviewPhoto,
  upload: uploadReviewPhotoFile,
  remove: removeReviewPhotoFiles,
};

/** Whether the sheet can offer photos, and how many are left today. */
export function GET(req: Request) {
  return getReviewPhotos(req, deps);
}

/** ?turf=<uuid>: add a photo (a form with the photo and its thumbnail). */
export function POST(req: Request) {
  return postReviewPhoto(req, deps);
}

/** ?id=<uuid>: a photo taken out of the sheet before it was posted. */
export function DELETE(req: Request) {
  return deleteReviewPhoto(req, deps);
}
