import { cleanText } from "./screen";
import type { Aspects } from "./types";

/**
 * Owners asking TapTurf to take a player's report off ("review of reviews",
 * supabase/migrations/20261101_reviews_policy.sql): the reasons an owner
 * picks from, what myTapturf and /admin read back, and the words for each
 * state. The report stays live while a request waits, and its author is
 * never told. Pure.
 */

export type RemovalReason = "not_played" | "abusive" | "personal" | "wrong_turf" | "other";
export type RemovalStatus = "open" | "removed" | "kept";

/** The list owners pick from, the same as the database's check (the order shown). */
export const REMOVAL_REASONS: { id: RemovalReason; label: string }[] = [
  { id: "not_played", label: "They never played here" },
  { id: "abusive", label: "Abusive or hateful" },
  { id: "personal", label: "Shares personal details" },
  { id: "wrong_turf", label: "About a different turf" },
  { id: "other", label: "Something else" },
];

export const REMOVAL_DETAIL_MAX = 300;

const REASON_IDS = new Set<string>(REMOVAL_REASONS.map((r) => r.id));
const STATUSES = new Set<string>(["open", "removed", "kept"]);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const str = (x: unknown) => (typeof x === "string" && x ? x : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const reasonLabel = (r: string) => REMOVAL_REASONS.find((x) => x.id === r)?.label ?? "Something else";

/** What owner_review_removal_ask takes: a reason off the list, and the line cleaned (null when empty); else bad. */
export function parseRemovalAsk(reason: unknown, detail: unknown): { ok: { reason: RemovalReason; detail: string | null } } | { bad: string } {
  if (typeof reason !== "string" || !REASON_IDS.has(reason)) return { bad: "reason" };
  if (detail != null && typeof detail !== "string") return { bad: "detail" };
  const d = cleanText(detail as string | null);
  if (d && d.length > REMOVAL_DETAIL_MAX) return { bad: "detail" };
  return { ok: { reason: reason as RemovalReason, detail: d } };
}

export type OwnerRemoval = { status: RemovalStatus; reason: RemovalReason; at: string };

/**
 * owner_review_removals: review id to this owner's latest request on it. null when the
 * answer isn't one (forbidden, or a database from before requests): the action stays hidden.
 */
export function toOwnerRemovals(x: unknown): Map<string, OwnerRemoval> | null {
  if (!isObj(x) || !Array.isArray(x.requests)) return null;
  const out = new Map<string, OwnerRemoval>();
  for (const r of x.requests) {
    if (!isObj(r) || typeof r.review_id !== "string" || !STATUSES.has(String(r.status))) continue;
    if (out.has(r.review_id)) continue;
    out.set(r.review_id, {
      status: r.status as RemovalStatus,
      reason: REASON_IDS.has(String(r.reason)) ? (r.reason as RemovalReason) : "other",
      at: str(r.decided_at) ?? str(r.created_at) ?? "",
    });
  }
  return out;
}

/** The owner's line under a report they asked about. */
export function ownerRemovalLine(s: RemovalStatus): string {
  if (s === "open") return "You asked TapTurf to remove this. It stays up while we look.";
  if (s === "removed") return "TapTurf removed this report.";
  return "TapTurf looked and kept this report up.";
}

/** What an owner sees when asking didn't go through (owner_review_removal_ask's error). */
export function askErrorText(error: string | null | undefined): string {
  switch (error) {
    case "limit":
      return "That's a lot of requests for one day. Try again tomorrow.";
    case "gone":
      return "This report is already off the page.";
    case "forbidden":
      return "Only an approved owner of this turf can ask.";
    case "bad":
      return "Pick a reason, and keep the note under 300 characters.";
    default:
      return "Couldn't send that just now. Try again.";
  }
}

export type AdminRemoval = {
  id: string;
  status: RemovalStatus;
  reason: RemovalReason;
  detail: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Who asked: their account's name (else the name on their claim), and the account for the people list. */
  askedBy: { name: string | null; account: string | null; kind: "phone" | "email" | null };
  /** Other owners' open requests on the same report. */
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
  } | null;
};

/** admin_review_removals: { open, requests } with every row checked; null when it isn't that shape. */
export function toAdminRemovals(x: unknown): { open: number; requests: AdminRemoval[] } | null {
  if (!isObj(x) || !Array.isArray(x.requests)) return null;
  const requests: AdminRemoval[] = [];
  for (const r of x.requests) {
    if (!isObj(r) || typeof r.id !== "string" || !UUID.test(r.id) || !STATUSES.has(String(r.status))) continue;
    const by = isObj(r.asked_by) ? r.asked_by : {};
    const t = isObj(r.turf) ? r.turf : {};
    const v = isObj(r.review) && typeof r.review.id === "string" ? r.review : null;
    requests.push({
      id: r.id,
      status: r.status as RemovalStatus,
      reason: REASON_IDS.has(String(r.reason)) ? (r.reason as RemovalReason) : "other",
      detail: str(r.detail),
      createdAt: str(r.created_at) ?? "",
      decidedAt: str(r.decided_at),
      askedBy: { name: str(by.name), account: str(by.account), kind: by.kind === "phone" || by.kind === "email" ? by.kind : null },
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
      },
    });
  }
  const open = typeof x.open === "number" && x.open >= 0 ? x.open : requests.filter((r) => r.status === "open").length;
  return { open, requests };
}
