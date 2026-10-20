import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { LIVE_CODE_RE } from "./types";

/**
 * Live link codes: 8 random base36 characters, then a 4 character tag
 * made from them with the server key (LIVE_WRITE_KEY). Only the server
 * mints codes, so a code whose tag does not match was made up, and the
 * routes and the page refuse it without a cache or database lookup. A
 * guess passes about 1 time in 1.7 million (36^4), so scanning random
 * codes cannot turn into one database read per code. Rotating the key
 * changes every tag, so it ends every existing link.
 * Pure, no "@/" imports, tested in codes.test.ts (npm run test:live).
 */

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function tagOf(random: string, key: string): Buffer {
  const digest = createHmac("sha256", key).update(`live:${random}`).digest();
  // The low digits of the first 8 bytes: as even as base36 gets.
  return Buffer.from(digest.readBigUInt64BE(0).toString(36).padStart(4, "0").slice(-4));
}

/** The 8 random characters followed by their tag. */
export function tagLiveCode(random: string, key: string): string {
  return random + tagOf(random, key).toString();
}

/** A new code. randomInt per character, so no modulo bias. */
export function mintLiveCode(key: string): string {
  if (!key) throw new Error("mintLiveCode: no key");
  let random = "";
  for (let i = 0; i < 8; i++) random += BASE36[randomInt(36)];
  return tagLiveCode(random, key);
}

/** True when the code is well formed and its tag was made with this key. */
export function verifyLiveCode(code: unknown, key: string): boolean {
  if (!key || typeof code !== "string" || !LIVE_CODE_RE.test(code)) return false;
  return timingSafeEqual(Buffer.from(code.slice(8)), tagOf(code.slice(0, 8), key));
}
