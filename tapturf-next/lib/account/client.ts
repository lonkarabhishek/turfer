import { CITY_SRC_KEY } from "../city";
import { CITY_SRC_HEADER } from "./city";
import type {
  AccountError,
  AccountProfile,
  LinkCompleteResponse,
  LinkStartResponse,
  LinkStatusResponse,
  MeResponse,
  PhoneSetResponse,
  PlayersSearchResponse,
  ProfileResponse,
  UsernameCheckResponse,
  UsernameSuggestResponse,
} from "./types";

/**
 * Browser side of accounts: the sign-in token the account routes need,
 * and calls to them (lib/account/types.ts has the API). Phone sign-ins
 * send their Firebase ID token, Google sign-ins their Supabase access
 * token; never the other.
 */

/** A token, no sign-in on this device ('none'), or could not tell right now ('unknown'). */
export type TokenCheck = { token: string } | { none: true } | { unknown: true };

const FIREBASE_WAIT_MS = 10_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * The Firebase ID token of this device's phone sign-in. 'none' only when
 * the SDK loaded and settled and has no user: that is the one answer that
 * means the sign-in is gone. Offline, slow or failing is 'unknown'.
 */
export async function firebaseToken(): Promise<TokenCheck> {
  // Local end-to-end builds only: a token the test signed with its own key
  // (next.config.ts refuses this flag on Vercel; the server trusts that
  // key only off Vercel, lib/firebase/verifyIdToken.ts certsUrl).
  if (process.env.NEXT_PUBLIC_E2E_AUTH === "1") {
    const t = localStorage.getItem("tt_e2e_fb_token");
    return t ? { token: t } : { none: true };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { unknown: true };
  try {
    const auth = await withTimeout(
      (async () => {
        const { getFirebaseAuth } = await import("@/lib/firebase/client");
        const a = await getFirebaseAuth();
        await a.authStateReady();
        return a;
      })(),
      FIREBASE_WAIT_MS,
    );
    const user = auth.currentUser;
    if (!user) return { none: true };
    return { token: await withTimeout(user.getIdToken(), FIREBASE_WAIT_MS) };
  } catch {
    return { unknown: true };
  }
}

/** The Supabase access token of this device's Google sign-in. */
export async function supabaseToken(): Promise<TokenCheck> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const { data, error } = await createClient().auth.getSession();
    // A failed refresh (offline, a timeout) is not a sign-out: Supabase's own events say when the session ends.
    if (error) return { unknown: true };
    const t = data.session?.access_token;
    return t ? { token: t } : { none: true };
  } catch {
    return { unknown: true };
  }
}

export type Answer<T> = { status: number; body: T | { error: AccountError } };

/** How the city in the tt_city cookie was chosen (lib/city.ts setCityPref), for the server's city note. */
function citySource(): Record<string, string> {
  try {
    const v = localStorage.getItem(CITY_SRC_KEY);
    return v && v.length <= 60 ? { [CITY_SRC_HEADER]: v } : {};
  } catch {
    return {};
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<Answer<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...citySource(), Authorization: `Bearer ${token}` },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON: a proxy page */
    }
    if (!body || typeof body !== "object") return { status: res.status, body: { error: "unavailable" } };
    return { status: res.status, body: body as T };
  } catch {
    return { status: 0, body: { error: "unavailable" } };
  }
}

export const getMe = (token: string) => call<MeResponse>(token, "/api/account/me");

/** Sign in, making the account if needed. A phone sign-up sends its name. */
export const postMe = (token: string, name?: string) =>
  call<MeResponse>(token, "/api/account/me", { method: "POST", body: JSON.stringify(name ? { name } : {}) });

export type MePatch = {
  name?: string;
  username?: string;
  taggable?: boolean;
  /** Removes an email typed into an earlier TapTurf. Emails are added only through Google. */
  email?: null;
  /** "No thanks" on the ask to add Google. */
  skipEmail?: true;
};

