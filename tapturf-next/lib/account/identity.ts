import { createHash } from "node:crypto";
import { checkFirebaseIdToken, FIREBASE_ISSUER, type FirebaseIdClaims } from "../firebase/verifyIdToken";
import { INDIAN_E164_RE, oauthAmrAt } from "./fresh";

export { INDIAN_E164_RE };

/**
 * Who is calling an account route, from the Bearer token the browser
 * sends: a Firebase ID token for phone sign-ins, or the Supabase access
 * token for Google sign-ins. Server only. Relative imports only, so the
 * unit test compiles it on its own (npm run test:account).
 *
 * Three outcomes, and routes must keep them apart:
 *   ok          a verified identity
 *   invalid     not a valid, current sign-in: answer 401 sign_in
 *   unavailable could not check right now: answer 503, never "signed out"
 *
 * Google means Google: a Supabase session counts only when its token's
 * `amr` has `method: oauth` (the rule private._caller_key uses), so an
 * email and password session is refused even on an account that also has
 * Google. Both kinds carry what lib/account/fresh.ts needs to tell a
 * fresh sign-in from an old one.
 */

export type PhoneIdentity = {
  kind: "phone";
  phone: string;
  /** The Firebase user. */
  sub: string;
  /** When the OTP sign-in happened (seconds); null when the token does not say. */
  authTime: number | null;
  /** When this token was minted (seconds). */
  iat: number;
  /** firebase.sign_in_provider: "phone" for an OTP. */
  provider: string | null;
};

export type GoogleIdentity = {
  kind: "google";
  uid: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  /** When the person signed in with Google (the amr oauth timestamp, seconds). A refresh keeps it. */
  oauthAt: number;
};

export type Identity = PhoneIdentity | GoogleIdentity;

export type IdentityResult = { ok: Identity } | { invalid: true } | { unavailable: true };

/** Longer than any real token; anything past it is refused before parsing. */
const MAX_TOKEN_CHARS = 8_000;

/** The token's unverified iss and exp, only to pick the checker. Never trusted on their own. */
export function peekToken(token: string): { iss: string; exp: number } | null {
  if (!token || token.length > MAX_TOKEN_CHARS) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    return typeof p.iss === "string" && typeof p.exp === "number" ? { iss: p.iss, exp: p.exp } : null;
  } catch {
    return null;
  }
}

/** The Bearer token of a request, or null. */
export function bearerToken(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

/** A verified Firebase token's identity: only a phone sign-in with an Indian number counts. */
export function phoneIdentity(claims: FirebaseIdClaims): PhoneIdentity | null {
  const phone = claims.phone_number ?? "";
  if (!INDIAN_E164_RE.test(phone)) return null;
  return {
    kind: "phone",
    phone,
    sub: claims.sub,
    authTime: typeof claims.auth_time === "number" ? claims.auth_time : null,
    iat: claims.iat,
    provider: claims.sign_in_provider ?? null,
  };
}

const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);

/**
 * A GoTrue user's identity: only a Google sign-in counts (not email, not
 * anonymous). Name and photo come from Google's profile, as before.
 * oauthAt is the amr oauth timestamp of that same session's access token
 * (oauthAmrAt); without one it is not a Google sign-in.
 */
export function googleIdentity(user: unknown, oauthAt: number | null): GoogleIdentity | null {
  if (oauthAt === null || !Number.isFinite(oauthAt)) return null;
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  const uid = str(u.id);
  if (!uid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) return null;
  if (u.is_anonymous === true) return null;
  const providers = (u.app_metadata as { providers?: unknown } | undefined)?.providers;
  if (!Array.isArray(providers) || !providers.includes("google")) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  return {
    kind: "google",
    uid: uid.toLowerCase(),
    email: str(u.email)?.toLowerCase() ?? null,
    name: str(meta.full_name) ?? str(meta.name),
    avatar: str(meta.avatar_url) ?? str(meta.picture),
    oauthAt,
  };
}

export type IdentityDeps = {
  supabaseUrl: string | undefined;
  anonKey: string | undefined;
  checkFirebase: typeof checkFirebaseIdToken;
  fetchImpl: typeof fetch;
  now: () => number;
};

/** How long a verified identity is reused, at most. */
const FIREBASE_CACHE_MS = 5 * 60_000;
const SUPABASE_CACHE_MS = 60_000;
const CACHE_MAX = 5_000;

/**
 * Makes a checker with its own cache of verified identities, keyed by
 * a hash of the token (never the token itself). Bounded: the oldest
 * entry goes when it is full.
 */
export function createIdentityChecker(deps: IdentityDeps) {
  const cache = new Map<string, { until: number; id: Identity }>();

  function remember(key: string, id: Identity, until: number) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { until, id });
  }

  async function googleUser(token: string): Promise<IdentityResult> {
    const { supabaseUrl, anonKey } = deps;
    if (!supabaseUrl || !anonKey) return { unavailable: true };
    let res: Response;
    try {
      // The token goes in explicitly: no cookie, no refresh.
      res = await deps.fetchImpl(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return { unavailable: true };
    }
    if (res.status === 401 || res.status === 403) return { invalid: true };
    if (!res.ok) return { unavailable: true };
    let user: unknown;
    try {
      user = await res.json();
    } catch {
      return { unavailable: true };
    }
    // GoTrue accepted this token, so its payload can be read: it must come from a Google sign-in.
    const id = googleIdentity(user, oauthAmrAt(token));
    return id ? { ok: id } : { invalid: true };
  }

  return async function check(token: string | null): Promise<IdentityResult> {
    if (!token) return { invalid: true };
    const peek = peekToken(token);
    if (!peek) return { invalid: true };
    const now = deps.now();
    if (peek.exp * 1000 <= now) return { invalid: true };

    const key = createHash("sha256").update(token).digest("hex");
    const hit = cache.get(key);
    if (hit) {
      if (hit.until > now) return { ok: hit.id };
      cache.delete(key);
    }

    if (peek.iss === FIREBASE_ISSUER) {
      // A Firebase token that fails is refused here, never tried as a Supabase one.
      const r = await deps.checkFirebase(token);
      if (!("ok" in r)) return r;
      const id = phoneIdentity(r.ok);
      if (!id) return { invalid: true };
      remember(key, id, Math.min(r.ok.exp * 1000, now + FIREBASE_CACHE_MS));
      return { ok: id };
    }

    if (deps.supabaseUrl && peek.iss === `${deps.supabaseUrl.replace(/\/+$/, "")}/auth/v1`) {
      const r = await googleUser(token);
      if ("ok" in r) remember(key, r.ok, Math.min(peek.exp * 1000, now + SUPABASE_CACHE_MS));
      return r;
    }

    return { invalid: true };
  };
}

let shared: ReturnType<typeof createIdentityChecker> | null = null;

/** The caller's identity from the request's Bearer token. */
export function identify(req: Request): Promise<IdentityResult> {
  shared ??= createIdentityChecker({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, ""),
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    checkFirebase: checkFirebaseIdToken,
    // Resolved per call, so Next's patched fetch (and a test's) is the one used.
    fetchImpl: (input, init) => fetch(input, init),
    now: Date.now,
  });
  return shared(bearerToken(req));
}
