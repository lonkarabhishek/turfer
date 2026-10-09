import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CITIES, CITY_IDS, type CityId } from "@/lib/city";
import { SPORT_PAGES, turfPlaysSport, sportBySlug } from "@/lib/sports";
import { areaFor } from "@/lib/utils/area";
import { getMinimumPrice } from "@/lib/utils/prices";
import { compareTopRated } from "@/lib/utils/ranking";
import { haversineKm, type Coords } from "@/lib/utils/location";
import type { Turf } from "@/types/turf";

/**
 * "Ask TapTurf": a sentence in, a list of real turfs out.
 *
 * Claude only turns the sentence into filters (city, sport, areas,
 * budget, time, needs). The search itself runs over our own turf
 * rows, so a result is always a venue we list. Haiku 5.5, low effort:
 * a few paise per query. Without ANTHROPIC_API_KEY the caller falls
 * back to plain keyword matching, so the box still works.
 */

const MODEL = "claude-haiku-5-5";

export const NEEDS = ["floodlights", "parking", "washroom", "changing_room", "cafeteria", "covered"] as const;
export type Need = (typeof NEEDS)[number];

const SPORT_SLUGS = SPORT_PAGES.map((s) => s.slug) as [string, ...string[]];

export const AskFilters = z.object({
  city: z.enum(CITY_IDS as [CityId, ...CityId[]]).nullable(),
  sport: z.enum(SPORT_SLUGS).nullable(),
  areas: z.array(z.string()),
  max_price_per_hour: z.number().nullable(),
  min_rating: z.number().nullable(),
  time: z.enum(["morning", "afternoon", "evening", "late_night"]).nullable(),
  open_24x7: z.boolean(),
  wants_nearby: z.boolean(),
  players: z.number().nullable(),
  needs: z.array(z.enum(NEEDS)),
  sort: z.enum(["rating", "price_low", "reviews", "nearby"]),
  free_text: z.string().nullable(),
  summary: z.string(),
  off_topic: z.boolean(),
});
export type AskFilters = z.infer<typeof AskFilters>;

export function isAskConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Stable system prompt (cacheable): cities, sports, and the areas we know. */
function systemPrompt(areasByCity: Record<string, string[]>): string {
  const cities = CITIES.map((c) => `${c.id} (${c.label})`).join(", ");
  const sports = SPORT_PAGES.map((s) => `${s.slug} = ${s.labels.join("/")}`).join("; ");
  const areas = Object.entries(areasByCity)
    .map(([city, list]) => `${city}: ${list.join(", ")}`)
    .join("\n");
  return `You turn a player's search for a sports venue in India into filters for a venue directory. Reply only with the JSON object.

Cities: ${cities}. "Nasik" is nashik. "Bombay", Thane, Navi Mumbai, Panvel are mumbai. Secunderabad is hyderabad.
Sports (slug = labels): ${sports}. "Turf cricket", "cricket turf", "cage cricket" mean box-cricket; "nets", "practice" mean cricket; "futsal", "5-a-side", "7-a-side" mean football.

Known areas by city:
${areas}

Rules:
- areas: neighbourhoods the player names, using the known spelling when one matches. Empty when none. Do not put a city in areas.
- city: when stated, or when every area named belongs to one city. Otherwise null.
- wants_nearby: true for "near me", "nearby", "close by", "around here". Then leave areas empty.
- max_price_per_hour: only when a budget is given. "cheap", "budget", "affordable" alone mean 800.
- time: morning (before 12), afternoon, evening (after 5pm, "tonight"), late_night (after 11pm, "midnight", "2am").
- open_24x7: true for "24 hours", "all night", "open late", "after midnight".
- needs: only features the player asks for. "lights" or "night match" means floodlights. "rain" or "indoor" means covered.
- players: the number of people, if given.
- sort: price_low when the player cares about cost, reviews for "popular", nearby when wants_nearby, else rating.
- free_text: a venue name or words you could not map ("CC Turf", "rooftop"). Else null.
- summary: at most 12 words restating the search in plain words, sentence case, no quotes. Example: Box cricket in Kothrud under ₹1,000 an hour.
- off_topic: true when the message is not about finding a sports venue, court, turf or game. Then still fill summary with a short polite note.`;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 8_000, maxRetries: 1 });
  return client;
}

