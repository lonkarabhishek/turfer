import type { NextResponse } from "next/server";
import { imageInfo, stripPhotoDetails, type ImageInfo } from "../account/avatar";
import { accountError, accountReply, caller, later } from "../account/route";
import { createAccountLimiter, resolveAccount } from "../account/server";
import type { Identity } from "../account/identity";
import { isUuid } from "./payload";
import { photoSizesOk, REVIEW_PHOTOS } from "./photos";
import { photoDiscard, photoEnd, photoFilesGone, photoFinish, photoReady, photoStart, photoSweepList, type PhotoFiles } from "./photoServer";
import type { PhotoProblem } from "./types";

// Photos from the game on a report (lib/reviews/types.ts has the API), for
// app/api/reviews/photos. Checks the caller as the review routes do. A
// photo is checked (the judge) before it is stored, and only the server
// writes to the bucket, as profile photos do (lib/account/photoRoutes.ts).
// The check and the bucket come in as deps, so the tests never call
// either. Relative imports only (npm run test:reviews).

/** What a photo check answered (lib/reviews/photoJudge.ts). */
export type JudgeAnswer =
  | { ok: true; verdict: object }
  | { ok: false; problem: PhotoProblem; verdict: object }
  | { unreadable: true }
  | { down: true };

export type ReviewPhotoDeps = {
  /** Whether photos can be checked at all (the judge is set up). */
  judgeReady: () => boolean;
  judge: (full: Uint8Array, thumb: Uint8Array, media: "image/webp" | "image/jpeg") => Promise<JudgeAnswer>;
  upload: (path: string, bytes: Uint8Array, media: "image/webp" | "image/jpeg") => Promise<boolean>;
  /** The paths it took away. */
  remove: (paths: string[]) => Promise<string[]>;
};

const allowRead = createAccountLimiter(30);
const allowWrite = createAccountLimiter(20);

/** A little over the two files' limits, for the form's own bytes. */
const BODY_CAP = REVIEW_PHOTOS.maxBytes + REVIEW_PHOTOS.thumbMaxBytes + 64 * 1024;

/** The account for this sign-in, or the reply to send instead. */
async function account(id: Identity): Promise<{ userId: string } | { reply: NextResponse }> {
  const r = await resolveAccount(id);
  if ("unavailable" in r) return { reply: accountError("unavailable") };
  if ("r" in r) return { reply: accountError(r.r === "new" || r.r === "name" ? "new" : "unavailable") };
  return { userId: r.ok.id };
}

/** After the reply: take away the files nothing shows any more, then mark them gone. */
function removeLater(deps: Pick<ReviewPhotoDeps, "remove">, files: PhotoFiles[]) {
  if (files.length === 0) return;
  later(async () => {
    const removed = new Set(await deps.remove(files.flatMap((f) => f.paths)));
    await photoFilesGone(files.filter((f) => f.paths.every((p) => removed.has(p))).map((f) => f.id));
  });
}

/** GET: whether the sheet can offer photos, and how many this account has left today. Before the migration: ready false, nothing breaks. */
export async function getReviewPhotos(req: Request, deps: Pick<ReviewPhotoDeps, "judgeReady">): Promise<NextResponse> {
  const who = await caller(req, allowRead);
  if ("reply" in who) return who.reply;
  const acc = await account(who.id);
  if ("reply" in acc) return acc.reply;
  const ready = await photoReady(acc.userId);
  if ("unavailable" in ready) return accountError("unavailable");
  if ("missing" in ready) return accountReply({ ready: false, upload: false, left: 0 });
  return accountReply({ ready: true, upload: !ready.ok.paused && deps.judgeReady(), left: ready.ok.left });
}

/** One part of the form as bytes, or null. */
async function part(form: FormData, name: string): Promise<Uint8Array | null> {
  const v = form.get(name);
  if (!v || typeof v === "string") return null;
  try {
    return new Uint8Array(await v.arrayBuffer());
  } catch {
    return null;
  }
}

/** The two files, read for what they are (never the sender's word) and with the camera's details taken out; or why not. */
export function checkPhotoFiles(full: Uint8Array | null, thumb: Uint8Array | null):
  | { ok: { full: Uint8Array; thumb: Uint8Array; info: ImageInfo; thumbInfo: ImageInfo } }
  | { problem: "not_photo" | "too_big" | "too_small" } {
  const info = full ? imageInfo(full) : null;
  const thumbInfo = thumb ? imageInfo(thumb) : null;
  if (!full || !thumb || !info || !thumbInfo || info.type !== thumbInfo.type) return { problem: "not_photo" };
  const f = stripPhotoDetails(full);
  const t = stripPhotoDetails(thumb);
  if (!f || !t) return { problem: "not_photo" };
  if (f.length > REVIEW_PHOTOS.maxBytes || t.length > REVIEW_PHOTOS.thumbMaxBytes || t.length >= f.length) return { problem: "too_big" };
  if (f.length < 1000 || t.length < 200 || !photoSizesOk(info, thumbInfo)) return { problem: "too_small" };
  return { ok: { full: f, thumb: t, info, thumbInfo } };
}

