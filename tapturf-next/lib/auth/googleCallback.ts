import type { CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { googleIdentity, type GoogleIdentity } from "../account/identity";
import { oauthAmrAt, revokeSession } from "../account/link";
import { googleFresh, resolveAccount, type ResolveResult } from "../account/server";
import { exchangeWhy, hasSessionCookie, providerWhy, type Why } from "./callback";
import { safeNext } from "./next";

/**
 * The normal Google sign-in's return (app/api/auth/callback). Relative
 * imports only (npm run test:account).
 *
 * The session cookies the exchange writes are held back in `pending`
 * until the account is known: account_resolve with create runs here,
 * before the session reaches the browser. It logs the Google sign-in
 * once, on the account it opens (a phone account the Google account was
 * added to, its own, or an old-app one); before the account-links
 * migration, or when the account calls are down, log_user_login does, as
 * it always did. Two answers keep the session out:
 *   linking   this Google account is being added to a phone account right now
 *   replaced  it was taken off a phone account (and the person did not ask
 *             for a new account: the tt_g_new cookie from /login)
 * Then the session is revoked, only the verifier cookie's removal is sent,
 * and /login explains (?error=account&why=...).
 */

export const PROJECT_REF = "hwfsbpzercuoshodmnuf";
/** Set when a sign-in finishes here, for 5 minutes: a Back or a second leg of that same sign-in carries on. */
const DONE_COOKIE = "tt_g_done";
/** "Make a new TapTurf account with Google" on /login, for a replaced Google account. Path=/api/auth, 10 minutes. */
export const NEW_ACCOUNT_COOKIE = "tt_g_new";

const RESOLVE_TIMEOUT_MS = 3_000;
const REVOKE_TIMEOUT_MS = 2_000;

export type PendingCookie = { name: string; value: string; options?: CookieOptions };

/** The Supabase session side of the callback; the route builds it on @supabase/ssr, tests stub it. */
export type CallbackSession = {
  /** Swap the code for a session. Its cookies go into the `pending` list the session was made with. */
  exchange(code: string): Promise<{ user: unknown; accessToken: string | null } | { error: unknown }>;
  /** Today's login log (log_user_login with the new session), for when the account calls are down. */
  logLogin(uid: string): Promise<void>;
};

export type CallbackDeps = {
  session: (pending: PendingCookie[]) => CallbackSession;
  supabaseUrl: string | undefined;
  anonKey: string | undefined;
};

/** A cookie removal (the verifier's after an exchange, stale chunks): empty and expired. */
const isRemoval = (c: PendingCookie) => c.value === "" || c.options?.maxAge === 0;

function withTimeout(p: Promise<ResolveResult>, ms: number): Promise<ResolveResult> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ unavailable: true }), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve({ unavailable: true });
      },
    );
  });
}

/** The account this Google sign-in opens, made if it has none: 3 s, once more if that fails. */
async function resolveNow(id: GoogleIdentity): Promise<ResolveResult> {
  const once = () => withTimeout(resolveAccount(id, { create: true, log: true }), RESOLVE_TIMEOUT_MS);
  const r = await once();
  return "unavailable" in r ? once() : r;
}

