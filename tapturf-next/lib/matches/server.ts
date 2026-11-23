import { unstable_cache } from "next/cache";
import { accountRpcIfThere } from "../account/server";
import { liveWriteKey, toLiveRow } from "../live/server";
import { createReadOnlyClient } from "../supabase/server";
import { matchLine, type MatchLine } from "./line";
import { orderLinks, toMineLinks, type MineLink } from "./links";

/**
 * Server side of "My live matches" (GET /api/live/mine): the verified
 * caller's own live links from public.live_links_mine
 * (supabase/migrations/20261124_live_mine.sql, the account key), then the
 * score line of the first few, worked out from the read followers share
 * (public.live_match_get_k). Only the line and the two sides' current
 * names leave here, never the match. Never throws.
 */

/** Score lines are worked out for this many (live ones first, then the latest); the rest say who played and when. */
export const LINES_MAX = 12;
/** A link's line is kept this long per last update: a finished match is read once a day at most, however often the tab is opened. */
const LINE_KEPT_S = 86_400;

/** A database without the function (before the migration) is asked again only after this long, per instance. */
const MISSING_FOR_MS = 60_000;
let missingUntil = 0;

/** One link's line as of its last update. Throws when the match can't be read, so nothing is kept for it. */
function lineAt(code: string, updatedAt: string): Promise<MatchLine | null> {
  return unstable_cache(
    async () => {
      const key = liveWriteKey();
      if (!key) throw new Error("no live key");
      const { data, error } = await createReadOnlyClient().rpc("live_match_get_k", { p_key: key, p_code: code });
      if (error) throw new Error(error.message);
      return data == null ? null : matchLine(toLiveRow(data).match);
    },
    // Its last update is part of the key: a new ball is a new entry, and a finished match's never changes.
    ["live-mine-line", code, updatedAt],
    { revalidate: LINE_KEPT_S },
  )();
}

/**
 * The account's live links that still show a score, live ones first, each
 * with its score line where one could be worked out; null when they can't
 * be read (before the migration too: the tab then shows no list from the
 * server and nothing fails).
 */
export async function myLiveLinks(userId: string, now = Date.now()): Promise<MineLink[] | null> {
  if (now < missingUntil) return null;
  const res = await accountRpcIfThere("live_links_mine", { p_user_id: userId });
  if ("missing" in res) {
    missingUntil = now + MISSING_FOR_MS;
    return null;
  }
  if ("unavailable" in res || res.data.r !== "ok") return null;
  const list = orderLinks(toMineLinks(res.data), now);
  const lines = await Promise.all(list.slice(0, LINES_MAX).map((l) => lineAt(l.code, l.updatedAt).catch(() => null)));
  return list.map((l, i) => {
    const x = lines[i];
    return x ? { ...l, line: x.line || null, teamA: x.teamA || l.teamA, teamB: x.teamB || l.teamB } : l;
  });
}