export type AskParse = { filters: AskFilters; usage?: { input: number; output: number; cached: number } };

/** Sentence to filters. Throws on API failure; returns null when the model declined. */
export async function parseAsk(query: string, areasByCity: Record<string, string[]>): Promise<AskParse | null> {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 400,
    output_config: { effort: "low", format: zodOutputFormat(AskFilters) },
    system: [{ type: "text", text: systemPrompt(areasByCity), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: query }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return {
    filters: response.parsed_output,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cached: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}

/** Plain keyword fallback when the API is unavailable. */
export function keywordFilters(query: string): AskFilters {
  const q = query.toLowerCase();
  const city = CITIES.find((c) => q.includes(c.id)) ?? null;
  const sportPage = SPORT_PAGES.find((s) => s.labels.some((l) => q.includes(l.toLowerCase()))) ?? null;
  const sport = sportPage?.slug ?? null;
  const known = !!(city || sportPage);
  const summary = known
    ? `${sportPage ? sportPage.name : "Turfs"}${city ? ` in ${city.label}` : ""}`
    : `Turfs matching "${query}"`;
  return {
    city: city?.id ?? null,
    sport,
    areas: [],
    max_price_per_hour: null,
    min_rating: null,
    time: null,
    open_24x7: /24 ?(hour|hr|x7)|all night|midnight/.test(q),
    wants_nearby: /near me|nearby|close by/.test(q),
    players: null,
    needs: [],
    sort: /near me|nearby/.test(q) ? "nearby" : "rating",
    // With a sport or city recognised, the rest of the words are noise.
    free_text: known ? null : query,
    summary,
    off_topic: false,
  };
}

/** Distinct, sorted areas per city from the live turf rows. Stable across requests so the prompt caches. */
export function areasFromTurfs(turfs: Turf[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const t of turfs) {
    const area = areaFor(t);
    if (!t.city || !area) continue;
    (out[t.city] ??= new Set()).add(area);
  }
  return Object.fromEntries(
    Object.entries(out)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([city, set]) => [city, [...set].sort((a, b) => a.localeCompare(b))]),
  );
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function hasNeed(t: Turf, need: Need): boolean {
  const am = (t.amenities ?? []).map(norm).join(" ");
  switch (need) {
    case "floodlights":
      return t.has_floodlights === true || /flood ?light|night/.test(am);
    case "parking":
      return t.parking_available === true || /parking/.test(am);
    case "washroom":
      return t.washroom_available === true || /washroom|toilet|restroom/.test(am);
    case "changing_room":
      return t.changing_room_available === true || /changing/.test(am);
    case "cafeteria":
      return t.has_cafeteria === true || /cafe|canteen|food/.test(am);
    case "covered":
      return t.is_covered === true || /covered|indoor|roof/.test(am);
  }
}

export type AskResult = {
  turfs: (Turf & { distanceKm?: number })[];
  total: number;
  /** Filters we had to drop to find anything, in the order dropped. */
  relaxed: string[];
};

/**
 * Apply the filters to our rows. Hard filters first; when nothing
 * matches, drop the least important ones one at a time so the player
 * always sees something close rather than an empty page.
 */
export function applyAskFilters(
  all: Turf[],
  f: AskFilters,
  opts: { prefCity?: CityId | null; loc?: Coords | null; limit?: number } = {},
): AskResult {
  const limit = opts.limit ?? 12;
  const sport = f.sport ? sportBySlug(f.sport) : undefined;
  const areas = f.areas.map(norm).filter(Boolean);
  // Every word must appear, so "CC Turf" doesn't match every turf in the city.
  const freeWords = f.free_text ? norm(f.free_text).split(" ").filter((w) => w.length >= 2) : [];
  const explicitCity = f.city;
  const scopeCity = explicitCity ?? (!f.wants_nearby && areas.length === 0 ? (opts.prefCity ?? null) : null);

  type Step = { key: string; keep: (t: Turf) => boolean };
  const steps: Step[] = [];
  if (sport) steps.push({ key: "sport", keep: (t) => turfPlaysSport(t.sports, sport) });
  if (areas.length)
    steps.push({
      key: "area",
      keep: (t) => {
        const hay = `${norm(areaFor(t) ?? "")} ${norm(t.address ?? "")}`;
        return areas.some((a) => hay.includes(a));
      },
    });
  if (explicitCity) steps.push({ key: "city", keep: (t) => t.city === explicitCity });
  else if (scopeCity) steps.push({ key: "pref_city", keep: (t) => t.city === scopeCity });
  if (f.max_price_per_hour != null) {
    const max = f.max_price_per_hour;
    steps.push({
      key: "price",
      keep: (t) => {
        const p = f.time === "evening" || f.time === "late_night" ? (t.evening_price ?? getMinimumPrice(t)) : getMinimumPrice(t);
        return p != null && p > 0 && p <= max;
      },
    });
  }
  if (f.min_rating != null) {
    const min = f.min_rating;
    steps.push({ key: "rating", keep: (t) => Number(t.rating) >= min });
  }
  if (f.open_24x7 || f.time === "late_night") steps.push({ key: "open_24x7", keep: (t) => t.is_24x7 === true });
  for (const need of f.needs) steps.push({ key: `need:${need}`, keep: (t) => hasNeed(t, need) });
  if (freeWords.length)
    steps.push({
      key: "text",
      keep: (t) => {
        const hay = norm(`${t.name} ${t.address ?? ""} ${(t.sports ?? []).join(" ")}`);
        return freeWords.every((w) => hay.includes(w));
      },
    });

  // Drop order when nothing matches: softest first. Sport and an explicit city stay.
  const dropOrder = ["text", "rating", ...f.needs.map((n) => `need:${n}`), "open_24x7", "price", "pref_city", "area"];
  const active = new Set(steps.map((s) => s.key));
  const relaxed: string[] = [];
  let matched: Turf[] = [];
  for (;;) {
    matched = all.filter((t) => steps.every((s) => !active.has(s.key) || s.keep(t)));
    if (matched.length > 0) break;
    const next = dropOrder.find((k) => active.has(k));
    if (!next) break;
    active.delete(next);
    relaxed.push(next);
  }

  const withDist = matched.map((t) => {
    const km =
      opts.loc && t.lat != null && t.lng != null
        ? haversineKm(opts.loc, { lat: Number(t.lat), lng: Number(t.lng) })
        : undefined;
    return { t, km: km != null && Number.isFinite(km) ? km : undefined };
  });

  const sort = f.sort === "nearby" && !opts.loc ? "rating" : f.sort;
  withDist.sort((a, b) => {
    switch (sort) {
      case "nearby":
        if (a.km == null && b.km == null) return compareTopRated(a.t, b.t);
        if (a.km == null) return 1;
        if (b.km == null) return -1;
        return a.km - b.km;
      case "price_low": {
        const ap = getMinimumPrice(a.t);
        const bp = getMinimumPrice(b.t);
        if (ap == null && bp == null) return compareTopRated(a.t, b.t);
        if (ap == null) return 1;
        if (bp == null) return -1;
        return ap - bp || compareTopRated(a.t, b.t);
      }
      case "reviews":
        return b.t.total_reviews - a.t.total_reviews;
      default: {
        // Evening searches: lit grounds first, then the usual rating order.
        if (f.time === "evening") {
          const la = a.t.has_floodlights === true ? 1 : 0;
          const lb = b.t.has_floodlights === true ? 1 : 0;
          if (la !== lb) return lb - la;
        }
        return compareTopRated(a.t, b.t);
      }
    }
  });

  return {
    turfs: withDist.slice(0, limit).map(({ t, km }) => (km != null ? { ...t, distanceKm: km } : t)),
    total: withDist.length,
    relaxed,
  };
}

/** Human labels for relaxed filters, for the "we widened your search" line. */
export function relaxedLabel(key: string): string {
  if (key.startsWith("need:")) return key.slice(5).replace("_", " ");
  return (
    {
      text: "the name",
      rating: "the rating",
      open_24x7: "24-hour opening",
      price: "the budget",
      pref_city: "your city",
      area: "the area",
    } as Record<string, string>
  )[key] ?? key;
}
