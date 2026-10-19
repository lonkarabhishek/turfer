import { unstable_cache } from "next/cache";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { forCard } from "@/lib/utils/cardTurf";
import { mergeShards, shardOf, toAskTurf } from "@/lib/ask/project";
import type { Turf } from "@/types/turf";

/**
 * Every active turf, cut down to what one API needs, for routes that
 * scan the whole list (Ask TapTurf, game drafts, near me).
 *
 * unstable_cache(() => getAllActiveTurfs()) stored 8.5 MB, and Vercel's
 * data cache refuses anything over 2 MB, so each call fetched all
 * turfs from Supabase again (3 pages, slower as the table grows). Here
 * the projected rows are split by id into pieces of a few hundred KB,
 * each cached on its own (10 minutes, tagged "turf-data" so the turf
 * webhook refreshes them), and a warm function instance keeps the
 * merged list in memory for a minute, so a webhook edit shows within
 * about a minute everywhere.
 */

const FRESH_MS = 600_000;
const MEMO_MS = 60_000;

// Pieces that miss together share one read of the turfs table while it
// is in flight (never a finished one: that could be older than a turf
// edit the webhook just expired the cache for).
let inflight: Promise<Turf[]> | null = null;
function allRows(): Promise<Turf[]> {
  inflight ??= getAllActiveTurfs().finally(() => {
    inflight = null;
  });
  return inflight;
}

type Piece = { at: number; turfs: Turf[] };

function cachedTurfList(key: string, shards: number, project: (t: Turf) => Turf): () => Promise<Turf[]> {
  const pieces = Array.from({ length: shards }, (_, i) =>
    unstable_cache(
      async (): Promise<Piece> => ({ at: Date.now(), turfs: (await allRows()).filter((t) => shardOf(t.id, shards) === i).map(project) }),
      [key, String(i)],
      { revalidate: FRESH_MS / 1000, tags: ["turf-data"] },
    ),
  );
  let memo: (Piece & { readAt: number }) | null = null;
  let pending: Promise<Turf[]> | null = null;
  return () => {
    // Read from the cache less than a minute ago (the webhook only
    // expires the cache, not this memory), and built from the database
    // less than 10 minutes ago.
    const now = Date.now();
    if (memo && now - memo.readAt < MEMO_MS && now - memo.at < FRESH_MS) return Promise.resolve(memo.turfs);
    pending ??= Promise.all(pieces.map((p) => p()))
      .then((parts) => {
        memo = { at: Math.min(...parts.map((p) => p.at)), readAt: Date.now(), turfs: mergeShards(parts.map((p) => p.turfs)) };
        return memo.turfs;
      })
      .catch((e) => {
        // A stale list beats a failed answer.
        if (!memo) throw e;
        console.error(`${key}: refresh failed, serving the last list`, e);
        return memo.turfs;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
}

// Bump the key version when a projection changes shape.

/** Ask TapTurf and game drafts: toAskTurf rows, about 0.75 KB each, 8 pieces. */
export const getAskTurfs = cachedTurfList("ask-turfs-v1", 8, toAskTurf);

/** /api/turfs/near: forCard rows (up to four photos for the card carousel), about 1.4 KB each, 12 pieces. */
export const getNearTurfs = cachedTurfList("near-turfs-v1", 12, forCard);
