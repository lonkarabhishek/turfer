import type { NextResponse } from "next/server";
import { googlePhotoToKeep, imageInfo, isPresetId, PHOTO_UPLOAD, stripPhotoDetails, uploadProblem } from "./avatar";
import type { Identity } from "./identity";
import { photoDrop, photoFilesGone, photoFinish, photoReady, photoSet, photoStart, photoSweepList, type PhotoChangeResult, type PhotoFile } from "./photoServer";
import { refreshProfilePage } from "./profilePage";
import { accountError, accountReply, caller, later } from "./route";
import { createAccountLimiter, readSmallJson, resolveAccount } from "./server";
import type { AccountProfile, PhotoProblem } from "./types";

// The signed-in person's picture (lib/account/types.ts has the API), for
// app/api/account/photo. Checks the caller as the other account routes do
// (lib/account/route.ts caller). An upload is checked (the judge) before
// it is stored, and only the server writes to the bucket. The check and
// the bucket come in as deps, so the tests never call either. Relative
// imports only (npm run test:account).

/** What a photo check answered (lib/account/photoJudge.ts). */
export type JudgeAnswer =
  | { ok: true; verdict: object }
  | { ok: false; problem: PhotoProblem; verdict: object }
  | { unreadable: true }
  | { down: true };

export type PhotoDeps = {
  /** Whether photos can be checked at all (the judge is set up). */
  judgeReady: () => boolean;
  judge: (bytes: Uint8Array, media: "image/webp" | "image/jpeg") => Promise<JudgeAnswer>;
  upload: (path: string, bytes: Uint8Array, media: "image/webp" | "image/jpeg") => Promise<boolean>;
  /** The paths it removed. */
  remove: (paths: string[]) => Promise<string[]>;
};

const allowRead = createAccountLimiter(30);
const allowWrite = createAccountLimiter(12);

/** The account for this sign-in, or the reply to send instead. */
async function account(id: Identity): Promise<{ me: AccountProfile } | { reply: NextResponse }> {
  const r = await resolveAccount(id);
  if ("unavailable" in r) return { reply: accountError("unavailable") };
  if ("r" in r) return { reply: accountError(r.r === "name" ? "new" : r.r) };
  return { me: r.ok };
}

/** After the reply: remove the files nothing shows any more, then mark them gone. */
function removeLater(deps: PhotoDeps, userId: string, files: PhotoFile[]) {
  if (files.length === 0) return;
  later(async () => {
    const removed = new Set(await deps.remove(files.map((f) => f.path)));
    await photoFilesGone(
      userId,
      files.filter((f) => removed.has(f.path)).map((f) => f.id),
    );
  });
}

/** The answer to a change: the profile, the old files removed after the reply, the public page refreshed. */
function changed(deps: PhotoDeps, userId: string, r: PhotoChangeResult): NextResponse {
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return accountError(r.r === "bad" ? "bad" : "unavailable");
  removeLater(deps, userId, r.files);
  refreshProfilePage(r.ok);
  return accountReply({ profile: r.ok });
}

/** GET: what the photo choices can offer this sign-in. Before the migration: ready false, nothing breaks. */
export async function getPhoto(req: Request, deps: PhotoDeps): Promise<NextResponse> {
  const who = await caller(req, allowRead);
  if ("reply" in who) return who.reply;
  const ready = await photoReady();
  if ("unavailable" in ready) return accountError("unavailable");
  const google = who.id.kind === "google" ? googlePhotoToKeep(who.id.avatar) : null;
  if ("missing" in ready) return accountReply({ ready: false, upload: false, google });
  return accountReply({ ready: true, upload: !ready.ok.paused && deps.judgeReady(), google });
}

/**
 * POST <image>: a photo the browser cropped and shrank (lib/account/avatar.ts
 * PHOTO_UPLOAD). Checked here for what it is (never the sender's word),
 * the camera's details taken out, then judged; only a photo the check
 * passes is stored and shown.
 */
