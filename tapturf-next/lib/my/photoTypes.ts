/**
 * Owner photos on myTapturf: what the database functions in
 * supabase/migrations/20261025_owner_photos.sql answer, and readers that
 * keep only well-formed rows. Relative imports only (npm run test:photos).
 */

export type PhotoExt = "webp" | "jpg";
/** live: on the page; checking: uploaded, waiting for the check; held: kept off the page. */
export type OwnerPhotoStatus = "live" | "checking" | "held";

/** A photo an owner added (owner_photos.mine). */
export type OwnerPhoto = { id: string; url: string; status: OwnerPhotoStatus; at: string | null; checked: boolean; note: string | null };
/** A photo the cover pass hides on the public page (image_review usable=false). */
export type FlaggedPhoto = { url: string; note: string | null };
export type OwnerPhotoList = {
  /** turfs.images as stored. */
  images: string[];
  cover: string | null;
  flagged: FlaggedPhoto[];
  mine: OwnerPhoto[];
  maxMine: number;
  maxBatch: number;
};

export type StartItem = { id: string; path: string; card_path: string } | { duplicate: true };
export type StartResult = { ok: true; bucket: string; items: StartItem[] } | { error: string; left?: number };
/** checking: the ids now waiting for the check; missing: the rest (files not there, or not this photo). */
export type FinishResult = { ok: true; checking: string[]; missing: string[] } | { error: string };
export type RemoveResult = { ok: true; paths: string[] } | { error: string };
export type CoverResult = { ok: true } | { error: string };
/** POST /api/my/photos/check */
export type CheckAnswer = { ok: boolean; checked: number; live: string[]; held: string[]; skipped?: string; error?: string };

export type AddFailure = { name: string; reason: string };
export type AddResult = {
  /** Uploaded and accepted by finish. */
  added: number;
  /** Of those, on the page after the check. */
  live: number;
  /** Of those, kept off the page by the check. */
  held: number;
  /** Of those, still being checked (they show within a few minutes, or are kept off). */
  waiting: number;
  duplicates: number;
  failed: AddFailure[];
  /** A reason the whole batch stopped (start refused it). */
  error?: string;
  /** With too_many and daily_limit: how many more would fit. */
  left?: number;
};

/** admin_owner_photos */
export type AdminPhotoStatus = "checking" | "live" | "held" | "removed";
export type AdminOwnerPhoto = {
  id: string;
  turfId: string;
  turfName: string;
  slug: string | null;
  city: string | null;
  area: string | null;
  userKey: string;
  status: AdminPhotoStatus;
  url: string | null;
  bytes: number | null;
  createdAt: number | null;
  checkedAt: number | null;
  /** Times the check couldn't load it. */
  checkTries: number;
  removedAt: number | null;
  removedBy: string | null;
  note: string | null;
  /** The check's call: false kept it off; null when not judged. */
  usable: boolean | null;
  /** Put back by the admin after the check held it. */
  override: boolean;
  /** Held because the owner's claim was taken away. */
  unclaimed: boolean;
};

const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const time = (x: unknown): number | null => {
  const t = typeof x === "string" ? Date.parse(x) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** owner_photos, or its error. */
export function toPhotoList(data: unknown): OwnerPhotoList | { error: string } {
  const d = obj(data);
  if (!d) return { error: "bad_answer" };
  if (typeof d.error === "string") return { error: d.error };
  const images = Array.isArray(d.images) ? d.images.filter((u): u is string => typeof u === "string" && u.trim() !== "") : [];
  const flagged: FlaggedPhoto[] = [];
  for (const x of Array.isArray(d.flagged) ? d.flagged : []) {
    const f = obj(x);
    const url = f && str(f.url);
    if (url) flagged.push({ url, note: str(f.note) });
  }
  const mine: OwnerPhoto[] = [];
  for (const x of Array.isArray(d.mine) ? d.mine : []) {
    const m = obj(x);
    const id = m && str(m.id);
    const url = m && str(m.url);
    if (!m || !id || !url || (m.status !== "live" && m.status !== "checking" && m.status !== "held")) continue;
    mine.push({ id, url, status: m.status, at: str(m.at), checked: m.checked === true, note: str(m.note) });
  }
  return { images, cover: str(d.cover), flagged, mine, maxMine: num(d.max_mine) ?? 20, maxBatch: num(d.max_batch) ?? 10 };
}

const ADMIN_STATUSES: readonly string[] = ["checking", "live", "held", "removed"];

/** Rows from admin_owner_photos; anything malformed is left out. */
export function toAdminPhotos(data: unknown): AdminOwnerPhoto[] {
  if (!Array.isArray(data)) return [];
  const out: AdminOwnerPhoto[] = [];
  for (const x of data) {
    const r = obj(x);
    const id = r && str(r.id);
    const turfId = r && str(r.turf_id);
    const userKey = r && str(r.user_key);
    if (!r || !id || !turfId || !userKey || typeof r.status !== "string" || !ADMIN_STATUSES.includes(r.status)) continue;
    const v = obj(r.verdict);
    out.push({
      id,
      turfId,
      turfName: str(r.turf_name) ?? "A turf no longer listed",
      slug: str(r.slug),
      city: str(r.city),
      area: str(r.area),
      userKey,
      status: r.status as AdminPhotoStatus,
      url: str(r.url),
      bytes: num(r.bytes),
      createdAt: time(r.created_at),
      checkedAt: time(r.checked_at),
      checkTries: num(r.check_tries) ?? 0,
      removedAt: time(r.removed_at),
      removedBy: str(r.removed_by),
      note: v ? str(v.note) : null,
      usable: v && typeof v.usable === "boolean" ? v.usable : null,
      override: v?.override === true,
      unclaimed: v?.unclaimed === true,
    });
  }
  return out;
}
