import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { forCard } from "@/lib/utils/cardTurf";
import { toAskTurf } from "@/lib/ask/project";
import type { Turf } from "@/types/turf";

/**
 * Every active turf, cut down to what one API needs, for routes that
 * scan the whole list (Ask TapTurf, game drafts, near me).
 *
 * The rows come from the cached turf pieces in lib/queries/turfs.ts and
 * a warm function instance keeps the projected list in memory for a
 * minute, so a turf edit shows within about a minute everywhere.
 *
 * These used to be cached pieces of their own (ask-turfs-v1,
 * near-turfs-v1) built from getAllActiveTurfs(). Next skips the cache
 * read for an unstable_cache called inside another one
 * (unstable-cache.js, isNestedUnstableCache), so every refill of those
 * pieces read the whole turf table from the database instead of the
 * cached rows: on 20 Oct, two extra full reads per purge per instance.
 */

const MEMO_MS = 60_000;

function memoTurfList(name: string, project: (t: Turf) => Turf): () => Promise<Turf[]> {
  let memo: { readAt: number; turfs: Turf[] } | null = null;
  // Callers that arrive while the list is being built share that build.
  let pending: Promise<Turf[]> | null = null;
  return () => {
    if (memo && Date.now() - memo.readAt < MEMO_MS) return Promise.resolve(memo.turfs);
    pending ??= getAllActiveTurfs()
      .then((all) => {
        memo = { readAt: Date.now(), turfs: all.map(project) };
        return memo.turfs;
      })
      .catch((e) => {
        // A stale list beats a failed answer.
        if (!memo) throw e;
        console.error(`${name}: refresh failed, serving the last list`, e);
        return memo.turfs;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

/** Ask TapTurf and game drafts: toAskTurf rows, about 0.75 KB each. */
export const getAskTurfs = memoTurfList("ask-turfs", toAskTurf);

/** /api/turfs/near: forCard rows (up to four photos for the card carousel), about 1.4 KB each. */
export const getNearTurfs = memoTurfList("near-turfs", forCard);
