import { createClient } from "@/lib/supabase/client";
import { ownerRpc, ownerToken, refreshTurfPage } from "./client";
import { PHOTO, checkFile, fitWithin, type FileProblem } from "./photoMath";
import {
  toPhotoList,
  type AddResult,
  type CheckAnswer,
  type CoverResult,
  type FinishResult,
  type OwnerPhotoList,
  type PhotoExt,
  type RemoveResult,
  type StartResult,
} from "./photoTypes";

/**
 * Browser side of owner photos (20261025_owner_photos.sql). Each photo is
 * shrunk here (1600 long side plus a 640 card, which also leaves the
 * location details behind), uploaded straight to the public turf-photos
 * bucket under a path the database issued for this sign-in, then checked
 * (owner_photo_finish, /api/my/photos/check) before it goes on the page.
 */

const BUCKET = "turf-photos";

export class PhotoError extends Error {
  constructor(readonly reason: FileProblem) {
    super(reason);
  }
}

let webp: Promise<boolean> | null = null;
/** Older Safari hands back a PNG when asked for WebP; then we send JPEG. */
export function canEncodeWebp(): Promise<boolean> {
  webp ??= new Promise<boolean>((resolve) => {
    try {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      c.toBlob((b) => resolve(!!b && b.type === "image/webp"), "image/webp", 0.8);
    } catch {
      resolve(false);
    }
  });
  return webp;
}

/** The decoded photo (maybe already shrunk), and its size as taken. */
export type Decoded = { src: CanvasImageSource; w: number; h: number; origW: number; origH: number; done: () => void };

/** Safari and every iOS browser (all WebKit): createImageBitmap may ignore the camera's rotation there, an <img> never does. */
function webkitOnly(): boolean {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/(Chrome|Chromium|Edg|OPR|Android)\//.test(ua);
}

/** The photo's size, upright, from its header: an <img> that is never drawn isn't decoded. */
function measure(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** The photo upright, 1600 px on its long side at most; call done() after. The profile photo crop uses it too (lib/account/photoCrop.ts). */
export async function decode(file: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  let urlInUse = false;
  try {
    // Never the full size where we can help it: a 50 MP photo is 200 MB of
    // pixels, enough to crash a low-end phone. Chrome and Firefox decode
    // straight to the size we need, turned upright.
    if (typeof createImageBitmap === "function" && !webkitOnly()) {
      const size = await measure(url);
      try {
        const fit = size ? fitWithin(size.w, size.h, PHOTO.full) : null;
        // Only the width: the height follows the photo's own shape, whichever way the browser applies the rotation.
        const b = await createImageBitmap(file, fit ? { imageOrientation: "from-image", resizeWidth: fit.w, resizeQuality: "high" } : { imageOrientation: "from-image" });
        let closed = false;
        const done = () => {
          if (closed) return;
          closed = true;
          b.close();
        };
        return { src: b, w: b.width, h: b.height, origW: size?.w ?? b.width, origH: size?.h ?? b.height, done };
      } catch {
        /* the options or the format: try an <img> */
      }
    }
    const img = new Image();
    img.src = url;
    await img.decode();
    urlInUse = true;
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, origW: img.naturalWidth, origH: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    throw new PhotoError("unreadable");
  } finally {
    if (!urlInUse) URL.revokeObjectURL(url);
  }
}

function draw(src: CanvasImageSource, w: number, h: number, ext: PhotoExt): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new PhotoError("unreadable");
  if (ext === "jpg") {
    // JPEG has no transparency: a see-through PNG would turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

function encode(c: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b && b.type === type ? resolve(b) : reject(new PhotoError("unreadable"))), type, quality),
  );
}

// iOS keeps canvas memory until the size is zero.
function release(c: HTMLCanvasElement | null) {
  if (!c) return;
  c.width = 0;
  c.height = 0;
}

export type Compressed = { full: Blob; card: Blob; type: "image/webp" | "image/jpeg"; width: number; height: number };

/** The full photo and its card, re-encoded (no EXIF, so no location). */
export async function compressPhoto(file: Blob, ext: PhotoExt): Promise<Compressed> {
  const type = ext === "webp" ? "image/webp" : "image/jpeg";
  const d = await decode(file);
  let big: HTMLCanvasElement | null = null;
  let small: HTMLCanvasElement | null = null;
  try {
    if (!d.w || !d.h) throw new PhotoError("unreadable");
    if (Math.min(d.origW, d.origH) < PHOTO.minSide) throw new PhotoError("too_small");
    const f = fitWithin(d.w, d.h, PHOTO.full);
    big = draw(d.src, f.w, f.h, ext);
    d.done();
    // The card from the 1600 copy, not the original: far less to scale.
    const c = fitWithin(f.w, f.h, PHOTO.card);
    small = draw(big, c.w, c.h, ext);
    const full = await encode(big, type, ext === "webp" ? PHOTO.qFull : PHOTO.qJpg);
    let card = await encode(small, type, ext === "webp" ? PHOTO.qCard : PHOTO.qJpgCard);
    // The database wants the card smaller than the photo; a photo already card-sized can tie.
    if (card.size >= full.size) card = await encode(small, type, PHOTO.qRetryCard);
    if (card.size >= full.size) throw new PhotoError("unreadable");
    return { full, card, type, width: f.w, height: f.h };
  } finally {
    d.done();
    release(big);
    release(small);
  }
}

