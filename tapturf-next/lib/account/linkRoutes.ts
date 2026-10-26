import { NextResponse } from "next/server";
import { checkFirebaseIdToken } from "../firebase/verifyIdToken";
import { providerWhy } from "../auth/callback";
import { freshPhone, nowSeconds, type FreshPhone } from "./fresh";
import { googleIdentity, type PhoneIdentity } from "./identity";
import {
  authorizeUrl,
  challengeOf,
  exchangePkce,
  LINK_DONE_S,
  legHash,
  linkCallbackPlan,
  linkCookie,
  linkCookieOptions,
  linkDoneCookie,
  newVerifier,
  oauthAmrAt,
  packLinkCookie,
  PROFILE_THEN,
  readCookie,
  readLinkCookie,
  revokeSession,
} from "./link";
import { accountError, accountReply, caller, later } from "./route";
import {
  createAccountLimiter,
  linkAttach,
  linkCancel,
  linkGoogle,
  linkLeg,
  linkStart,
  linkStatus,
  notePhoneChecked,
  PRIVATE_HEADERS,
  readSmallJson,
  unlinkGoogle,
} from "./server";

/**
 * The routes that add, change or remove the Google account of a phone
 * account (design: flow A). app/api/account/link/google/** call these.
 * Relative imports only (npm run test:account).
 *
 *   POST   /api/account/link/google           start: a fresh phone sign-in (or a proof) -> Google's URL + link cookie
 *   POST   /api/account/link/google/leg       another Google round trip on the same attempt
 *   GET    /api/account/link/google/callback  Google comes back here: the code is exchanged and the session revoked
 *   GET    /api/account/link/google           where the attempt stands (for /account/link)
 *   POST   /api/account/link/google/complete  the person confirmed: the link is made
 *   DELETE /api/account/link/google           Cancel, and logout: ends the attempt by its cookie
 *   POST   /api/account/link/google/remove    takes the Google account off (fresh OTP)
 *
 * Every step but the callback and DELETE needs the phone sign-in's
 * Firebase token as Bearer; the database checks every later step comes
 * from the same Firebase user (and number) as the start.
 */

const allowStart = createAccountLimiter(10);
const allowLeg = createAccountLimiter(10);
const allowRemove = createAccountLimiter(10);
const allowStatus = createAccountLimiter(20);
const allowComplete = createAccountLimiter(20);
const allowCancel = createAccountLimiter(20);

/** Longer than any real Firebase ID token. */
const MAX_PROOF = 8_000;
const MAX_START_BODY = 9_000;

const CALLBACK_PATH = "/api/account/link/google/callback";
const PAGE_PATH = "/account/link";

function supabaseEnv(): { url: string; anon: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? { url, anon } : null;
}

const isSecure = (req: Request) => new URL(req.url).protocol === "https:";

/** The request's link cookie (the leg's verifier and where to go afterwards), or null. */
function linkOf(req: Request): { verifier: string; then: string; hash: string } | null {
  const c = readLinkCookie(readCookie(req, linkCookie(isSecure(req))));
  const hash = c ? legHash(c.verifier) : null;
  return c && hash ? { ...c, hash } : null;
}

function setLink(res: NextResponse, req: Request, verifier: string, then: string): NextResponse {
  const secure = isSecure(req);
  res.cookies.set(linkCookie(secure), packLinkCookie(verifier, then), linkCookieOptions(secure));
  return res;
}

/** A final answer: the attempt's cookie goes, and a Back into Google's page carries on quietly for 5 minutes. */
function finish(res: NextResponse, req: Request): NextResponse {
  const secure = isSecure(req);
  res.cookies.set(linkCookie(secure), "", linkCookieOptions(secure, 0));
  res.cookies.set(linkDoneCookie(secure), "1", linkCookieOptions(secure, LINK_DONE_S));
  return res;
}

const limitReply = (until: string | null) => accountReply(until ? { until } : {}, "limit");

/** The verified phone caller; a Google sign-in gets 400 bad (adding Google starts from the phone sign-in). */
async function phoneCaller(req: Request, allow: (req: Request) => boolean): Promise<{ id: PhoneIdentity } | { reply: NextResponse }> {
  const who = await caller(req, allow);
  if ("reply" in who) return who;
  if (who.id.kind !== "phone") return { reply: accountError("bad") };
  return { id: who.id };
}

