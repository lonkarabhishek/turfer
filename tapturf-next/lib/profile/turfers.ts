import type { PlayedGame } from "./history";
import { coPlayers } from "./playedWith";

/**
 * Turfers (the site owner, 20 Nov 2026: "show how many people the user has
 * played with like followers on Instagram. Say Turfers"): how many
 * different TapTurf players someone has played a game with. One number
 * and one word wherever it shows: the top of a public profile
 * (/u/<username>), the Me card and the Played with heading on the Me tab,
 * the signed-in home's tile, the medals' story picture.
 *
 * It is the count of coPlayers (lib/profile/playedWith.ts): everyone who
 * was in a game this person played (its players and its host), each
 * counted once, themselves left out. Only a number is ever public: never
 * who, and no list (the list is the Me tab's Played with, for its owner
 * alone). Pure. Relative imports only (npm run test:profile).
 */
export function turfersOf(userId: string, played: readonly PlayedGame[], rosters: ReadonlyMap<string, readonly string[]>): number {
  return coPlayers(userId, played, rosters).length;
}

/** "Turfer" for one, "Turfers" for any other number. */
export function turfersWord(n: number): string {
  return n === 1 ? "Turfer" : "Turfers";
}

/** "34 Turfers". */
export function turfersCount(n: number): string {
  return `${n} ${turfersWord(n)}`;
}

/**
 * What the word means, for a screen reader and as a tooltip: "Turfers:
 * people Asha has played with on TapTurf"; with no name, the player's own
 * view: "Turfers: people you have played with on TapTurf".
 */
export function turfersMeaning(firstName?: string | null): string {
  const who = firstName?.trim();
  return who ? `Turfers: people ${who} has played with on TapTurf` : "Turfers: people you have played with on TapTurf";
}
