import type { Method } from "./people";

/**
 * myTapturf claims for admin, from admin_owner_claims (20261025_claims_account.sql):
 * each claim with the TapTurf account it was made from. Relative imports
 * only (npm run test:trend).
 */

export type ClaimStatus = "active" | "pending" | "rejected" | "revoked";
export type ClaimAccount = {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  method: Method;
  signedUpAt: number | null;
  lastSeen: number | null;
  otherClaims: number;
  /** False for a Google account whose sign-in never came back to TapTurf. */
  signInFinished: boolean;
  /** Google checked this email; an old-app email was only typed. */
  emailChecked: boolean;
};
export type AdminClaim = {
  turfId: string;
  userKey: string;
  status: ClaimStatus;
  via: "phone_match" | "admin";
  role: "owner" | "manager" | "staff" | null;
  note: string | null;
  createdAt: number | null;
  pending: boolean;
  siteOwner: boolean;
  turfName: string;
  slug: string | null;
  city: string | null;
  area: string | null;
  listedPhones: string[];
  /** The listed number they proved with a code (10 digits). */
  verifiedPhone: string | null;
  /** The last number they typed for this turf that was not on the listing. */
  phoneGiven: string | null;
  /** When TapTurf last turned this claim down, if ever. */
  rejectedAt: number | null;
  /** A listed number of theirs that still opens the turf at once (10 digits). */
  theirListedPhone: string | null;
  /** Stored at claim time: the account's name now (the typed name on old claims). */
  storedName: string | null;
  userId: string | null;
  account: ClaimAccount | null;
};

const STATUSES: readonly string[] = ["active", "pending", "rejected", "revoked"];
const METHODS: readonly string[] = ["google", "phone", "email", "unknown"];
const ROLES: readonly string[] = ["owner", "manager", "staff"];

const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const time = (x: unknown): number | null => {
  const t = typeof x === "string" ? Date.parse(x) : NaN;
  return Number.isFinite(t) ? t : null;
};
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

function toAccount(x: unknown): ClaimAccount | null {
  const a = obj(x);
  const id = a && str(a.id);
  if (!a || !id) return null;
  const method = typeof a.method === "string" && METHODS.includes(a.method) ? (a.method as Method) : "unknown";
  const other = typeof a.other_claims === "number" && Number.isFinite(a.other_claims) ? Math.max(0, Math.round(a.other_claims)) : 0;
  return { id, name: str(a.name), username: str(a.username), email: str(a.email), phone: str(a.phone), method, signedUpAt: time(a.signed_up_at), lastSeen: time(a.last_seen), otherClaims: other, signInFinished: a.signin_finished !== false, emailChecked: a.email_checked === true };
}

/** Rows from admin_owner_claims; anything malformed is left out. */
export function toClaims(data: unknown): AdminClaim[] {
  if (!Array.isArray(data)) return [];
  const out: AdminClaim[] = [];
  for (const x of data) {
    const r = obj(x);
    const turfId = r && str(r.turf_id);
    const userKey = r && str(r.user_key);
    if (!r || !turfId || !userKey || typeof r.status !== "string" || !STATUSES.includes(r.status)) continue;
    out.push({
      turfId,
      userKey,
      status: r.status as ClaimStatus,
      via: r.via === "phone_match" ? "phone_match" : "admin",
      role: typeof r.role === "string" && ROLES.includes(r.role) ? (r.role as AdminClaim["role"]) : null,
      note: str(r.note),
      createdAt: time(r.created_at),
      pending: r.status === "pending",
      siteOwner: r.site_owner === true,
      turfName: str(r.turf_name) ?? "A turf",
      slug: str(r.slug),
      city: str(r.city),
      area: str(r.area),
      listedPhones: Array.isArray(r.listed_phones) ? r.listed_phones.filter((p): p is string => typeof p === "string") : [],
      verifiedPhone: str(r.verified_phone),
      phoneGiven: str(r.phone_given),
      rejectedAt: time(r.rejected_at),
      theirListedPhone: str(r.their_listed_phone),
      storedName: str(r.name),
      userId: str(r.user_id),
      account: toAccount(r.account),
    });
  }
  return out;
}

/** The key without its kind: an email, or a 10-digit number shown with +91. */
export function keyLabel(userKey: string): string {
  return userKey.startsWith("p:") ? `+91 ${userKey.slice(2)}` : userKey.slice(2);
}

/** An old claim whose typed name is not the account's name (ignores case and spacing). */
export function typedNameDiffers(c: AdminClaim): boolean {
  const norm = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return !!c.storedName && !!c.account?.name && norm(c.storedName) !== norm(c.account.name);
}
