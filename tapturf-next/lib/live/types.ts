/**
 * Live scorecard links: the contract shared by the scorer (writes), the
 * API routes and the follower page (/live/<code>). No imports, so the
 * unit tests and both sides can use it.
 *
 * Flow. The scorer turns on a live link: their browser asks the server
 * for a code (POST /api/live/new, no database), makes a secret of its
 * own, and from then on sends the whole match after each change
 * (PUT /api/live/<code>). The first send creates the row. Followers
 * open /live/<code> and poll GET /api/live/<code>, which Vercel's CDN
 * and the Next data cache answer, so the database sees about one read
 * per write however many people follow.
 */

/** 8 random base36 characters, then 4 that tag them with the server key, so made-up codes are refused without a lookup. */
export const LIVE_CODE_RE = /^[a-z0-9]{12}$/;
/** 32 random bytes as hex, made in the scorer's browser. Only its sha256 is stored. */
export const LIVE_SECRET_RE = /^[0-9a-f]{64}$/;

/** Sanitised match JSON larger than this is refused (a 100 over match is about 90 KB). */
export const LIVE_MAX_MATCH_CHARS = 160_000;
/** Request bodies larger than this are refused before parsing. */
export const LIVE_MAX_BODY_BYTES = 200_000;

/** The scorer sends at most once per this long, except for an innings or match end and flushes. */
export const LIVE_SEND_EVERY_MS = 2_500;
/** A scorer request is given up after this long and retried. */
export const LIVE_SEND_TIMEOUT_MS = 12_000;
/** Backoff for network errors and 5xx. */
export const LIVE_RETRY_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;
/** keepalive bodies share a 64 KiB budget per page; bigger ones wait for the next visit. */
export const LIVE_KEEPALIVE_MAX_BYTES = 60_000;

/** Followers poll this often while the match is live and the tab is visible. */
export const LIVE_POLL_MS = 6_000;
/** ...and this often once it is done (the last ball is often undone), for LIVE_DONE_POLL_FOR_MS. */
export const LIVE_DONE_POLL_MS = 30_000;
export const LIVE_DONE_POLL_FOR_MS = 30 * 60_000;
/** A follower poll is given up after this long. */
export const LIVE_POLL_TIMEOUT_MS = 8_000;

export type LiveStatus = "live" | "done" | "stopped" | "expired";

/** GET /api/live/<code> body (200). match is sanitised; null once stopped or expired. */
export type LiveGetResponse = {
  /** null: the code is valid but the scorer's first update has not arrived yet. */
  status: LiveStatus | "waiting";
  match: unknown | null;
  rev: number;
  /** ISO time of the last accepted update. null while waiting. */
  updatedAt: string | null;
};

/** POST /api/live/new response. */
export type LiveNewResponse = { code: string } | { error: LiveError };

/** PUT /api/live/<code> body. match is the scorer's whole Match. */
export type LivePutBody = { secret: string; match: unknown; rev: number };
/** DELETE /api/live/<code> body. */
export type LiveStopBody = { secret: string };

/**
 * Write results. HTTP status in brackets; the client's response:
 * ok (200)        sentRev = rev.
 * stale (409)     carries the server's rev; set rev = serverRev + 1 and resend the latest local match.
 * slow (429)      retry after LIVE_SEND_EVERY_MS / 2.
 * forbidden (403) this browser's secret is not the link's: turn the link off locally, offer a new one.
 * gone (410)      the link was turned off or expired: turn it off locally.
 * limit (429)     too many links from this network today, or this link has hit its write cap: stop, say so.
 * too_big (413)   the match is too long to share live: stop, say so.
 * bad (400)       malformed request: stop, report.
 * unavailable (503) not configured or the database is down: back off and retry.
 */
export type LiveError = "stale" | "slow" | "forbidden" | "gone" | "limit" | "too_big" | "bad" | "unavailable";

export type LivePutResponse = { ok: true; rev: number } | { error: LiveError; rev?: number };

/**
 * The scorer's record of a link, per match id, in localStorage under
 * LIVE_LINKS_KEY. Kept outside the "tapturf_scorer" prefix on purpose:
 * LiveScorer reloads matches on every storage event with that prefix,
 * and link bookkeeping must not wake the other tab.
 */
export const LIVE_LINKS_KEY = "tapturf_live_links_v1";

export type LiveLinkRecord = {
  code: string;
  secret: string;
  /** false once turned off here or refused by the server (gone, forbidden). */
  on: boolean;
  /** Bumped on every local edit: max(Date.now(), rev + 1). Never goes back. */
  rev: number;
  /** The last rev the server accepted. rev > sentRev means there is something to send. */
  sentRev: number;
  /** Why the link stopped, for the share sheet. */
  stopped?: "off" | "gone" | "forbidden" | "limit" | "too_big";
  createdAt: number;
};

export type LiveLinks = { v: 1; links: Record<string, LiveLinkRecord> };

/** What the scorer's UI shows about a link. */
export type LiveSyncState = "synced" | "sending" | "offline" | "error" | "off";

export function liveUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/live/${code}`;
}
