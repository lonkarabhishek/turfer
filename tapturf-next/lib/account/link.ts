import { createHash, randomBytes } from "node:crypto";
import type { Why } from "../auth/callback";
import { safeNext } from "../auth/next";

export { oauthAmrAt } from "./fresh";

/**
 * Adding Google to a phone account: the server's half of each Google
 * round trip (a "leg"). Server only. Relative imports only, so the unit
 * test compiles it on its own (npm run test:account).
 *
 * The server makes each leg's PKCE verifier and keeps it only in an
 * httpOnly cookie on the browser that asked (`__Host-tt_link` on https).
 * Google returns to /api/account/link/google/callback, which exchanges
 * the code with GoTrue itself, tells the database which Google account
 * came back (only for the leg whose verifier matched, once), and revokes
 * that session at once. No Supabase session cookie is ever written for a
 * leg, and the browser's Supabase client never holds a verifier for one.
 * The database keeps only sha256("tt-link:" + verifier), so the
 * code_challenge Google and Supabase see is not the stored value.
 */

/** A link intent lasts 10 minutes, and so does its cookie. */
export const LINK_TTL_S = 600;
/** After a final answer, a Back into Google's leg carries on for 5 minutes. */
export const LINK_DONE_S = 300;
/** Where the profile's actions come back to. */
export const PROFILE_THEN = "/dashboard?tab=profile";

/** `__Host-`: Secure, Path=/ and no Domain, so a sibling domain can't plant one. Plain http (local runs) can't use the prefix. */
export const linkCookie = (secure: boolean) => (secure ? "__Host-tt_link" : "tt_link");
export const linkDoneCookie = (secure: boolean) => (secure ? "__Host-tt_link_done" : "tt_link_done");
export const linkCookieOptions = (secure: boolean, maxAge: number = LINK_TTL_S) => ({
  httpOnly: true,
  secure,
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

const VERIFIER_RE = /^[A-Za-z0-9_-]{43}$/;
const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** 32 random bytes, 43 base64url characters: a valid PKCE code verifier (RFC 7636). */
export const newVerifier = (): string => randomBytes(32).toString("base64url");

/** What the database keeps for a leg's verifier, or null when it is not one of ours. */
export function legHash(v: string | null | undefined): string | null {
  return typeof v === "string" && VERIFIER_RE.test(v) ? sha256hex(`tt-link:${v}`) : null;
}

/** The S256 code challenge of a verifier (RFC 7636 section 4.2). */
export const challengeOf = (v: string): string => createHash("sha256").update(v, "ascii").digest("base64url");

const MAX_THEN = 500;
const cleanThen = (then: string | null | undefined): string => {
  const t = safeNext(then);
  return t.length > MAX_THEN ? "/" : t;
};

/** The link cookie's value: the verifier, then where to go afterwards. */
export function packLinkCookie(v: string, then: string | null | undefined): string {
  return `${v}.${Buffer.from(cleanThen(then), "utf8").toString("base64url")}`;
}

/** The link cookie, or null when it is missing or not in our shape. */
export function readLinkCookie(raw: string | null | undefined): { verifier: string; then: string } | null {
  if (!raw || raw.length > 1_000) return null;
  const dot = raw.indexOf(".");
  if (dot < 0) return null;
  const verifier = raw.slice(0, dot);
  const rest = raw.slice(dot + 1);
  if (!VERIFIER_RE.test(verifier) || !/^[A-Za-z0-9_-]*$/.test(rest)) return null;
  return { verifier, then: cleanThen(Buffer.from(rest, "base64url").toString("utf8")) };
}

/** A cookie of the request, or undefined. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

const base = (supabaseUrl: string) => supabaseUrl.replace(/\/+$/, "");

/**
 * Where the browser goes for a leg: GoTrue's Google sign-in, with the same
 * parameters supabase-js 2.96 sends (GoTrueClient._getUrlForProvider), and
 * Google's account picker every time.
 */
export function authorizeUrl(supabaseUrl: string, redirectTo: string, challenge: string): string {
  return (
    `${base(supabaseUrl)}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}` +
    `&code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=s256&prompt=select_account`
  );
}

export type ExchangeWhy = "used" | "expired" | "lost" | "google" | "unavailable";
export type Exchanged = { ok: { accessToken: string; user: unknown } } | { why: ExchangeWhy };

/** Why GoTrue refused a code. */
export function pkceErrorWhy(status: number, body: unknown): ExchangeWhy {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  // With X-Supabase-Api-Version 2024-01-01 the error code is `code`; older answers use `error_code`.
  const code = typeof b.code === "string" ? b.code : typeof b.error_code === "string" ? b.error_code : "";
  const msg = [b.msg, b.message, b.error_description].find((x): x is string => typeof x === "string") ?? "";
  if (code === "flow_state_not_found" || /no valid flow state/i.test(msg)) return "used";
  if (code === "flow_state_expired") return "expired";
  if (code === "bad_code_verifier") return "lost";
  // GoTrue down or busy: try again later.
  if (status >= 500 || status === 429) return "unavailable";
  return "google";
}

/**
 * Swap a leg's code for a session, with the verifier from the leg's cookie.
 * The tokens never leave the server, and the session is revoked right after.
 */
export async function exchangePkce(
  supabaseUrl: string,
  anonKey: string,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<Exchanged> {
  let res: Response;
  try {
    res = await fetchImpl(`${base(supabaseUrl)}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json;charset=UTF-8",
        "X-Supabase-Api-Version": "2024-01-01",
      },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return { why: "unavailable" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) return { why: pkceErrorWhy(res.status, body) };
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.access_token !== "string" || !b.access_token || !b.user || typeof b.user !== "object") return { why: "google" };
  return { ok: { accessToken: b.access_token, user: b.user } };
}

/** End a session GoTrue made for a leg (or a refused sign-in). Never throws. */
export async function revokeSession(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  timeoutMs = 5_000,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<void> {
  try {
    const res = await fetchImpl(`${base(supabaseUrl)}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 401/403/404: already ended.
    if (!res.ok && res.status >= 500) console.warn("account: session revoke failed", res.status);
  } catch (e) {
    console.warn("account: session revoke failed", (e as Error)?.name ?? "error");
  }
}

export type LinkCallbackPlan = "page" | "lost" | "err_denied" | "err_google" | "exchange";

/**
 * What /api/account/link/google/callback does with a return from Google,
 * before anything is exchanged.
 *   no link cookie   "page" after a finished link (a Back), else "lost"; the code is never used
 *   provider error   used or again: "page"; denied: "err_denied"; anything else: "err_google"
 *   no code          "err_google"
 */
export function linkCallbackPlan(o: { hasCookie: boolean; hasDone: boolean; providerWhy: Why | null; hasCode: boolean }): LinkCallbackPlan {
  if (!o.hasCookie) return o.hasDone ? "page" : "lost";
  if (o.providerWhy === "used" || o.providerWhy === "again") return "page";
  if (o.providerWhy === "denied") return "err_denied";
  if (o.providerWhy !== null || !o.hasCode) return "err_google";
  return "exchange";
}
