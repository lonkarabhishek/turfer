import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { readGroundPeers } from "@/lib/build/reads";
import { buildData, isFailed } from "@/lib/build/data";
import { peersFrom, type PeerTurf } from "@/lib/turfSize/benchmark";

// While building: the peers the build-data step read (production builds),
// or its note that the read failed (a failed read here, no read of our own).
async function readPeers(): Promise<PeerTurf[]> {
  const built = buildData("ground-peers");
  if (isFailed(built)) throw new Error("the build-data step could not read them");
  return peersFrom(built ?? (await readGroundPeers(createReadOnlyClient())));
}

/**
 * Every active turf's owner ground sizes, numbers only, for the Ground
 * size card's "longer than 72% of turfs in Nashik" lines
 * (lib/turfSize/benchmark.ts). Read only by a turf page whose turf has
 * sizes. Cached for a day and untagged, like getTurfFacts: no page gains a
 * tag or a shorter revalidate (turf pages keep their day), and a benchmark
 * a day behind another turf's new sizes is fine. A warm instance keeps it
 * in memory for an hour too, and concurrent renders share one read. A
 * failed read gives the last copy, or none: the card then shows the size
 * words without percentiles. Never throws.
 */
const getPeersCached = unstable_cache(readPeers, ["ground-peers-v1"], { revalidate: 86400 });
const MEMO_MS = 3_600_000;
let memo: { at: number; peers: PeerTurf[] } | null = null;
let pending: Promise<PeerTurf[]> | null = null;
let failLoggedAt = -Infinity;

export function getGroundPeers(): Promise<PeerTurf[]> {
  if (memo && Date.now() - memo.at < MEMO_MS) return Promise.resolve(memo.peers);
  pending ??= getPeersCached()
    .then((peers) => {
      memo = { at: Date.now(), peers };
      return peers;
    })
    .catch((e) => {
      if (Date.now() - failLoggedAt >= 30_000) {
        failLoggedAt = Date.now();
        console.warn("getGroundPeers: read failed", e instanceof Error ? e.message : e);
      }
      return memo?.peers ?? [];
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
