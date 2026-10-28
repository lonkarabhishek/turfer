import { unstable_cache } from "next/cache";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/queries/turfs";
import { TURF_FACT_COLUMNS, turfFactsFrom, type TurfFactRow, type TurfFacts } from "@/lib/seo/turfFacts";

async function readTurfFacts(): Promise<TurfFacts> {
  const supabase = createReadOnlyClient();
  const rows = await fetchAllRows<TurfFactRow>((from, to) =>
    supabase.from("turfs").select(TURF_FACT_COLUMNS).eq("is_active", true).order("id").range(from, to) as unknown as PromiseLike<{
      data: TurfFactRow[] | null;
      error: unknown;
    }>,
  );
  return turfFactsFrom(rows);
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
 * copy, or null: the snippets then promise only what the list rows show
 * (no "Call or WhatsApp", timings from start/end only), and the turf
 * title keeps its usual order. Never throws: a snippet is not worth a
 * failed page.
 */
const getTurfFactsCached = unstable_cache(readTurfFacts, ["turf-facts-v1"], { revalidate: 86400 });
const MEMO_MS = 3_600_000;
let memo: { at: number; facts: TurfFacts } | null = null;
let pending: Promise<TurfFacts | null> | null = null;
let failLoggedAt = -Infinity;

export function getTurfFacts(): Promise<TurfFacts | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return Promise.resolve(memo.facts);
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
