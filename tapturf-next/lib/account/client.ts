import type { AccountError, AccountProfile, MeResponse, PlayersSearchResponse, UsernameCheckResponse, UsernameSuggestResponse } from "./types";

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

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<Answer<T>> {
  try {
    const res = await fetch(path, {
      ...init,
      cache: "no-store",
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` },
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

export const postMe = (token: string, name?: string) =>
  call<MeResponse>(token, "/api/account/me", { method: "POST", body: JSON.stringify(name ? { name } : {}) });

export const patchMe = (token: string, patch: { name?: string; username?: string; taggable?: boolean }) =>
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
