import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { turfFactsFrom, type TurfFacts } from "@/lib/seo/turfFacts";
import { readTurfFactRows } from "@/lib/build/reads";
import { buildData, isFailed } from "@/lib/build/data";
import { needForPage } from "@/lib/queries/turfs";

// While building: the facts the build-data step made from the same read,
// or its note that the read failed (a failed read here, no read of our own).
async function readTurfFacts(): Promise<TurfFacts> {
  const built = buildData("turf-facts");
  if (isFailed(built)) throw new Error("the build-data step could not read them");
  return built ?? turfFactsFrom(await readTurfFactRows(createReadOnlyClient()));
}

/**
 * Which active turfs can be called or WhatsApped and show timings, and
 * which names two turfs in one city share (lib/seo/turfFacts.ts), for
 * the city and city+sport snippets and the turf titles. One paged read
 * of every active turf; only ids and keys are kept, never a number.
 *
 * Cached for a day and untagged, like getFooterCities: no page gains a
 * tag or a shorter revalidate (turf pages keep their day), and a snippet
 * a day behind a new phone number is fine. A regeneration skips the
 * data cache, so a warm instance also keeps it in memory for an hour,
 * and concurrent renders share one read. A failed read gives the last
 * copy (they are ids and flags, no price or hour, so a day-old copy is
 * fine). With none at all the page throws Unavailable (needForPage): its
 * title and description would promise less than the page that is cached
 * (no "Call or WhatsApp", no shared-name city), so a regeneration keeps
 * the last good page and a first render answers 503 with Retry-After.
 * While `next build` prerenders, null as before: the snippets then
 * promise only what the list rows show, as the build-data step decided.
 * Only pages call this.
 */
const getTurfFactsCached = unstable_cache(readTurfFacts, ["turf-facts-v1"], { revalidate: 86400 });
const MEMO_MS = 3_600_000;
let memo: { at: number; facts: TurfFacts } | null = null;
let pending: Promise<TurfFacts | null> | null = null;
let failLoggedAt = -Infinity;

export function getTurfFacts(): Promise<TurfFacts | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return Promise.resolve(memo.facts);
  // In each caller's own render: no facts at all fails the render (not while building).
  return readShared().then((facts) => needForPage(facts, "turf facts"));
}

function readShared(): Promise<TurfFacts | null> {
  pending ??= getTurfFactsCached()
    .then((facts) => {
      memo = { at: Date.now(), facts };
      return facts;
    })
    .catch((e) => {
      if (Date.now() - failLoggedAt >= 30_000) {
        failLoggedAt = Date.now();
        console.warn("getTurfFacts: read failed", e instanceof Error ? e.message : e);
      }
      return memo?.facts ?? null;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** sharedNames as a set, built once per copy of the facts. */
const sharedSets = new WeakMap<TurfFacts, ReadonlySet<string>>();
export function sharedNameSet(facts: TurfFacts | null): ReadonlySet<string> {
  if (!facts) return new Set();
  let s = sharedSets.get(facts);
  if (!s) sharedSets.set(facts, (s = new Set(facts.sharedNames)));
  return s;
}
