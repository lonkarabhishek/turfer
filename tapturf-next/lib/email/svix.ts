import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend's webhooks are signed the Svix way: headers svix-id,
 * svix-timestamp (seconds) and svix-signature ("v1,<base64>", several
 * separated by spaces while a secret rotates); the signature is
 * HMAC-SHA256 of "<id>.<timestamp>.<body>" with the secret (whsec_ and
 * base64). A timestamp more than 5 minutes off is refused, so an old
 * delivery can't be replayed. Relative imports only (npm run test:email).
 */

export const TOLERANCE_S = 5 * 60;

/** The secret's key bytes, or null when it is not a Svix secret. */
export function svixKey(secret: string | null | undefined): Buffer | null {
  const s = (secret ?? "").trim();
  const raw = s.startsWith("whsec_") ? s.slice(6) : s;
  if (!/^[A-Za-z0-9+/]{16,}={0,2}$/.test(raw)) return null;
  const key = Buffer.from(raw, "base64");
  return key.length >= 16 ? key : null;
}

/** The signature header value for a body (for the tests and the stand-in). */
export function svixSign(key: Buffer, id: string, timestamp: number, body: string): string {
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

/** Whether a delivery is Resend's: a known id and timestamp, a fresh timestamp, and one of the signatures ours. */
export function svixVerify(
  key: Buffer,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowS: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || id.length > 200 || signature.length > 2000 || !/^\d{1,12}$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (Math.abs(nowS - ts) > TOLERANCE_S) return false;
  const want = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return signature.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    if (v !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === want.length && timingSafeEqual(got, want);
  });
}
