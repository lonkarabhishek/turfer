import { createHmac, timingSafeEqual } from "node:crypto";
import type { OffGroup } from "./types";

/**
 * The "Turn off these emails" link's token: one account and one group,
 * signed with a key made from ACCOUNT_KEY (so no new secret to set), never
 * the account's address. It has no expiry: an old email's link keeps
 * working, and it can only turn emails off. Relative imports only (npm run
 * test:email).
 *
 *   <22 characters: the account id (16 bytes) and the group (1 byte), base64url>.<22: the signature>
 */

const GROUP_BYTE: Record<OffGroup, number> = { requests: 1, changes: 2, reminders: 3, all: 4 };
const BYTE_GROUP = new Map(Object.entries(GROUP_BYTE).map(([g, b]) => [b, g as OffGroup]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The signing key, made from ACCOUNT_KEY for this one use. */
export function offKey(accountKey: string): Buffer {
  return createHmac("sha256", accountKey).update("tapturf email off v1").digest();
}

const sign = (key: Buffer, payload: Buffer) => createHmac("sha256", key).update(payload).digest().subarray(0, 16);

/** The token for an account and a group. */
export function offToken(key: Buffer, userId: string, group: OffGroup): string {
  if (!UUID.test(userId)) throw new Error("not an account id");
  const payload = Buffer.concat([Buffer.from(userId.replace(/-/g, ""), "hex"), Buffer.from([GROUP_BYTE[group]])]);
  return `${payload.toString("base64url")}.${sign(key, payload).toString("base64url")}`;
}

/** The account and group a token names, or null when it is not one we signed. */
export function readOffToken(key: Buffer, token: unknown): { userId: string; group: OffGroup } | null {
  if (typeof token !== "string" || token.length > 80) return null;
  const m = /^([A-Za-z0-9_-]{23})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!m) return null;
  const payload = Buffer.from(m[1], "base64url");
  const sig = Buffer.from(m[2], "base64url");
  if (payload.length !== 17 || sig.length !== 16) return null;
  if (!timingSafeEqual(sig, sign(key, payload))) return null;
  const group = BYTE_GROUP.get(payload[16]);
  if (!group) return null;
  const hex = payload.subarray(0, 16).toString("hex");
  return { userId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`, group };
}