/**
 * POST ?turf=<uuid>, a form with full and thumb: a photo the phone made
 * smaller (lib/reviews/photoPrep.ts) and its thumbnail. Checked here for
 * what they are, the camera's details taken out again, then judged; only a
 * photo the check passes is stored. It is ready to go on a report: the
 * sheet sends its id with the report (review_save).
 */
export async function postReviewPhoto(req: Request, deps: ReviewPhotoDeps): Promise<NextResponse> {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const turf = new URL(req.url).searchParams.get("turf");
  if (!isUuid(turf)) return accountError("bad");
  if (Number(req.headers.get("content-length")) > BODY_CAP) return accountReply({ problem: "too_big" }, "bad");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return accountError("bad");
  }
  const files = checkPhotoFiles(await part(form, "full"), await part(form, "thumb"));
  if ("problem" in files) return accountReply({ problem: files.problem }, "bad");
  if (!deps.judgeReady()) return accountError("unchecked");

  const acc = await account(who.id);
  if ("reply" in acc) return acc.reply;
  const userId = acc.userId;
  const { full, thumb, info } = files.ok;
  const media = info.type === "webp" ? "image/webp" : "image/jpeg";
  const ticket = await photoStart(userId, turf.toLowerCase(), { ext: info.type === "webp" ? "webp" : "jpg", bytes: full.length, thumbBytes: thumb.length, w: info.w, h: info.h });
  if ("missing" in ticket) return accountReply({ reason: "not_ready" }, "unavailable");
  if ("unavailable" in ticket) return accountError("unavailable");
  if ("r" in ticket) {
    if (ticket.r === "own_turf") return accountReply({ reason: "own_turf" }, "not_allowed");
    if (ticket.r === "gone") return accountReply({ reason: "gone" }, "bad");
    return accountError(ticket.r === "paused" ? "unchecked" : ticket.r);
  }
  const { id, path, thumb: thumbPath, left } = ticket.ok;

  const verdict = await deps.judge(full, thumb, media);
  if ("down" in verdict) {
    await photoEnd(userId, id, "unchecked");
    return accountError("unchecked");
  }
  if ("unreadable" in verdict) {
    await photoEnd(userId, id, "refused", { unreadable: true });
    return accountReply({ problem: "not_photo" }, "bad");
  }
  if (!verdict.ok) {
    await photoEnd(userId, id, "refused", verdict.verdict);
    return accountReply({ problem: verdict.problem }, "refused");
  }
  const [a, b] = await Promise.all([deps.upload(path, full, media), deps.upload(thumbPath, thumb, media)]);
  if (!a || !b) {
    // Its files, if one went, go with the ticket (the sweep).
    await photoEnd(userId, id, "expired");
    return accountError("unavailable");
  }
  const done = await photoFinish(userId, id, verdict.verdict);
  if (!("ok" in done)) {
    await photoEnd(userId, id, "expired");
    return accountError("unavailable");
  }
  return accountReply({ r: "ok", photo: done.ok, left });
}

/** DELETE ?id=<uuid>: a photo taken out of the sheet before it was posted. Its files are taken away after the reply. */
export async function deleteReviewPhoto(req: Request, deps: Pick<ReviewPhotoDeps, "remove">): Promise<NextResponse> {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return accountError("bad");
  const acc = await account(who.id);
  if ("reply" in acc) return acc.reply;
  const r = await photoDiscard(acc.userId, id.toLowerCase());
  if ("missing" in r) return accountReply({ reason: "not_ready" }, "unavailable");
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return accountError("bad");
  removeLater(deps, r.ok);
  return accountReply({ r: "ok" });
}

export type SweepResult = { ok: true; listed: number; removed: number } | { ok: false; error: "unavailable" };

/**
 * The quarter-hour job's work (/api/reviews/photos/sweep): the files of
 * photos nothing shows any more (taken off a report, a report taken down
 * or hidden, never posted, tickets never finished), taken away and marked
 * gone. Nothing to do before the migration.
 */
export async function sweepReviewPhotos(deps: Pick<ReviewPhotoDeps, "remove">): Promise<SweepResult> {
  const list = await photoSweepList();
  if ("unavailable" in list) return { ok: false, error: "unavailable" };
  if ("missing" in list || list.ok.length === 0) return { ok: true, listed: 0, removed: 0 };
  const removed = new Set(await deps.remove(list.ok.flatMap((f) => f.paths)));
  const gone = list.ok.filter((f) => f.paths.every((p) => removed.has(p))).map((f) => f.id);
  await photoFilesGone(gone);
  return { ok: true, listed: list.ok.length, removed: gone.length };
}
