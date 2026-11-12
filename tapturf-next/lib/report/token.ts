import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The owner report link's token (/report/<token>): a version byte and one
 * turf's id, signed with a key made from ACCOUNT_KEY for this one use (so
 * no new secret to set), as the "Turn off these emails" link is
 * (lib/email/token.ts). It has no expiry: a link sent on WhatsApp keeps
 * working, and it only ever shows that turf's counts. Lower-case hex, so a
 * chat app's link detection never cuts a "-" or "_" off its end. Relative
 * imports only (npm run test:outreach).
 *
 *   <34 hex: the version (1 byte) and the turf id (16 bytes)><32 hex: the signature>
 */

export const REPORT_TOKEN_VERSION = 1;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signing key, made from ACCOUNT_KEY for this one use. */
export function reportKey(accountKey: string): Buffer {
  return createHmac("sha256", accountKey).update("tapturf owner report v1").digest();
}

const sign = (key: Buffer, payload: Buffer) => createHmac("sha256", key).update(payload).digest().subarray(0, 16);

/** The token for a turf. */
export function reportToken(key: Buffer, turfId: string): string {
  if (!UUID.test(turfId)) throw new Error("not a turf id");
  const payload = Buffer.concat([Buffer.from([REPORT_TOKEN_VERSION]), Buffer.from(turfId.replace(/-/g, ""), "hex")]);
  return payload.toString("hex") + sign(key, payload).toString("hex");
}

/** The turf a token names, or null when it is not one we signed. */
export function readReportToken(key: Buffer, token: unknown): { turfId: string } | null {
  if (typeof token !== "string" || !/^[0-9a-f]{66}$/.test(token)) return null;
  const payload = Buffer.from(token.slice(0, 34), "hex");
  const sig = Buffer.from(token.slice(34), "hex");
  if (payload.length !== 17 || sig.length !== 16) return null;
  if (!timingSafeEqual(sig, sign(key, payload))) return null;
  if (payload[0] !== REPORT_TOKEN_VERSION) return null;
  const hex = payload.subarray(1).toString("hex");
  return { turfId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` };
}

/** The report's address for a turf. */
export function reportUrl(key: Buffer, turfId: string, site = "https://www.tapturf.in"): string {
  return `${site}/report/${reportToken(key, turfId)}`;
}
