import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { TOURNAMENT_CODE_RE } from "./types";

/**
 * Tournament codes: 8 random base36 characters, then a 4 character tag
 * made from them with the server key (LIVE_WRITE_KEY), as live scorecard
 * codes are (lib/live/codes.ts) but tagged for tournaments, so a live
 * link's code is never a tournament's. Only the server mints them, so a
 * code whose tag does not match was made up and is refused without a
 * cache or database lookup (a guess passes about 1 in 1.7 million).
 * Rotating the key changes every tag, so it ends every tournament link too.
 * Server only (node:crypto); tested in codes.test.ts (npm run test:tournament).
 */

const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function tagOf(random: string, key: string): Buffer {
  const digest = createHmac("sha256", key).update(`tournament:${random}`).digest();
  return Buffer.from(digest.readBigUInt64BE(0).toString(36).padStart(4, "0").slice(-4));
}

/** A new code. randomInt per character, so no modulo bias. */
export function mintTournamentCode(key: string): string {
  if (!key) throw new Error("mintTournamentCode: no key");
  let random = "";
  for (let i = 0; i < 8; i++) random += BASE36[randomInt(36)];
  return random + tagOf(random, key).toString();
}

/** True when the code is well formed and its tag was made with this key. */
export function verifyTournamentCode(code: unknown, key: string | null): boolean {
  if (!key || typeof code !== "string" || !TOURNAMENT_CODE_RE.test(code)) return false;
  return timingSafeEqual(Buffer.from(code.slice(8)), tagOf(code.slice(0, 8), key));
}

/**
 * A game's own tournament code, worked out from the game's id: the low 8
 * base36 digits of an HMAC of the id, then the usual tag. The same game
 * always gets the same code, so its page finds its turf session's live
 * link with no stored link (lib/turfSession), and it verifies like any
 * minted code. One per game: the code is the tournament's primary key.
 */
export function gameTournamentCode(gameId: string, key: string): string {
  if (!key) throw new Error("gameTournamentCode: no key");
  const digest = createHmac("sha256", key).update(`game-session:${gameId.toLowerCase()}`).digest();
  const random = digest.readBigUInt64BE(0).toString(36).padStart(8, "0").slice(-8);
  return random + tagOf(random, key).toString();
}
