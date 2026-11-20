import { createClient } from "@/lib/supabase/client";
import { NO_BADGES, badgeIds, badgeKey, parseBadges, type PlayerBadges } from "@/lib/profile/playerBadge";

// The medal on each of these players' photos (lib/profile/playerBadge.ts),
// read by the browser in one call: public.player_badges_for answers only
// for people with a public profile, and asks that switch again each time,
// so a player who turns "Let others find and tag me" off loses the badge
// on the next read. Never an error to the page: a failed read, or a
// database from before 20261121_player_badges.sql, is simply no badges.

/** How long one answer is used again for the same set of people in this tab. */
const KEEP_MS = 60_000;

let last: { key: string; at: number; badges: Promise<PlayerBadges> } | null = null;
// The database has no such function (before the file): not asked again in this tab.
let missing = false;

async function read(ids: string[]): Promise<PlayerBadges> {
  try {
    const { data, error } = await createClient().rpc("player_badges_for", { p_ids: ids });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") missing = true;
      return NO_BADGES;
    }
    return parseBadges(data);
  } catch {
    return NO_BADGES;
  }
}

/** Badges by account id for these people (the first 60 asked about). Never throws. */
export function getPlayerBadges(ids: readonly (string | null | undefined)[]): Promise<PlayerBadges> {
  const list = badgeIds(ids);
  if (missing || list.length === 0) return Promise.resolve(NO_BADGES);
  const key = badgeKey(list);
  const now = Date.now();
  if (last && last.key === key && now - last.at < KEEP_MS) return last.badges;
  const badges = read(list);
  last = { key, at: now, badges };
  // A failed read is not kept: the next ask tries again.
  void badges.then((b) => {
    if (b === NO_BADGES && last?.badges === badges) last = null;
  });
  return badges;
}
