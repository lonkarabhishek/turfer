import { createPublicKey, createVerify } from "node:crypto";

// Verifies a Firebase Auth ID token without firebase-admin: the token is
// an RS256 JWT signed by Google, checked against Google's published
// certs. No secret involved, so nothing to configure on Vercel.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tapturf";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export const FIREBASE_ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

export type FirebaseIdClaims = {
  sub: string;
  phone_number?: string;
  email?: string;
  exp: number;
};

/**
 * Where the certs come from. End-to-end tests point FIREBASE_CERTS_URL at
 * a local mock; that is honoured only off Vercel and only for a local
 * host, so a value copied into a Vercel environment can never let a
 * stranger's key sign tokens.
 */
export function certsUrl(env: Record<string, string | undefined> = process.env): string {
  const test = env.FIREBASE_CERTS_URL;
  if (!test) return GOOGLE_CERTS_URL;
  let host = "";
  try {
    host = new URL(test).hostname;
  } catch {
    /* not a URL */
  }
  if (env.VERCEL || (host !== "127.0.0.1" && host !== "localhost")) {
    console.error("FIREBASE_CERTS_URL is ignored here: only for local tests, never on Vercel");
    return GOOGLE_CERTS_URL;
  }
  return test;
}

async function googleCerts(fresh = false): Promise<Record<string, string>> {
  // Google rotates these every few hours and sends max-age ~6h. A fresh
  // read is for a kid the cached set does not have yet.
  // `next` is Next's extension of fetch; typed here so the unit test compiles without Next's types.
  const init: RequestInit & { next?: { revalidate: number } } = fresh ? { cache: "no-store" } : { next: { revalidate: 3600 } };
  const res = await fetch(certsUrl(), init);
  if (!res.ok) throw new Error(`certs ${res.status}`);
  return (await res.json()) as Record<string, string>;
}

function b64urlJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/**
 * The token's claims, or why not: 'invalid' (not a valid, current token
 * for this project: sign in again) or 'unavailable' (the certs could not
 * be read: try later, never treat it as signed out).
 */
export async function checkFirebaseIdToken(
  token: string | undefined | null,
): Promise<{ ok: FirebaseIdClaims } | { invalid: true } | { unavailable: true }> {
  if (!token) return { invalid: true };
  const parts = token.split(".");
  if (parts.length !== 3) return { invalid: true };
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    return { invalid: true };
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return { invalid: true };

  let cert: string | undefined;
  try {
    cert = (await googleCerts())[header.kid];
    if (!cert) cert = (await googleCerts(true))[header.kid];
  } catch {
    return { unavailable: true };
  }
  if (!cert) return { invalid: true };

  try {
    const ok = createVerify("RSA-SHA256")
      .update(`${parts[0]}.${parts[1]}`)
      .verify(createPublicKey(cert), Buffer.from(parts[2], "base64url"));
    if (!ok) return { invalid: true };
  } catch {
    return { invalid: true };
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = 60;
  if (payload.aud !== PROJECT_ID) return { invalid: true };
  if (payload.iss !== FIREBASE_ISSUER) return { invalid: true };
  if (typeof payload.sub !== "string" || !payload.sub) return { invalid: true };
  if (typeof payload.exp !== "number" || payload.exp < now - skew) return { invalid: true };
  if (typeof payload.iat !== "number" || payload.iat > now + skew) return { invalid: true };
  if (typeof payload.auth_time === "number" && payload.auth_time > now + skew) return { invalid: true };

  return {
    ok: {
      sub: payload.sub,
      exp: payload.exp,
      phone_number: typeof payload.phone_number === "string" ? payload.phone_number : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    },
  };
}

/** Returns the token's claims, or null if it is not a valid, current token for this project (or cannot be checked now). */
export async function verifyFirebaseIdToken(token: string | undefined | null): Promise<FirebaseIdClaims | null> {
  const r = await checkFirebaseIdToken(token);
  return "ok" in r ? r.ok : null;
}
