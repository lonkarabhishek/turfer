import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createGuardedFetch, defaultGuardOptions } from "../supabase/guard";
import { accountRpc, accountRpcIfThere, toProfile } from "./server";
import type { AccountProfile } from "./types";

/**
 * Server side of profile photos (20261030_profile_photos.sql): the
 * server-key functions and the avatars bucket. Server only. The browser
 * never writes to the bucket; only the photo route does, with the public
 * key, at a path the database issued, after the check. Relative imports
 * only (npm run test:account).
 */

type Unavailable = { unavailable: true };
export type PhotoFile = { id: string; path: string };

/** Whether this database has photos ({ missing } before the migration) and whether uploads are paused. */
export async function photoReady(): Promise<{ ok: { paused: boolean } } | { missing: true } | Unavailable> {
  const res = await accountRpcIfThere("account_photo_ready", {});
  if ("missing" in res || "unavailable" in res) return res;
  return res.data.r === "ok" ? { ok: { paused: res.data.paused === true } } : { unavailable: true };
}

export type PhotoStartResult = { ok: { id: string; path: string } } | { r: "bad" | "limit" | "paused" } | Unavailable;

/** A ticket for one upload: a random path in the bucket, open for 10 minutes. */
export async function photoStart(userId: string, ext: "webp" | "jpg", bytes: number): Promise<PhotoStartResult> {
  const res = await accountRpc("account_photo_start", { p_user_id: userId, p_ext: ext, p_bytes: bytes });
  if ("unavailable" in res) return res;
  const d = res.data;
  if (d.r === "ok" && typeof d.id === "string" && typeof d.path === "string" && /^[0-9a-f]{24}\.(webp|jpg)$/.test(d.path)) {
    return { ok: { id: d.id, path: d.path } };
  }
  if (d.r === "bad" || d.r === "limit" || d.r === "paused") return { r: d.r };
  return { unavailable: true };
}

/** A ticket that won't be finished: refused or unchecked (never uploaded), expired (the upload failed). Never throws. */
export async function photoDrop(userId: string, id: string, outcome: "refused" | "unchecked" | "expired", verdict: object | null = null): Promise<void> {
  const res = await accountRpc("account_photo_drop", { p_user_id: userId, p_id: id, p_outcome: outcome, p_verdict: verdict });
  if ("data" in res && res.data.r !== "ok") console.warn("account: account_photo_drop answered", res.data.r);
}

export type PhotoChangeResult = { ok: AccountProfile; files: PhotoFile[] } | { r: "bad" | "expired" | "missing" } | Unavailable;

function changeResult(res: Awaited<ReturnType<typeof accountRpc>>): PhotoChangeResult {
  if ("unavailable" in res) return res;
  const d = res.data;
  if (d.r === "ok") {
    const p = toProfile(d);
    if (!p) return { unavailable: true };
    const files = (Array.isArray(d.files) ? d.files : [])
      .map((f) => (f ?? {}) as Record<string, unknown>)
      .filter((f): f is PhotoFile => typeof f.id === "string" && typeof f.path === "string" && /^[0-9a-f]{24}\.(webp|jpg)$/.test(f.path));
    return { ok: p, files };
  }
  if (d.r === "bad" || d.r === "expired" || d.r === "missing") return { r: d.r };
  return { unavailable: true };
}

/** Uploaded: the photo becomes the account's picture (the file must be there at the size checked). */
export async function photoFinish(userId: string, id: string, verdict: object | null): Promise<PhotoChangeResult> {
  return changeResult(await accountRpc("account_photo_finish", { p_user_id: userId, p_id: id, p_verdict: verdict }));
}

/** An avatar, the verified Google sign-in's photo, or none. */
export async function photoSet(userId: string, kind: "preset" | "google" | "none", value: string | null): Promise<PhotoChangeResult> {
  return changeResult(await accountRpc("account_photo_set", { p_user_id: userId, p_kind: kind, p_value: value }));
}

/** These files were removed from the bucket. Never throws. */
export async function photoFilesGone(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await accountRpc("account_photo_files_gone", { p_user_id: userId, p_ids: ids });
  if ("data" in res && res.data.r !== "ok") console.warn("account: account_photo_files_gone answered", res.data.r);
}

/* ------------------------------------------------------------------ */
/* The bucket                                                          */
/* ------------------------------------------------------------------ */

export const AVATAR_BUCKET = "avatars";

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
  return storage.storage.from(AVATAR_BUCKET);
}

/** Upload a checked photo to its ticket's path (never over another file). False when it didn't go. */
export async function uploadAvatarFile(path: string, bytes: Uint8Array, contentType: "image/webp" | "image/jpeg"): Promise<boolean> {
  try {
    // The name is random and never reused: a year in any cache is safe.
    const { error } = await bucket().upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
    if (error) console.warn("account: avatar upload failed", error.message);
    return !error;
  } catch (e) {
    console.warn("account: avatar upload threw", e);
    return false;
  }
}

/** Remove files nothing shows any more (the policies allow only those). The paths removed. */
export async function removeAvatarFiles(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  try {
    const { error } = await bucket().remove(paths);
    if (error) {
      console.warn("account: removing avatar files failed", error.message);
      return [];
    }
    // A file that never got uploaded (an expired ticket) isn't there to remove: done too.
    return paths;
  } catch (e) {
    console.warn("account: removing avatar files threw", e);
    return [];
  }
}
