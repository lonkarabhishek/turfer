import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { LIVE_CODE_RE } from "./types";

/**
 * Live link codes: 8 random base36 characters, then a 4 character tag
 * made from them with the server key (LIVE_WRITE_KEY). Only the server
 * mints codes, so a code whose tag does not match was made up, and the
 * routes and the page refuse it without a cache or database lookup. A
 * guess passes about 2 times in 1.7 million (two tags of 36^4 each), so
 * scanning random codes cannot turn into one database read per code.
 * Rotating the key changes every tag, so it ends every existing link.
 *
 * Two generations of tag. Codes minted since live links need a sign-in
 * the server checks (lib/live/gate.ts) carry the second; a code with the
 * first was minted before that, so its link may have no checked sign-in
 * behind it (the gate's legacy grace). Both verify, so every link ever
 * shared keeps working for followers.
 * Pure, no "@/" imports, tested in codes.test.ts (npm run test:live).
 */

/** 1: minted before live links needed a checked sign-in; 2: since. */
export type LiveCodeGen = 1 | 2;

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function tagOf(random: string, key: string, gen: LiveCodeGen): Buffer {
  const digest = createHmac("sha256", key).update(gen === 1 ? `live:${random}` : `live2:${random}`).digest();
  // The low digits of the first 8 bytes: as even as base36 gets.
  return Buffer.from(digest.readBigUInt64BE(0).toString(36).padStart(4, "0").slice(-4));
}

/** The 8 random characters followed by their tag (this generation's unless asked). */
export function tagLiveCode(random: string, key: string, gen: LiveCodeGen = 2): string {
  return random + tagOf(random, key, gen).toString();
}

/** A new code. randomInt per character, so no modulo bias. */
export function mintLiveCode(key: string): string {
  if (!key) throw new Error("mintLiveCode: no key");
  let random = "";
  for (let i = 0; i < 8; i++) random += BASE36[randomInt(36)];
  return tagLiveCode(random, key);
}

/**
 * The generation of a well formed code whose tag was made with this key,
 * else null. The second is tried first, so a code that fits both (about
 * 1 in 1.7 million) counts as new and needs the sign-in.
 */
export function liveCodeGen(code: unknown, key: string): LiveCodeGen | null {
  if (!key || typeof code !== "string" || !LIVE_CODE_RE.test(code)) return null;
  const tag = Buffer.from(code.slice(8));
  for (const gen of [2, 1] as const) {
    if (timingSafeEqual(tag, tagOf(code.slice(0, 8), key, gen))) return gen;
  }
  return null;
}

/** True when the code is well formed and its tag, of either generation, was made with this key. */
export function verifyLiveCode(code: unknown, key: string): boolean {
  return liveCodeGen(code, key) !== null;
}