/** The identity's own fields, as freshPhone reads them. */
const claimsOf = (id: PhoneIdentity) => ({ sub: id.sub, phone_number: id.phone, sign_in_provider: id.provider, auth_time: id.authTime, iat: id.iat });

/**
 * A phone OTP sign-in from the last 5 minutes: the proof (a Firebase token
 * of a fresh OTP on a throwaway instance, for the same number and the same
 * Firebase user), else the Bearer itself. Neither: 403 reauth.
 */
async function freshFor(id: PhoneIdentity, proof: unknown): Promise<{ fresh: FreshPhone } | { reply: NextResponse }> {
  const now = nowSeconds();
  if (proof !== undefined && proof !== null) {
    if (typeof proof !== "string") return { reply: accountError("bad") };
    if (!proof || proof.length > MAX_PROOF) return { reply: accountError("proof") };
    const c = await checkFirebaseIdToken(proof);
    if ("unavailable" in c) return { reply: accountError("unavailable") };
    if ("invalid" in c) return { reply: accountError("proof") };
    // Another number or another Firebase user: not this person's sign-in.
    if (c.ok.phone_number !== id.phone || c.ok.sub !== id.sub) return { reply: accountError("proof") };
    const f = freshPhone(c.ok, now);
    if (f) return { fresh: f };
  }
  const f = freshPhone(claimsOf(id), now);
  return f ? { fresh: f } : { reply: accountError("reauth") };
}

/** Google's sign-in page for a new leg, with this site's link callback. */
function legUrl(req: Request, verifier: string): string | null {
  const env = supabaseEnv();
  if (!env) return null;
  return authorizeUrl(env.url, `${new URL(req.url).origin}${CALLBACK_PATH}`, challengeOf(verifier));
}

/** POST /api/account/link/google { then?, proof? }: start adding Google. */
export async function startLink(req: Request): Promise<NextResponse> {
  const who = await phoneCaller(req, allowStart);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req, MAX_START_BODY);
  if (!body) return accountError("bad");
  if (body.then !== undefined && typeof body.then !== "string") return accountError("bad");
  const then = typeof body.then === "string" ? body.then : PROFILE_THEN;

  const fresh = await freshFor(who.id, body.proof);
  if ("reply" in fresh) return fresh.reply;

  const verifier = newVerifier();
  const url = legUrl(req, verifier);
  if (!url) return accountError("unavailable");
  const r = await linkStart(who.id.phone, fresh.fresh.sub, fresh.fresh.authTime, fresh.fresh.proofKey, legHash(verifier)!);
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) {
    if (r.r === "limit") return limitReply(r.until);
    return accountError(r.r === "stale" ? "reauth" : r.r);
  }
  return setLink(accountReply({ url, expiresAt: r.ok.expiresAt }), req, verifier, then);
}

/** POST /api/account/link/google/leg: "Try again" or "Try a different Google account" on the same attempt. */
export async function newLeg(req: Request): Promise<NextResponse> {
  const who = await phoneCaller(req, allowLeg);
  if ("reply" in who) return who.reply;
  const link = linkOf(req);
  if (!link) return accountError("expired");
  const verifier = newVerifier();
  const url = legUrl(req, verifier);
  if (!url) return accountError("unavailable");
  const r = await linkLeg(link.hash, who.id.sub, legHash(verifier)!);
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return r.r === "limit" ? limitReply(r.until) : accountError(r.r);
  return setLink(accountReply({ url, expiresAt: r.ok.expiresAt }), req, verifier, link.then);
}

/** GET /api/account/link/google: where the attempt stands. No cookie: none. */
export async function linkState(req: Request): Promise<NextResponse> {
  const who = await phoneCaller(req, allowStatus);
  if ("reply" in who) return who.reply;
  const link = linkOf(req);
  if (!link) return accountReply({ state: "none" });
  const s = await linkStatus(link.hash, who.id.sub);
  if ("unavailable" in s) return accountError("unavailable");
  return accountReply(s);
}

