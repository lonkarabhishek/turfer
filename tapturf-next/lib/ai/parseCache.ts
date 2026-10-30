import { unstable_cache } from "next/cache";
import { randomUUID } from "node:crypto";
import { AskFilters, ROUTER_VERSION, newUsage, parseAsk, readingSchema, type AskContext, type AskReading, type AskUsage } from "./ask";
import type { RouterVersion } from "./routerVersion";

/**
 * Claude's reading of a fresh question (no conversation before it),
 * kept in Next's data cache, so the same question again, from anyone,
 * is answered without a model call. Keyed by the question in lower case
 * plus the page they are on, which is all the router sees. Only the
 * reading is cached: turfs and games are still found in the live rows
 * on every ask.
 *
 * Readings do not age (time and when are relative), so there is no
 * timed refresh: that would re-ask Claude in the background, where no
 * request logs the tokens. A failed or declined reading is never cached
 * (the cached function throws). Clear everything with
 * revalidateTag("ask-parse"), or bump ROUTER_VERSION in ask.ts when the
 * prompt changes. Router v10's readings (lib/ai/routerVersion.ts) are
 * kept apart, under ask-parse-v10; v9's keys are as they were.
 */

export class Declined extends Error {
  constructor(readonly usage: AskUsage) {
    super("ask: the model declined or returned nothing usable");
  }
}

/** "Box cricket near me tonight?" and "box cricket  near me tonight" are one question. */
export const questionKey = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim().replace(/[\s?!.]+$/, "");

type Reading = { filters: AskReading; usage: AskUsage; run: string };

/**
 * The cached reading, or a new one from Claude. `usage` is set only
 * when this call paid for it. Throws Declined, or the API error.
 */
export async function parseFresh(
  q: string,
  areasByCity: Record<string, string[]>,
  ctx: AskContext,
  version: RouterVersion = ROUTER_VERSION,
): Promise<{ filters: AskReading; usage: AskUsage | null; cached: boolean }> {
  if (version === 10) return parseFreshV10(q, areasByCity, ctx);
  // Tells this request's own call apart from a reading another request stored.
  const run = randomUUID();
  const read = unstable_cache(
    async (): Promise<Reading> => {
      const usage = newUsage();
      const parsed = await parseAsk(q, areasByCity, [], ctx, usage);
      if (!parsed) throw new Declined(usage);
      return { filters: parsed.filters, usage, run };
    },
    [`ask-parse-v${ROUTER_VERSION}`, questionKey(q), ctx.turf ?? "", ctx.city ?? ""],
    { revalidate: false, tags: ["ask-parse"] },
  );
  const got = await read();
  const ok = AskFilters.safeParse(got.filters);
  if (ok.success) return { filters: ok.data, usage: got.run === run ? got.usage : null, cached: got.run !== run };
  // A reading stored under an older schema: ask again, uncached.
  const usage = newUsage();
  const parsed = await parseAsk(q, areasByCity, [], ctx, usage);
  if (!parsed) throw new Declined(usage);
  return { filters: parsed.filters, usage, cached: false };
}

/** parseFresh for router v10: its own entries (ask-parse-v10), schema and prompt; v9's above are as they were. */
async function parseFreshV10(
  q: string,
  areasByCity: Record<string, string[]>,
  ctx: AskContext,
): Promise<{ filters: AskReading; usage: AskUsage | null; cached: boolean }> {
  const run = randomUUID();
  const read = unstable_cache(
    async (): Promise<Reading> => {
      const usage = newUsage();
      const parsed = await parseAsk(q, areasByCity, [], ctx, usage, 10);
      if (!parsed) throw new Declined(usage);
      return { filters: parsed.filters, usage, run };
    },
    ["ask-parse-v10", questionKey(q), ctx.turf ?? "", ctx.city ?? ""],
    { revalidate: false, tags: ["ask-parse"] },
  );
  const got = await read();
  const ok = readingSchema(10).safeParse(got.filters);
  if (ok.success) return { filters: ok.data, usage: got.run === run ? got.usage : null, cached: got.run !== run };
  const usage = newUsage();
  const parsed = await parseAsk(q, areasByCity, [], ctx, usage, 10);
  if (!parsed) throw new Declined(usage);
  return { filters: parsed.filters, usage, cached: false };
}
