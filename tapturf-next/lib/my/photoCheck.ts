/**
 * The check of owner photos, the pure part: what owner_photos_to_check
 * hands out, and the judge's answer turned into the verdicts
 * owner_photo_verdicts takes. Relative imports only (npm run test:photos).
 *
 * Each photo goes to the judge twice, the full file and its card, since
 * the owner's browser made both: a harmless card can't carry a different
 * photo. A photo is held when the judge says it isn't the venue, when the
 * two copies differ, when the judge won't look at it, or when it can't
 * read the file. A photo we couldn't fetch, or the judge answered about
 * nothing, is tried again (held at the third try, in the database). Only
 * when the judge is down is nothing sent: the photo waits, and after 10
 * minutes goes up unchecked.
 */

export type CheckItem = { id: string; url: string; cardUrl: string };
export type Outcome = "judged" | "refused" | "unreadable" | "unloadable" | "unanswered";
export type Verdict = { id: string; outcome: Outcome; usable?: boolean; quality?: number; shows?: string; note?: string };
/** The judge's answer for one photo; index is its place in the call. */
export type PhotoReview = { index: number; usable: boolean; same: boolean; quality: number; shows: string; note: string };

/** Photos per judge call: two images each, six at most (as the cover pass sends). */
export const CHECK_CHUNK = 3;
export const NOT_SAME = "The small copy doesn't match the photo";

export function chunks<T>(xs: T[], n = CHECK_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** owner_photos_to_check's items; anything malformed is left out. */
export function toCheckItems(data: unknown): CheckItem[] {
  const items = data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : [];
  const out: CheckItem[] = [];
  for (const x of items) {
    const r = (x ?? {}) as Record<string, unknown>;
    if (typeof r.id === "string" && typeof r.url === "string" && r.url && typeof r.card_url === "string" && r.card_url)
      out.push({ id: r.id, url: r.url, cardUrl: r.card_url });
  }
  return out;
}

/**
 * Verdicts for the photos one judge call was sent, in order. refused: the
 * judge wouldn't look (judge one photo a call first, so only that one is
 * held). A photo the call answered nothing usable about is unanswered:
 * tried again, then held, so it can't go up unchecked for good.
 */
export function verdictsFor(sent: CheckItem[], reviews: PhotoReview[] | null, refused = false): Verdict[] {
  if (refused) return sent.map((it) => ({ id: it.id, outcome: "refused" }));
  const out: Verdict[] = [];
  sent.forEach((it, i) => {
    const r = reviews?.find((x) => x.index === i);
    if (!r || typeof r.usable !== "boolean" || typeof r.same !== "boolean") {
      out.push({ id: it.id, outcome: "unanswered" });
      return;
    }
    const quality = Math.max(1, Math.min(5, Math.round(Number.isFinite(r.quality) ? r.quality : 1)));
    out.push({
      id: it.id,
      outcome: "judged",
      usable: r.usable && r.same,
      quality,
      shows: r.shows,
      note: r.same ? String(r.note ?? "").slice(0, 200) : NOT_SAME,
    });
  });
  return out;
}

/**
 * What a failed judge call means. A request the API turned down over an
 * image (a file it can't decode) is that photo's problem; anything else
 * (a timeout, an outage, a rate limit, a mistake in our request) means
 * the judge is down and no photo is blamed.
 */
export function judgeFailure(e: unknown): "bad_image" | "down" {
  const err = (e ?? {}) as { status?: unknown; message?: unknown };
  return err.status === 400 && /image/i.test(String(err.message ?? "")) ? "bad_image" : "down";
}
