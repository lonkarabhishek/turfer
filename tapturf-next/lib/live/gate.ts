import { createHash } from "node:crypto";
import { peekToken, type Identity, type IdentityResult } from "../account/identity";
import type { LiveCodeGen } from "./codes";

/**
 * Who may write to a live link (PUT /api/live/<code>; POST /api/live/new
 * asks for the same sign-in). The owner's call, 29 Oct 2026: the server
 * refuses live link writes from anyone not logged in, and logged-in
 * scorers notice no difference. Scoring needs nothing, following is as it
 * was, and turning a link off (DELETE) needs only its secret, so a scorer
 * whose login lapsed can still take their match down.
 *
 * A write goes ahead with a sign-in the server verifies that opens a
 * TapTurf account (lib/account/identity.ts, as on every account route,
 * then the account it opens, never one made for it), and the first one a
 * link takes that way records the account as the link's starter
 * (20261029_live_link_starts.sql). Otherwise the answer is login (401) and
 * nothing is written, with two exceptions, both only for a writer that
 * holds the link's secret (live_match_put still checks it):
 *   legacy       the code is from before the check (the first tag,
 *                lib/live/codes.ts) and its match was already running, so
 *                its scorer may be on a tab with the old page, which sends
 *                no sign-in. Until LIVE_LEGACY_UNTIL; each link's own 36
 *                hour write window (live_match_put) ends most sooner.
 *   unavailable  the sign-in cannot be checked right now (Firebase's certs
 *                or Supabase's auth not answering; never a token found
 *                invalid). A link whose starter is recorded carries on:
 *                fail open, because a verified account already started it
 *                with this same secret, and refusing would freeze a running
 *                match over a check it passed. Anything else gets a 503 the
 *                scorer retries: fail closed, so no link starts unchecked.
 * Pure but for the token hash; reads are injected (npm run test:live).
 */

/**
 * When the legacy grace ends: a week after the planned deploy of the
 * check (30 Oct 2026, 00:00 IST), so a deploy that slips a few days still
 * leaves running matches alone. No legacy link can take writes 36 hours
 * after the deploy anyway (live_match_put's window from its first write,
 * which came before); a link with an old code first written after the
 * deploy needed the sign-in for it. Past this date the grace code can go.
 */
export const LIVE_LEGACY_UNTIL = Date.parse("2026-11-06T00:00:00+05:30");

/** The account a verified sign-in opens, and how that sign-in was made. */
export type LiveSigner = { userId: string; method: "google" | "phone" };

/** No sign-in sent; one that isn't a valid, current sign-in or opens no account; or no way to check one right now. */
export type LiveWho = { ok: LiveSigner } | { missing: true } | { invalid: true } | { unavailable: true };

/**
 * The link as the grace sees it. new: a code minted since the check, or
 * an older one with no running match (the sign-in is needed to start it);
 * legacy: an older code whose match is running, before LIVE_LEGACY_UNTIL;
 * legacy_out: an older code after it; unknown: the read that tells failed.
 */
export type LiveLinkKind = "new" | "legacy" | "legacy_out" | "unknown";

/** Go ahead (recording the starter when there is one to record), or refuse. */
export type LiveGate = { write: true; record: LiveSigner | null } | { refuse: "login" | "unavailable" };

/** The decision table. starter: whether the link's starter is recorded (null: not known). */
export function decideLiveWrite(who: LiveWho, link: LiveLinkKind, starter: boolean | null): LiveGate {
  if ("ok" in who) return { write: true, record: who.ok };
  if (link === "legacy") return { write: true, record: null };
  if ("unavailable" in who) return starter === true ? { write: true, record: null } : { refuse: "unavailable" };
  // No sign-in, or not a valid one. A failed read is not "logged out": retry rather than ask for a login.
  return link === "unknown" ? { refuse: "unavailable" } : { refuse: "login" };
}

/** What the link's row says: a running match (live or done), none (no row, or stopped, expired or a stop marker), or unknown. */
export type LinkRead = "running" | "none" | "unknown";

export function liveLinkKind(gen: LiveCodeGen, row: LinkRead, now: number): LiveLinkKind {
  if (gen === 2) return "new";
  if (now >= LIVE_LEGACY_UNTIL) return "legacy_out";
  return row === "running" ? "legacy" : row === "unknown" ? "unknown" : "new";
}

/**
 * The gate for one write, reading only what the decision needs: nothing
 * for a verified sign-in (the usual case, one per ball), the row only for
 * an older code inside the grace, the starter only while sign-ins cannot
 * be checked.
 */
export async function gateLiveWrite(
  who: LiveWho,
  gen: LiveCodeGen,
  now: number,
  read: { row: () => Promise<LinkRead>; starter: () => Promise<boolean | null> },
): Promise<LiveGate> {
  if ("ok" in who) return decideLiveWrite(who, "new", null);
  const row = gen === 1 && now < LIVE_LEGACY_UNTIL ? await read.row() : "none";
  const link = liveLinkKind(gen, row, now);
  const starter = "unavailable" in who && link !== "legacy" ? await read.starter() : null;
  return decideLiveWrite(who, link, starter);
}

/* ------------------------------------------------------------------ */
/* The signer of a write                                               */
/* ------------------------------------------------------------------ */

/** Verified sign-ins kept per instance. */
export const LIVE_WHO_MAX = 5_000;

export type LiveWhoDeps = {
  identify: (token: string) => Promise<IdentityResult>;
  /** The account an identity opens (account_resolve without creating one). */
  account: (id: Identity) => Promise<{ ok: string } | { none: true } | { unavailable: true }>;
  now: () => number;
};

/**
 * The signer of a write, from its Bearer token. A scorer sends one PUT per
 * ball: the identity checker keeps a verified Firebase sign-in 5 minutes
 * and a Supabase one 1 minute, and the account behind it is a database
 * call, so this keeps the account a token opens, by a hash of the token
 * (never the token), until the token expires (an hour at most for both).
 * A match then costs one check per token, not one per ball. Only answers
 * that verified are kept; an expired token is refused from its own exp
 * before any check. A token signed out before it expires keeps writing,
 * until then, to links whose secret its browser holds.
 */
export function createLiveWho(deps: LiveWhoDeps) {
  const cache = new Map<string, { until: number; who: LiveSigner }>();
  const remember = (key: string, who: LiveSigner, until: number) => {
    if (cache.size >= LIVE_WHO_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { until, who });
  };

  return async function who(token: string | null): Promise<LiveWho> {
    if (!token) return { missing: true };
    const peek = peekToken(token);
    const now = deps.now();
    if (!peek || peek.exp * 1000 <= now) return { invalid: true };
    const key = createHash("sha256").update(token).digest("hex");
    const hit = cache.get(key);
    if (hit) {
      if (hit.until > now) return { ok: hit.who };
      cache.delete(key);
    }
    const id = await deps.identify(token);
    if ("invalid" in id) return { invalid: true };
    if ("unavailable" in id) return { unavailable: true };
    const acc = await deps.account(id.ok);
    if ("unavailable" in acc) return { unavailable: true };
    // A sign-in that opens no account (a sign-up not finished) logs in again, which makes it.
    if ("none" in acc) return { invalid: true };
    const signer: LiveSigner = { userId: acc.ok, method: id.ok.kind === "google" ? "google" : "phone" };
    remember(key, signer, peek.exp * 1000);
    return { ok: signer };
  };
}
