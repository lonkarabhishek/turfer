import { deletePhoto, getPhoto, patchPhoto, postPhoto, type PhotoDeps } from "@/lib/account/photoRoutes";
import { judgeProfilePhoto, photoJudgeReady } from "@/lib/account/photoJudge";
import { removeAvatarFiles, uploadAvatarFile } from "@/lib/account/photoServer";

// The signed-in person's picture: lib/account/photoRoutes.ts has the
// handlers, lib/account/types.ts the API.

// The check can take a while on a slow judge.
export const maxDuration = 60;

const deps: PhotoDeps = {
  judgeReady: photoJudgeReady,
  judge: judgeProfilePhoto,
  upload: uploadAvatarFile,
  remove: removeAvatarFiles,
};

/** What the photo choices can offer this sign-in. */
export function GET(req: Request) {
  return getPhoto(req, deps);
}

/** Upload a photo (the image itself is the body). */
export function POST(req: Request) {
  return postPhoto(req, deps);
}

/** An avatar, or this Google sign-in's photo. */
export function PATCH(req: Request) {
  return patchPhoto(req, deps);
}

/** No picture. */
export function DELETE(req: Request) {
  return deletePhoto(req, deps);
}