export async function googleCallback(request: NextRequest, deps: CallbackDeps): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const secure = origin.startsWith("https:");
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  // `next` is where the user wanted to end up. We forward it through
  // /login/complete so the light landing page handles the auth handoff
  // (vs. bouncing them straight to the huge home render).
  const next = safeNext(searchParams.get("next"));
  const asksNew = request.cookies.get(NEW_ACCOUNT_COOKIE)?.value === "1";

  /** The "Make a new account" choice is used once, whatever happens. */
  const clearNew = (res: NextResponse) => {
    if (request.cookies.get(NEW_ACCOUNT_COOKIE)) res.cookies.set(NEW_ACCOUNT_COOKIE, "", { path: "/api/auth", maxAge: 0, sameSite: "lax", secure });
    return res;
  };

  // Back to /login with a reason it can explain, and `next` kept for a one-tap retry. Never the code or an email.
  const back = (kind: "oauth" | "callback" | "account", why: Why, detail: Record<string, unknown> = {}) => {
    console.warn("[OAuth Callback]", JSON.stringify({ ok: false, kind, why, ...detail }));
    const url = new URL("/login", origin);
    url.searchParams.set("error", kind);
    url.searchParams.set("why", why);
    url.searchParams.set("next", next);
    return clearNew(NextResponse.redirect(url));
  };

  /** This browser just finished a Google sign-in here and still has its session. */
  const justSignedIn = () =>
    request.cookies.get(DONE_COOKIE)?.value === "1" && hasSessionCookie(request.cookies.getAll().map((c) => c.name), PROJECT_REF);

  // OAuth provider returned an error (user denied, provider mis-configured, ...)
  if (error) {
    const why = providerWhy(error, searchParams.get("error_code"), searchParams.get("error_description"));
    // A second leg of a sign-in that already finished here (a double return, Back into Google): carry on.
    if ((why === "used" || why === "again") && justSignedIn()) {
      return clearNew(NextResponse.redirect(new URL(`/login/complete?next=${encodeURIComponent(next)}`, origin)));
    }
    return back(why === "denied" ? "oauth" : "callback", why, { error, error_code: searchParams.get("error_code") });
  }

  if (!code) return back("callback", "other", { error: "no_code" });

  // Success: forward to the small /login/complete page. That page
  // watches AuthProvider and pushes the user onwards once the session
  // hydrates, so the huge home page doesn't have to render mid-auth.
  const successUrl = new URL("/login/complete", origin);
  successUrl.searchParams.set("next", next);

  const pending: PendingCookie[] = [];
  const session = deps.session(pending);
  const exchanged = await session.exchange(code);

  if ("error" in exchanged) {
    const why = exchangeWhy(exchanged.error);
    // Back or a refresh onto a code this browser just used to sign in: carry on.
    if (why === "used" && justSignedIn()) return clearNew(NextResponse.redirect(successUrl));
    const e = exchanged.error as { name?: string; code?: string; status?: number } | null;
    return back("callback", why, { code: e?.code ?? e?.name ?? null, status: e?.status ?? null });
  }

  const id = googleIdentity(exchanged.user, oauthAmrAt(exchanged.accessToken));
  let r: ResolveResult = id ? await resolveNow(id) : { unavailable: true };
  if (id && asksNew && "r" in r && r.r === "replaced") r = await googleFresh(id);

  if ("r" in r && (r.r === "linking" || r.r === "replaced")) {
    // No session for this browser: end it, and send only the verifier cookie's removal.
    if (exchanged.accessToken && deps.supabaseUrl && deps.anonKey) {
      await revokeSession(deps.supabaseUrl, deps.anonKey, exchanged.accessToken, REVOKE_TIMEOUT_MS);
    }
    const res = back("account", r.r);
    for (const c of pending) if (isRemoval(c)) res.cookies.set(c.name, c.value, c.options);
    return res;
  }

  const response = NextResponse.redirect(successUrl);
  for (const c of pending) response.cookies.set(c.name, c.value, c.options);
  // Admin "Latest logins": account_resolve logged it on the account it opens. When it could not
  // run, or the database is still the one before the account links (it logs phone sign-ins only),
  // the old log with the new session. Never blocks the sign-in.
  if ("unavailable" in r || ("ok" in r && !r.knowsLinks)) {
    const uid = (exchanged.user as { id?: unknown } | null)?.id;
    if (typeof uid === "string") {
      try {
        await session.logLogin(uid);
      } catch {
        /* ignore */
      }
    }
  }
  response.cookies.set(DONE_COOKIE, "1", { maxAge: 300, path: "/api/auth", httpOnly: true, sameSite: "lax", secure });
  return clearNew(response);
}
