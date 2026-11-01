import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { accountRpc, accountRpcIfThere } from "../account/server";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { REVIEW_PHOTO_BUCKET, shapeReviewPhoto } from "./photos";
import type { ReviewPhoto } from "./types";

/**
 * Server side of review photos (20261102_reviews_trust.sql): the server-key
 * functions and the review-photos bucket. Server only. The browser never
 * writes to the bucket; only the photo route does, with the public key, at
 * the paths the database issued, after the check. As profile photos do
 * (lib/account/photoServer.ts). Relative imports only (npm run test:reviews).
 */

type Unavailable = { unavailable: true };
/** A photo whose files nothing shows any more: both paths, its photo and thumbnail. */
export type PhotoFiles = { id: string; paths: string[] };

const NAME = /^[0-9a-f]{24}(_t)?\.(webp|jpg)$/;

function toFiles(x: unknown): PhotoFiles[] {
  return (Array.isArray(x) ? x : [])
    .map((f) => (f ?? {}) as Record<string, unknown>)
    .filter((f) => typeof f.id === "string" && Array.isArray(f.paths) && f.paths.length === 2 && f.paths.every((p) => typeof p === "string" && NAME.test(p)))
    .map((f) => ({ id: f.id as string, paths: f.paths as string[] }));
}

/** Whether this database has review photos ({ missing } before the migration), whether uploads are paused, and how many this account has left today. */
export async function photoReady(userId: string): Promise<{ ok: { paused: boolean; left: number } } | { missing: true } | Unavailable> {
  const res = await accountRpcIfThere("review_photo_ready", { p_user_id: userId });
  if ("missing" in res || "unavailable" in res) return res;
  const d = res.data;
  return d.r === "ok" ? { ok: { paused: d.paused === true, left: typeof d.left === "number" && d.left >= 0 ? d.left : 0 } } : { unavailable: true };
}

export type PhotoStartResult =
  | { ok: { id: string; path: string; thumb: string; left: number } }
  | { r: "bad" | "limit" | "paused" | "gone" | "own_turf" }
  | { missing: true }
  | Unavailable;

/** A ticket for one photo: random paths in the bucket for it and its thumbnail, open for 10 minutes. */
export async function photoStart(
  userId: string,
  turfId: string,
  f: { ext: "webp" | "jpg"; bytes: number; thumbBytes: number; w: number; h: number },
): Promise<PhotoStartResult> {
  const res = await accountRpcIfThere("review_photo_start", {
    p_user_id: userId,
    p_turf_id: turfId,
    p_ext: f.ext,
    p_bytes: f.bytes,
    p_thumb_bytes: f.thumbBytes,
    p_w: f.w,
    p_h: f.h,
  });
  if ("missing" in res || "unavailable" in res) return res;
  const d = res.data;
  if (d.r === "ok" && typeof d.id === "string" && typeof d.path === "string" && typeof d.thumb === "string" && NAME.test(d.path) && NAME.test(d.thumb)) {
    return { ok: { id: d.id, path: d.path, thumb: d.thumb, left: typeof d.left === "number" ? d.left : 0 } };
  }
  if (d.r === "bad" || d.r === "limit" || d.r === "paused" || d.r === "gone" || d.r === "own_turf") return { r: d.r };
  return { unavailable: true };
}

/** A ticket that won't be finished: refused or unchecked (never uploaded), expired (an upload failed). Never throws. */
export async function photoEnd(userId: string, id: string, outcome: "refused" | "unchecked" | "expired", verdict: object | null = null): Promise<void> {
  const res = await accountRpc("review_photo_end", { p_user_id: userId, p_id: id, p_outcome: outcome, p_verdict: verdict });
  if ("data" in res && res.data.r !== "ok") console.warn("reviews: review_photo_end answered", res.data.r);
}

/** Uploaded: the photo is ready to go on a report (both files must be there at the sizes checked). */
export async function photoFinish(userId: string, id: string, verdict: object | null): Promise<{ ok: ReviewPhoto } | { r: "bad" | "expired" | "missing" } | Unavailable> {
  const res = await accountRpc("review_photo_finish", { p_user_id: userId, p_id: id, p_verdict: verdict });
  if ("unavailable" in res) return res;
  const d = res.data;
  if (d.r === "ok") {
    const p = shapeReviewPhoto(d.photo);
    return p ? { ok: p } : { unavailable: true };
  }
  if (d.r === "bad" || d.r === "expired" || d.r === "missing") return { r: d.r };
  return { unavailable: true };
}

/** A photo taken out of the sheet before it was posted: its files to take away, or bad (not one of theirs that is ready). */
export async function photoDiscard(userId: string, id: string): Promise<{ ok: PhotoFiles[] } | { r: "bad" } | { missing: true } | Unavailable> {
  const res = await accountRpcIfThere("review_photo_discard", { p_user_id: userId, p_id: id });
  if ("missing" in res || "unavailable" in res) return res;
  if (res.data.r === "ok") return { ok: toFiles(res.data.files) };
  return res.data.r === "bad" ? { r: "bad" } : { unavailable: true };
}

/** The files still to take away, anyone's, oldest first (50 photos at most); ends unused tickets and photos never posted first. { missing } before the migration. */
export async function photoSweepList(): Promise<{ ok: PhotoFiles[] } | { missing: true } | Unavailable> {
  const res = await accountRpcIfThere("review_photo_sweep_list", {});
  if ("missing" in res || "unavailable" in res) return res;
  return res.data.r === "ok" ? { ok: toFiles(res.data.files) } : { unavailable: true };
}

/** These photos' files were taken away. Never throws. */
export async function photoFilesGone(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await accountRpc("review_photo_files_gone", { p_ids: ids });
  if ("data" in res && res.data.r !== "ok") console.warn("reviews: review_photo_files_gone answered", res.data.r);
}

/* ------------------------------------------------------------------ */
/* The bucket                                                          */
/* ------------------------------------------------------------------ */

// Its own breaker: a slow bucket must not make account calls fail fast.
const storageFetch = createGuardedFetch(defaultGuardOptions());
let storage: SupabaseClient | null = null;

function bucket() {
  if (!storage) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) throw new Error("Missing Supabase environment variables");
    storage = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: storageFetch } });
  }
  return storage.storage.from(REVIEW_PHOTO_BUCKET);
}

/** Upload a checked file to its ticket's path (never over another file). False when it didn't go. */
export async function uploadReviewPhotoFile(path: string, bytes: Uint8Array, contentType: "image/webp" | "image/jpeg"): Promise<boolean> {
  try {
    // The name is random and never reused: a year in any cache is safe.
    const { error } = await bucket().upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) console.warn("reviews: photo upload failed", error.message);
    return !error;
  } catch (e) {
    console.warn("reviews: photo upload threw", e);
    return false;
  }
}

/** Take away files nothing shows any more (the policies allow only those). The paths taken away. */
export async function removeReviewPhotoFiles(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  try {
    const { error } = await bucket().remove(paths);
    if (error) {
      console.warn("reviews: taking photo files away failed", error.message);
      return [];
    }
    // A file that never got uploaded (an expired ticket) isn't there to take away: done too.
    return paths;
  } catch (e) {
    console.warn("reviews: taking photo files away threw", e);
    return [];
  }
}
