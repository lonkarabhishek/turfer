import { playedGames, type GameRow } from "./history";
import { buildPassport, publicPassport, type PublicPassport } from "./passport";
import type { History } from "./server";
import { turfersOf } from "./turfers";

// The public passport of one account, with every read passed in
// (lib/profile/publicProfile.ts wires the real ones), so the tests read
// nothing. Relative imports only (npm run test:profile).

/** What the public passport is read with (the tests pass their own). */
export type PublicPassportDeps = {
  history: (userId: string) => Promise<History>;
  rosters: (games: readonly Pick<GameRow, "id" | "creator_id">[]) => Promise<Map<string, string[]>>;
  now: () => number;
};

/**
 * One account's public passport: publicPassport of its history, with its
 * Turfers (how many different players they have played with: the same
 * count, from the same rosters, as the Me tab's and the home tile's,
 * lib/profile/turfers.ts). The rosters are read only for someone with a
 * played game, and only to count: no name or id of anyone leaves here. A
 * failed rosters read leaves the count out (null) and the rest stands; a
 * failed history read throws.
 */
export async function publicPassportOf(userId: string, deps: PublicPassportDeps): Promise<PublicPassport> {
  const now = deps.now();
  const history = await deps.history(userId);
  const passport = buildPassport({ userId, ...history, since: null, now });
  const played = playedGames(userId, history.games, now);
  let turfers: number | null = 0;
  if (played.length > 0) {
    const byId = new Map(history.games.map((g) => [g.id, g]));
    turfers = await deps
      .rosters(played.map((g) => byId.get(g.id) as GameRow))
      .then((rosters) => turfersOf(userId, played, rosters))
      .catch(() => null);
  }
  return publicPassport(passport, turfers);
}
