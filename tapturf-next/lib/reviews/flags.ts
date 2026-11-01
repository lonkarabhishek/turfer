import { shapeReviewPhotos } from "./photos";
import { cleanText } from "./screen";
import type { Aspects, ReviewPhoto } from "./types";

/**
 * "Report this review": a signed-in player tells TapTurf a review on a turf
 * page breaks the rules (20261102_reviews_trust.sql, private.review_flags;
 * "flag" in the code, since a "report" here is the review itself). The
 * reasons a player picks from, what the route takes, what /admin reads
 * back and the words for each answer. The review stays up until the site
 * owner decides; Hide takes it off the way a removal request does. A
 * turf's owner keeps their own removal requests (removal.ts). Pure.
 */

export type FlagReason = "not_played" | "abusive" | "spam" | "personal" | "other";
export type FlagStatus = "open" | "hidden" | "kept";

/** The list players pick from, the same as the database's check (the order shown). */
export const FLAG_REASONS: { id: FlagReason; label: string }[] = [
  { id: "not_played", label: "Fake, or they didn't play here" },
  { id: "abusive", label: "Abusive or hateful" },
  { id: "spam", label: "Spam or ads" },
  { id: "personal", label: "Shares someone's personal details" },
  { id: "other", label: "Something else" },
];

export const FLAG_DETAIL_MAX = 300;
/** Reports a day per account (review_flag). */
export const FLAGS_PER_DAY = 10;

const REASON_IDS = new Set<string>(FLAG_REASONS.map((r) => r.id));
const STATUSES = new Set<string>(["open", "hidden", "kept"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown) => (typeof x === "string" && x ? x : null);

export const flagReasonLabel = (r: string) => FLAG_REASONS.find((x) => x.id === r)?.label ?? "Something else";

/** POST /api/reviews/flag's body: a review id, a reason off the list and the line cleaned (null when empty); else bad. */
export function parseFlag(body: Record<string, unknown> | null): { ok: { review_id: string; reason: FlagReason; detail: string | null } } | { bad: string } {
  if (!body) return { bad: "body" };
  if (typeof body.review_id !== "string" || !UUID.test(body.review_id)) return { bad: "review_id" };
  if (typeof body.reason !== "string" || !REASON_IDS.has(body.reason)) return { bad: "reason" };
  if (body.detail != null && typeof body.detail !== "string") return { bad: "detail" };
  const detail = cleanText(body.detail as string | null);
  if (detail && detail.length > FLAG_DETAIL_MAX) return { bad: "detail" };
  return { ok: { review_id: body.review_id.toLowerCase(), reason: body.reason as FlagReason, detail } };
}

/** What a player sees after sending (or trying to): the route's answer in words. */
export function flagAnswerText(a: { ok: true; already: boolean } | { ok: false; error: string | null; reason?: string | null }): string {
  if (a.ok) return a.already ? "You've already reported this review. TapTurf will look at it." : "Thanks. TapTurf will look at this review. It stays up while we do.";
  if (a.reason === "own") return "That's your own review. You can edit or remove it instead.";
  if (a.reason === "gone" || a.reason === "google") return "This review is no longer on the page.";
  if (a.reason === "not_ready") return "Reporting a review isn't open yet. Try again soon.";
  switch (a.error) {
    case "limit":
    case "slow":
      return `That's ${FLAGS_PER_DAY} reports today. Try again tomorrow.`;
    case "sign_in":
      return "Your login ended. Log in again to report this review.";
    case "new":
      return "Finish signing up to report a review.";
    case "bad":
      return "Pick a reason, and keep the note under 300 characters.";
    default:
      return "Couldn't send that just now. Try again.";
  }
}

export type AdminFlag = {
  id: string;
  status: FlagStatus;
  reason: FlagReason;
  detail: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Who reported: their account's public name, the account for the people list, and whether they manage this turf. */
  by: { name: string | null; account: string | null; manages: boolean };
  /** Other open reports of the same review. */
  others: number;
  turf: { id: string | null; name: string; slug: string | null; city: string | null };
  review: {
    id: string;
    rating: number;
    comment: string | null;
    sport: string | null;
    playedWhen: string | null;
    aspects: Aspects | null;
    createdAt: string | null;
    status: string;
    author: string | null;
    authorId: string | null;
    playedHere: boolean;
    photos: ReviewPhoto[];
  } | null;
};

/** admin_review_flags: { open, flags } with every row checked; null when it isn't that shape. */
export function toAdminFlags(x: unknown): { open: number; flags: AdminFlag[] } | null {
  if (!isObj(x) || !Array.isArray(x.flags)) return null;
  const flags: AdminFlag[] = [];
  for (const r of x.flags) {
    if (!isObj(r) || typeof r.id !== "string" || !UUID.test(r.id) || !STATUSES.has(String(r.status))) continue;
    const by = isObj(r.by) ? r.by : {};
    const t = isObj(r.turf) ? r.turf : {};
    const v = isObj(r.review) && typeof r.review.id === "string" ? r.review : null;
    flags.push({
      id: r.id,
      status: r.status as FlagStatus,
      reason: REASON_IDS.has(String(r.reason)) ? (r.reason as FlagReason) : "other",
      detail: str(r.detail),
      createdAt: str(r.created_at) ?? "",
      decidedAt: str(r.decided_at),
      by: { name: str(by.name), account: str(by.account), manages: by.manages === true },
      others: typeof r.others === "number" && r.others > 0 ? r.others : 0,
      turf: { id: str(t.id), name: str(t.name) ?? "A turf", slug: str(t.slug), city: str(t.city) },
      review: v && {
        id: v.id as string,
        rating: typeof v.rating === "number" ? Math.max(1, Math.min(5, Math.round(v.rating))) : 0,
        comment: str(v.comment),
        sport: str(v.sport),
        playedWhen: str(v.played_when),
        aspects: isObj(v.aspects) ? (v.aspects as Aspects) : null,
        createdAt: str(v.created_at),
        status: str(v.status) ?? "live",
        author: str(v.author),
        authorId: str(v.author_id),
        playedHere: v.played_here === true,
        photos: shapeReviewPhotos(v.photos),
      },
    });
  }
  const open = typeof x.open === "number" && x.open >= 0 ? x.open : flags.filter((f) => f.status === "open").length;
  return { open, flags };
}