/** POST /api/account/link/google/complete: the person confirmed the Google account. */
export async function completeLink(req: Request): Promise<NextResponse> {
  const who = await phoneCaller(req, allowComplete);
  if ("reply" in who) return who.reply;
  const link = linkOf(req);
  if (!link) return finish(accountError("expired"), req);
  const r = await linkGoogle(link.hash, who.id.phone, who.id.sub);
  // Try again: the cookie stays.
  if ("unavailable" in r) return accountError("unavailable");
  if ("ok" in r) {
    const profile = r.ok;
    const phone = who.id.phone;
    later(() => notePhoneChecked(profile.id, phone));
    return finish(accountReply({ profile }), req);
  }
  const { r: error, ...brief } = r;
  return finish(accountReply(error === "has_account" ? brief : {}, error), req);
}

/** The request comes from this site's own pages (no Bearer on DELETE, so this stands in for one). */
function sameOrigin(req: Request): boolean {
  if (req.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const own = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  return host === own || host === new URL(req.url).host;
}

/** DELETE /api/account/link/google: Cancel, and logout. Ends the attempt its cookie names, and the cookie. */
export async function cancelLink(req: Request): Promise<NextResponse> {
  if (!sameOrigin(req)) return accountError("bad");
  if (!allowCancel(req)) return accountError("slow");
  const link = linkOf(req);
  if (link) await linkCancel(link.hash);
  const res = new NextResponse(null, { status: 204, headers: PRIVATE_HEADERS });
  const secure = isSecure(req);
  res.cookies.set(linkCookie(secure), "", linkCookieOptions(secure, 0));
  return res;
}

/** POST /api/account/link/google/remove { proof? }: take the Google account off, after a fresh OTP. */
export async function removeGoogle(req: Request): Promise<NextResponse> {
  const who = await phoneCaller(req, allowRemove);
  if ("reply" in who) return who.reply;
  const body = await readSmallJson(req, MAX_START_BODY);
  if (!body) return accountError("bad");
  const fresh = await freshFor(who.id, body.proof);
  if ("reply" in fresh) return fresh.reply;
  const r = await unlinkGoogle(who.id.phone, fresh.fresh.sub, fresh.fresh.authTime, fresh.fresh.proofKey);
  if ("unavailable" in r) return accountError("unavailable");
  if ("r" in r) return accountError(r.r === "stale" ? "reauth" : r.r);
  return accountReply({ profile: r.ok });
}

/**
 * GET /api/account/link/google/callback: Google's return for a leg. Only
 * the browser holding the leg's cookie can exchange its code. The session
 * GoTrue makes is revoked at once and its tokens never leave the server;
 * no Supabase cookie, no login log, no account here. Always to
 * /account/link, which reads where the attempt stands; `err` only says
 * why nothing came back.
 */
export async function linkCallback(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const secure = url.protocol === "https:";
  const link = linkOf(req);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const plan = linkCallbackPlan({
    hasCookie: !!link,
    hasDone: readCookie(req, linkDoneCookie(secure)) === "1",
    providerWhy: error ? providerWhy(error, url.searchParams.get("error_code"), url.searchParams.get("error_description")) : null,
    hasCode: !!code,
  });
  const page = (err?: string) => {
    const to = new URL(PAGE_PATH, url.origin);
    to.searchParams.set("then", link?.then ?? PROFILE_THEN);
    if (err) to.searchParams.set("err", err);
    console.info("[link callback]", JSON.stringify({ plan, err: err ?? null }));
    const res = NextResponse.redirect(to, 302);
    res.headers.set("Cache-Control", PRIVATE_HEADERS["Cache-Control"]);
    return res;
  };
  if (plan === "page") return page();
  if (plan === "lost") return page("lost");
  if (plan === "err_denied") return page("denied");
  if (plan === "err_google" || !link || !code) return page("google");

  const env = supabaseEnv();
  if (!env) return page("unavailable");
  const x = await exchangePkce(env.url, env.anon, code, link.verifier);
  if ("why" in x) return x.why === "used" ? page() : page(x.why);
  const token = x.ok.accessToken;
  later(() => revokeSession(env.url, env.anon, token));

  const id = googleIdentity(x.ok.user, oauthAmrAt(token));
  if (!id) return page("google");
  let r = await linkAttach(link.hash, id.uid);
  if ("unavailable" in r) r = await linkAttach(link.hash, id.uid);
  if ("unavailable" in r) return page("unavailable");
  console.info("[link callback]", JSON.stringify({ attach: r.r, otherEmpty: r.otherEmpty ?? null }));
  return page();
}
