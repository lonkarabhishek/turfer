import { createPublicKey, createVerify } from "node:crypto";

// Verifies a Firebase Auth ID token without firebase-admin: the token is
// an RS256 JWT signed by Google, checked against Google's published
// certs. No secret involved, so nothing to configure on Vercel.
// https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "tapturf";
const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export type FirebaseIdClaims = {
  sub: string;
  phone_number?: string;
  email?: string;
  exp: number;
};

async function googleCerts(): Promise<Record<string, string>> {
  // Google rotates these every few hours and sends max-age ~6h.
  const res = await fetch(CERTS_URL, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`certs ${res.status}`);
  return (await res.json()) as Record<string, string>;
}

function b64urlJson(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

/** Returns the token's claims, or null if it is not a valid, current token for this project. */
export async function verifyFirebaseIdToken(token: string | undefined | null): Promise<FirebaseIdClaims | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = b64urlJson(parts[0]);
    const payload = b64urlJson(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

    const cert = (await googleCerts())[header.kid];
    if (!cert) return null;
    const ok = createVerify("RSA-SHA256")
      .update(`${parts[0]}.${parts[1]}`)
      .verify(createPublicKey(cert), Buffer.from(parts[2], "base64url"));
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    const skew = 60;
    if (payload.aud !== PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    if (typeof payload.exp !== "number" || payload.exp < now - skew) return null;
    if (typeof payload.iat !== "number" || payload.iat > now + skew) return null;
    if (typeof payload.auth_time === "number" && payload.auth_time > now + skew) return null;

    return {
      sub: payload.sub,
      exp: payload.exp,
      phone_number: typeof payload.phone_number === "string" ? payload.phone_number : undefined,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
  } catch {
    return null;
  }
}