/** The start of a SHA-256 of the original file (the same photo twice), or null. */
export async function hashFile(file: Blob): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return null;
    const d = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(d).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

type Put = "ok" | "expired" | "failed";

async function put(path: string, body: Blob, contentType: string): Promise<Put> {
  try {
    const { error } = await createClient().storage.from(BUCKET).upload(path, body, { contentType, cacheControl: "31536000", upsert: false });
    if (!error) return "ok";
    const e = error as { status?: number; statusCode?: string; message?: string };
    const code = String(e.statusCode ?? e.status ?? "");
    const msg = e.message ?? "";
    // Already there: not ours (we upload each path once), so this photo is dropped.
    if (code === "409" || /already exists|duplicate/i.test(msg)) return "failed";
    // The ticket ran out (30 minutes on a slow line): the gate says no.
    if (code === "403" || code === "401" || /row-level security|unauthori[sz]ed/i.test(msg)) return "expired";
    return "failed";
  } catch {
    return "failed";
  }
}

export type FileState = "preparing" | "ready" | "uploading" | "uploaded" | "checking" | "done" | "duplicate" | "failed";
export type AddPhase = "preparing" | "uploading" | "checking";
export type AddStep =
  | { kind: "file"; index: number; state: FileState; preview?: string; reason?: string }
  | { kind: "phase"; phase: AddPhase; done: number; total: number };

type Prepared = { index: number; name: string; full: Blob; card: Blob; type: string; hash: string | null };
type Uploaded = { id: string; index: number; sizes: [number, number] };

/** owner_photo_finish for one uploaded photo: the database checks its files are these, and it waits for the check. */
async function finishOne(turfId: string, u: Uploaded): Promise<"ok" | string> {
  try {
    const f = await ownerRpc<FinishResult>("owner_photo_finish", { p_turf_id: turfId, p_ids: [u.id], p_sizes: u.sizes });
    if (!f || "error" in f) return f?.error ?? "network";
    return Array.isArray(f.checking) && f.checking.includes(u.id) ? "ok" : "network";
  } catch {
    return "network";
  }
}

/**
 * Add photos to a turf: shrink each (one at a time: phones run out of
 * memory on several big photos at once), ask for tickets, upload the full
 * photo and its card side by side, hand them to the check, and rebuild
 * the turf page when some went up. onStep reports progress per file (index
 * into files) and per phase. A preview it hands over is an object URL
 * the caller revokes.
 */
