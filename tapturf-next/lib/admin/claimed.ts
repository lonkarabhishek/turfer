import { cityInfo } from "../city";
import { toClaims, type AdminClaim, type ClaimStatus } from "./claims";
import { istDateTime } from "./people";
import { ReadFailed } from "./section";

/**
 * The claimed turfs list (/admin/claimed), from admin_owner_claims (the
 * owner-claims panel's read): one entry a turf with the people its filter
 * shows, newest first, and the words each person's line says. Pure, so it
 * renders the same on the server and in a test. Relative imports only
 * (npm run test:trend).
 */

export const CLAIMED_FILTERS = {
  all: "Claimed now",
  waiting: "Waiting for approval",
  ended: "Revoked or rejected",
  every: "Every claim",
} as const;
export type ClaimedFilter = keyof typeof CLAIMED_FILTERS;

/** The claims each filter shows. */
const SHOWN: Record<ClaimedFilter, readonly ClaimStatus[]> = {
  all: ["active"],
  waiting: ["pending"],
  ended: ["revoked", "rejected"],
  every: ["active", "pending", "revoked", "rejected"],
};

/**
 * admin_owner_claims' answer: its claims, or a ReadFailed the page shows
 * with a retry. The owner check saying no comes back as {error: "forbidden"},
 * not as a database error, and must not read as "no claims".
 */
export function claimsAnswer(data: unknown): AdminClaim[] {
  if (Array.isArray(data)) return toClaims(data);
  const error = data && typeof data === "object" ? (data as { error?: unknown }).error : undefined;
  if (error === "forbidden") throw new ReadFailed("not_allowed", "admin_owner_claims: forbidden");
  throw new ReadFailed("error", `admin_owner_claims: ${typeof error === "string" ? error : "no list came back"}`);
}

export type ClaimedTurf = {
  turfId: string;
  name: string;
  slug: string | null;
  /** "Area, City", or null. */
  place: string | null;
  /** The claims the filter shows, newest first. */
  claims: AdminClaim[];
  /** People who manage it now: its active claims, one per account. */
  managing: number;
  /** Its claims waiting for approval. */
  waiting: number;
  /** The newest time among the shown claims, for the order. */
  latest: number | null;
};

/** When a claim last moved: decided (approved, revoked, rejected), else made. */
export const claimTime = (c: AdminClaim): number | null => c.decidedAt ?? c.createdAt;

/** One person, however many of their sign-ins claimed. */
const personOf = (c: AdminClaim) => c.account?.id ?? c.userId ?? c.userKey;

/** Newest first, times not recorded last. */
const byNewest = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : b - a);

export function placeOf(area: string | null, city: string | null): string | null {
  return [area, city ? cityInfo(city).label : null].filter(Boolean).join(", ") || null;
}

/** The turfs the filter shows, each with its shown claims; the turf whose claim moved last first. */
export function claimedTurfs(claims: readonly AdminClaim[], filter: ClaimedFilter): ClaimedTurf[] {
  const want = SHOWN[filter];
  const byTurf = new Map<string, AdminClaim[]>();
  for (const c of claims) byTurf.set(c.turfId, [...(byTurf.get(c.turfId) ?? []), c]);
  const out: ClaimedTurf[] = [];
  for (const [turfId, all] of byTurf) {
    const shown = all.filter((c) => want.includes(c.status)).sort((a, b) => byNewest(claimTime(a), claimTime(b)));
    if (shown.length === 0) continue;
    const t = all[0];
    out.push({
      turfId,
      name: t.turfName,
      slug: t.slug,
      place: placeOf(t.area, t.city),
      claims: shown,
      managing: new Set(all.filter((c) => c.status === "active").map(personOf)).size,
      waiting: all.filter((c) => c.status === "pending").length,
      latest: claimTime(shown[0]),
    });
  }
  return out.sort((a, b) => byNewest(a.latest, b.latest) || a.name.localeCompare(b.name));
}

/**
 * admin_owner_claims answers with 200 claims at most, waiting ones first and
 * then the newest; at that many, older claims may be left out (and the counts
 * over the list may be low), so the list says so.
 */
export const CLAIMS_CAP = 200;
export const claimsCut = (claims: readonly AdminClaim[]) => claims.length >= CLAIMS_CAP;

export type ClaimCounts = { turfs: number; people: number; waiting: number; ended: number };

/** The line over the list: turfs claimed now, the people managing them, claims waiting, claims revoked or turned down. */
export function claimCounts(claims: readonly AdminClaim[]): ClaimCounts {
  const active = claims.filter((c) => c.status === "active");
  return {
    turfs: new Set(active.map((c) => c.turfId)).size,
    people: new Set(active.map(personOf)).size,
    waiting: claims.filter((c) => c.status === "pending").length,
    ended: claims.filter((c) => c.status === "revoked" || c.status === "rejected").length,
  };
}

/**
 * How a claim got (or asks for) access, and the listed number it proved,
 * 10 digits: a code to a listed number (verified_phone), a phone sign-in
 * whose number is listed, or TapTurf's decision.
 */
export function howVerified(c: AdminClaim): { text: string; phone: string | null } {
  const keyPhone = c.userKey.startsWith("p:") ? c.userKey.slice(2) : null;
  if (c.verifiedPhone) return { text: keyPhone === c.verifiedPhone ? "Signed in with the listed number" : "Code to the listed number", phone: c.verifiedPhone };
  if (c.via === "phone_match") return { text: "Listed-number match", phone: keyPhone };
  if (c.status === "pending") return { text: "Waiting for TapTurf's approval", phone: null };
  if (c.status === "rejected") return { text: "Turned down by TapTurf", phone: null };
  return { text: "Approved by TapTurf", phone: null };
}

/** A 10-digit number as admin reads it: +91 98000 00001. */
export const phoneLabel = (p10: string) => `+91 ${p10.replace(/^(\d{5})(\d{5})$/, "$1 $2")}`;

/**
 * When a claim was made and what happened to it since, in India time:
 * "Claimed 24 Oct 2026, 11:26 · approved 24 Oct 2026, 12:03". A
 * listed-number match is decided as it is made ("in at once"). One that
 * went active later was either proved later (a code, a match) or revoked and
 * restored by TapTurf, which keeps its via; the row can't tell which.
 */
export function claimWhen(c: AdminClaim): string {
  const made = c.createdAt !== null ? `Claimed ${istDateTime(c.createdAt)}` : "Claimed (time not recorded)";
  if (c.status === "pending" || c.decidedAt === null) return made;
  if (c.status === "active" && c.via === "phone_match" && c.createdAt !== null && Math.abs(c.decidedAt - c.createdAt) < 60_000) return `${made}, in at once`;
  const verb = c.status === "active" ? (c.via === "phone_match" ? "verified or restored by TapTurf" : "approved") : c.status === "revoked" ? "revoked" : "turned down";
  return `${made} · ${verb} ${istDateTime(c.decidedAt)}`;
}