export const patchMe = (token: string, patch: MePatch) =>
  call<MeResponse>(token, "/api/account/me", { method: "PATCH", body: JSON.stringify(patch) });

export const checkUsername = (token: string, u: string) =>
  call<UsernameCheckResponse>(token, `/api/account/username?u=${encodeURIComponent(u)}`);

export const suggestUsername = (token: string) => call<UsernameSuggestResponse>(token, "/api/account/username?suggest=1");

export const searchPlayers = (token: string, q: string) =>
  call<PlayersSearchResponse>(token, `/api/players/search?q=${encodeURIComponent(q)}`);

/** The profile in an answer, if there is one (a failed edit still sends the current one). */
export function profileOf(a: Answer<MeResponse>): AccountProfile | null {
  const b = a.body as { profile?: AccountProfile };
  return b && b.profile && typeof b.profile.id === "string" ? b.profile : null;
}

export function errorOf(a: Answer<unknown>): AccountError | null {
  const e = (a.body as { error?: unknown } | null)?.error;
  return typeof e === "string" ? (e as AccountError) : null;
}

/* ------------------------------------------------------------------ */
/* Two ways into one account                                           */
/* ------------------------------------------------------------------ */

/**
 * Adding Google to a phone account (Bearer: the phone sign-in's Firebase
 * token). The server makes each Google round trip and keeps its secret in
 * an httpOnly cookie, so these only carry the answer; the browser then
 * goes to `url` itself, with no Supabase call (lib/account/types.ts).
 * then: where /account/link sends the person when it is done.
 */
export const startGoogleLink = (phoneToken: string, then: string, proof?: string) =>
  call<LinkStartResponse>(phoneToken, "/api/account/link/google", { method: "POST", body: JSON.stringify(proof ? { then, proof } : { then }) });

/** Another Google round trip on the same attempt ("Try again", "Try a different Google account"). */
export const newGoogleLeg = (phoneToken: string) => call<LinkStartResponse>(phoneToken, "/api/account/link/google/leg", { method: "POST", body: "{}" });

/** Where the attempt stands (for /account/link). */
export const googleLinkStatus = (phoneToken: string) => call<LinkStatusResponse>(phoneToken, "/api/account/link/google");

/** The person confirmed: add the Google account. */
export const completeGoogleLink = (phoneToken: string) =>
  call<LinkCompleteResponse>(phoneToken, "/api/account/link/google/complete", { method: "POST", body: "{}" });

/** Give up on an attempt (Cancel, log out). Same-origin, no token; never throws. */
export async function cancelGoogleLink(): Promise<void> {
  try {
    await fetch("/api/account/link/google", { method: "DELETE", keepalive: true, cache: "no-store" });
  } catch {
    /* offline: the attempt runs out in 10 minutes anyway */
  }
}

/** Take the Google account off (a fresh OTP, or a proof of one). */
export const removeGoogle = (phoneToken: string, proof?: string) =>
  call<ProfileResponse>(phoneToken, "/api/account/link/google/remove", { method: "POST", body: JSON.stringify(proof ? { proof } : {}) });

/** Add, confirm or change the number of a Google account (Bearer: a Google sign-in in the last 10 minutes). */
export const addPhone = (googleToken: string, proof: string) =>
  call<PhoneSetResponse>(googleToken, "/api/account/phone", { method: "POST", body: JSON.stringify({ proof }) });

/** Take the number off a Google account. */
export const removePhone = (googleToken: string) => call<ProfileResponse>(googleToken, "/api/account/phone", { method: "DELETE" });

export { oauthAgeS } from "./oauthAge";

/** A profile in any answer that carries one. */
export function profileIn(a: Answer<unknown>): AccountProfile | null {
  const b = a.body as { profile?: AccountProfile } | null;
  return b && b.profile && typeof b.profile.id === "string" ? b.profile : null;
}