export async function addOwnerPhotos(turfId: string, files: File[], onStep: (s: AddStep) => void = () => {}): Promise<AddResult> {
  const out: AddResult = { added: 0, live: 0, held: 0, waiting: 0, duplicates: 0, failed: [] };
  if (files.length === 0) return out;
  if (files.length > PHOTO.maxBatch) return { ...out, error: "batch" };
  const fail = (index: number, reason: string) => {
    out.failed.push({ name: files[index]?.name ?? "", reason });
    onStep({ kind: "file", index, state: "failed", reason });
  };

  // 1. Shrink and fingerprint.
  const ext: PhotoExt = (await canEncodeWebp()) ? "webp" : "jpg";
  const ready: Prepared[] = [];
  for (let i = 0; i < files.length; i++) {
    onStep({ kind: "phase", phase: "preparing", done: i, total: files.length });
    const f = files[i];
    const problem = checkFile(f);
    if (problem) {
      fail(i, problem);
      continue;
    }
    onStep({ kind: "file", index: i, state: "preparing" });
    try {
      const c = await compressPhoto(f, ext);
      const hash = await hashFile(f);
      ready.push({ index: i, name: f.name, full: c.full, card: c.card, type: c.type, hash });
      onStep({ kind: "file", index: i, state: "ready", preview: URL.createObjectURL(c.card) });
    } catch (e) {
      fail(i, e instanceof PhotoError ? e.reason : "unreadable");
    }
  }
  if (ready.length === 0) return out;

  // 2-4. Tickets, uploads, and each photo handed to the check as soon as both
  // its files are up (so a slow batch or a reload loses only what was still
  // uploading). A ticket that ran out is asked for again, once.
  const waiting: Uploaded[] = [];
  let todo = ready;
  let total = 0;
  for (let round = 0; round < 2 && todo.length > 0; round++) {
    let start: StartResult;
    try {
      start = await ownerRpc<StartResult>("owner_photo_start", {
        p_turf_id: turfId,
        p_count: todo.length,
        p_ext: ext,
        p_hashes: todo.map((p) => p.hash ?? ""),
      });
    } catch {
      start = { error: "network" };
    }
    if (!start || "error" in start) {
      const error = start?.error ?? "network";
      for (const p of todo) fail(p.index, error);
      if (waiting.length === 0) {
        out.error = error;
        const left = start && "left" in start ? start.left : undefined;
        if (typeof left === "number") out.left = left;
      }
      break;
    }
    const items = Array.isArray(start.items) ? start.items : [];
    const retry: Prepared[] = [];
    const tickets = todo.map((p, i) => ({ p, item: items[i] }));
    if (round === 0) total = tickets.filter((t) => t.item && "id" in t.item).length;
    for (const { p, item } of tickets) {
      if (!item) {
        fail(p.index, "network");
        continue;
      }
      if ("duplicate" in item) {
        out.duplicates++;
        onStep({ kind: "file", index: p.index, state: "duplicate", reason: "duplicate" });
        continue;
      }
      onStep({ kind: "phase", phase: "uploading", done: waiting.length, total });
      onStep({ kind: "file", index: p.index, state: "uploading" });
      const [a, b] = await Promise.all([put(item.path, p.full, p.type), put(item.card_path, p.card, p.type)]);
      if (a === "ok" && b === "ok") {
        const u: Uploaded = { id: item.id, index: p.index, sizes: [p.full.size, p.card.size] };
        const f = await finishOne(turfId, u);
        if (f === "ok") {
          waiting.push(u);
          onStep({ kind: "file", index: p.index, state: "uploaded" });
        } else fail(p.index, f);
      } else if ((a === "expired" || b === "expired") && round === 0) {
        retry.push(p);
      } else {
        fail(p.index, "network");
      }
    }
    todo = retry;
  }
  out.added = waiting.length;

  // 5. The check: good photos go on the page, the rest are kept off it. What
  // it doesn't get to is checked within a few minutes by the minute job.
  if (waiting.length > 0) {
    onStep({ kind: "phase", phase: "checking", done: 0, total: waiting.length });
    for (const u of waiting) onStep({ kind: "file", index: u.index, state: "checking" });
    let live = new Set<string>();
    let held = new Set<string>();
    try {
      const r = await fetch("/api/my/photos/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turfId, token: await ownerToken() }),
      });
      const j = (await r.json().catch(() => ({}))) as Partial<CheckAnswer>;
      live = new Set(Array.isArray(j.live) ? j.live : []);
      held = new Set(Array.isArray(j.held) ? j.held : []);
    } catch {
      /* checked by the minute job */
    }
    // The minute job may have judged some while the rest were uploading: ask where each one is now.
    const now = await loadOwnerPhotos(turfId).catch(() => null);
    const status = new Map(now && !("error" in now) ? now.mine.map((m) => [m.id, m.status] as const) : []);
    for (const u of waiting) {
      const st = status.get(u.id);
      if (live.has(u.id) || st === "live") out.live++;
      else if (held.has(u.id) || st === "held") out.held++;
      else out.waiting++;
    }
    if (out.live > 0) await refreshTurfPage(turfId);
    for (const u of waiting) onStep({ kind: "file", index: u.index, state: "done" });
  }
  return out;
}

/** What the Photos section shows. */
export async function loadOwnerPhotos(turfId: string): Promise<OwnerPhotoList | { error: string }> {
  return toPhotoList(await ownerRpc<unknown>("owner_photos", { p_turf_id: turfId }));
}

/** Take a photo an owner added off the page, then remove its files (best effort). */
export async function removeOwnerPhoto(turfId: string, id: string): Promise<{ ok: true } | { error: string }> {
  let r: RemoveResult;
  try {
    r = await ownerRpc<RemoveResult>("owner_photo_remove", { p_turf_id: turfId, p_id: id });
  } catch {
    return { error: "network" };
  }
  if (!r || "error" in r) return { error: r?.error ?? "network" };
  try {
    // Off the page already; the minute job removes anything left behind.
    await createClient().storage.from(BUCKET).remove(r.paths);
  } catch {
    /* see above */
  }
  await refreshTurfPage(turfId);
  return { ok: true };
}

/** Make a photo the cover: first on cards and in the gallery. url as stored in turfs.images. */
export async function makeCover(turfId: string, url: string): Promise<CoverResult> {
  let r: CoverResult;
  try {
    r = await ownerRpc<CoverResult>("owner_photo_cover", { p_turf_id: turfId, p_url: url });
  } catch {
    return { error: "network" };
  }
  if (!r || "error" in r) return { error: r?.error ?? "network" };
  await refreshTurfPage(turfId);
  return { ok: true };
}