export async function postPhoto(req: Request, deps: PhotoDeps): Promise<NextResponse> {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  // A little over the limit: a file the browser made too big says so, rather than "bad".
  const cap = PHOTO_UPLOAD.maxBytes + 64 * 1024;
  if (Number(req.headers.get("content-length")) > cap) return accountReply({ problem: "too_big" }, "bad");
  let raw: Uint8Array;
  try {
    raw = new Uint8Array(await req.arrayBuffer());
  } catch {
    return accountError("bad");
  }
  if (raw.length > cap) return accountReply({ problem: "too_big" }, "bad");
  const info = imageInfo(raw);
  const bytes = info ? stripPhotoDetails(raw) : null;
  const problem = uploadProblem(bytes ? info : null, bytes?.length ?? raw.length);
  if (problem || !info || !bytes) return accountReply({ problem: problem ?? "not_photo" }, "bad");
  if (!deps.judgeReady()) return accountError("unchecked");

  const acc = await account(who.id);
  if ("reply" in acc) return acc.reply;
  const userId = acc.me.id;
  const media = info.type === "webp" ? "image/webp" : "image/jpeg";
  const ticket = await photoStart(userId, info.type === "webp" ? "webp" : "jpg", bytes.length);
  if ("unavailable" in ticket) return accountError("unavailable");
  if ("r" in ticket) return accountError(ticket.r === "paused" ? "unchecked" : ticket.r);
  const { id, path } = ticket.ok;

  const verdict = await deps.judge(bytes, media);
  if ("down" in verdict) {
    await photoDrop(userId, id, "unchecked");
    return accountError("unchecked");
  }
  if ("unreadable" in verdict) {
    await photoDrop(userId, id, "refused", { unreadable: true });
    return accountReply({ problem: "not_photo" }, "bad");
  }
  if (!verdict.ok) {
    await photoDrop(userId, id, "refused", verdict.verdict);
    return accountReply({ problem: verdict.problem }, "refused");
  }
  if (!(await deps.upload(path, bytes, media))) {
    await photoDrop(userId, id, "expired");
    return accountError("unavailable");
  }
  const done = await photoFinish(userId, id, verdict.verdict);
  // Uploaded but not put up: the ticket ends now, so its file is removed with the others.
  if ("unavailable" in done || ("r" in done && done.r === "missing")) await photoDrop(userId, id, "expired");
  return changed(deps, userId, "r" in done && done.r !== "bad" ? { unavailable: true } : done);
}

/** PATCH { preset } (an avatar) or { google: true } (this Google sign-in's own photo). */
export async function patchPhoto(req: Request, deps: PhotoDeps): Promise<NextResponse> {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req);
  if (!body) return accountError("bad");
  const preset = body.preset;
  const google = body.google;
  if ((preset === undefined) === (google === undefined)) return accountError("bad");
  if (preset !== undefined && !isPresetId(preset)) return accountError("bad");
  if (google !== undefined && google !== true) return accountError("bad");
  // Google's own photo of the verified sign-in, never an address the browser sent.
  const googleUrl = google === true && who.id.kind === "google" ? googlePhotoToKeep(who.id.avatar) : null;
  if (google === true && !googleUrl) return accountError("not_allowed");

  const acc = await account(who.id);
  if ("reply" in acc) return acc.reply;
  const r = googleUrl ? await photoSet(acc.me.id, "google", googleUrl) : await photoSet(acc.me.id, "preset", preset as string);
  return changed(deps, acc.me.id, r);
}

/** DELETE: no picture (initials again). An uploaded photo's file is removed. */
export async function deletePhoto(req: Request, deps: PhotoDeps): Promise<NextResponse> {
  const who = await caller(req, allowWrite);
  if ("reply" in who) return who.reply;
  const acc = await account(who.id);
  if ("reply" in acc) return acc.reply;
  return changed(deps, acc.me.id, await photoSet(acc.me.id, "none", null));
}

export type SweepResult = { ok: true; listed: number; removed: number } | { ok: false; error: "unavailable" };

/**
 * The quarter-hour job's work (/api/account/photo/sweep): the files a
 * change listed but couldn't remove (storage slow or down at the time)
 * and those of tickets never finished, removed and marked gone, as after
 * a change. Nothing to do before the migration.
 */
export async function sweepPhotoFiles(deps: Pick<PhotoDeps, "remove">): Promise<SweepResult> {
  const list = await photoSweepList();
  if ("unavailable" in list) return { ok: false, error: "unavailable" };
  if ("missing" in list || list.ok.length === 0) return { ok: true, listed: 0, removed: 0 };
  const removed = new Set(await deps.remove(list.ok.map((f) => f.path)));
  const gone = new Map<string, string[]>();
  for (const f of list.ok) if (removed.has(f.path)) gone.set(f.userId, [...(gone.get(f.userId) ?? []), f.id]);
  for (const [userId, ids] of gone) await photoFilesGone(userId, ids);
  return { ok: true, listed: list.ok.length, removed: removed.size };
}
