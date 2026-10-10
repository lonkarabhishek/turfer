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
 * "Ask TapTurf": a sentence in, something real out.
 *
 * Claude Haiku 5.5 reads the sentence once and returns an intent plus
 * filters (structured output, low effort, a few paise). The route then
 * does the work itself: finds turfs or games in our rows, resolves
 * venue names for a comparison or a question. Nothing Claude says here
 * reaches the screen except the one-line summary, so it cannot invent
 * a venue. Without ANTHROPIC_API_KEY the caller falls back to keyword
 * matching and the box still works.
 */

export const ROUTER_MODEL = "claude-haiku-5-5";

export const NEEDS = ["floodlights", "parking", "washroom", "changing_room", "cafeteria", "covered"] as const;
export type Need = (typeof NEEDS)[number];

const SPORT_SLUGS = SPORT_PAGES.map((s) => s.slug) as [string, ...string[]];

export const AskFilters = z.object({
  intent: z.enum(["find_turf", "find_game", "compare", "question", "create_game", "other"]),
  city: z.enum(CITY_IDS as [CityId, ...CityId[]]).nullable(),
  sport: z.enum(SPORT_SLUGS).nullable(),
  areas: z.array(z.string()),
  /** Venue names the player typed, for compare and question. */
  turf_names: z.array(z.string()),
  /** The question itself, for question intent, in the player's words. */
  question: z.string().nullable(),
  max_price_per_hour: z.number().nullable(),
  min_rating: z.number().nullable(),
  time: z.enum(["morning", "afternoon", "evening", "late_night"]).nullable(),
  /** For games: when. */
  when: z.enum(["today", "tomorrow", "weekend", "this_week"]).nullable(),
  skill: z.enum(["beginner", "intermediate", "advanced"]).nullable(),
  open_24x7: z.boolean(),
  wants_nearby: z.boolean(),
  players: z.number().nullable(),
  needs: z.array(z.enum(NEEDS)),
  sort: z.enum(["rating", "price_low", "reviews", "nearby"]),
  free_text: z.string().nullable(),
  summary: z.string(),
  /** One or two friendly sentences in TapTurf's voice, shown as the chat reply. */
  reply: z.string(),
  /** Two or three short follow-ups the player might tap next, in their words. */
  followups: z.array(z.string()),
});
export type AskFilters = z.infer<typeof AskFilters>;

/** A previous exchange, sent back so follow-ups can build on it. */
export type AskTurn = { user: string; reply: string; filters: Partial<AskFilters> & { top?: string[] } };
/** What the player is looking at when they ask (a turf page, a city page). */
export type AskContext = { turf?: string | null; city?: CityId | null };

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
  return `You read what a player typed into the search box of TapTurf, an Indian sports venue directory with pickup games, and return the intent and filters as JSON. Reply only with the JSON object.

You are also the voice of the box: friendly, short, Indian English, like a mate who knows every ground in town. No emoji, no exclamation marks in a row, no "I'm an AI".

Language: players write in English, Hinglish, Hindi or Marathi, in Latin or Devanagari script, often mixed ("kothrud me sasta box cricket hai kya", "aaj raat football khelna hai", "turf kuthe aahe", "सबसे सस्ता टर्फ"). Read all of it. Write reply and followups in the same language mix the player used, in Latin script, keeping venue and area names as listed. "Sasta", "kam paise", "budget", "swasta" mean cheap. "Aaj" is today, "kal" is tomorrow (or yesterday, but here tomorrow), "raat", "shaam", "sandhyakali" are evening, "subah", "sakali" are morning, "paas", "najeek", "javal", "idhar", "yahan" mean nearby. "Khelna hai", "khelayche aahe" mean they want to play: a game when they say match or team, a venue otherwise. The summary field stays in English.

Intents:
- find_turf: looking for a venue, ground, turf, court or cage to play at. The default when unsure.
- find_game: looking for a match, game or squad to join ("games near me", "football match this weekend", "anyone playing").
- compare: two or more venue names with "vs", "or", "compare", "which is better".
- question: a question about one named venue ("does X have parking", "what time does Y open", "how much is Z").
- create_game: wants to host, organise or set up their own game, or needs players for it ("host box cricket Saturday 7pm at X", "need 4 players for my match", "create a game", "mujhe game banana hai").
- other: greetings, small talk, thanks, or anything not about sports venues or games.

Page context: the message may say what the player is looking at right now (a venue page or a city page). Then "this turf", "this place", "here", "it" mean that venue: put its name in turf_names for question and compare, and use its city when none is stated.

Follow-ups: the message may come with the last few turns of this conversation. When the new message refines the previous one ("cheaper", "what about Baner", "only 24 hours", "and for football"), keep the earlier intent and filters and change only what the player changed. A new topic resets them. Each earlier turn lists "top": the venues that were shown, in order. "The top two", "the first one", "the second", "compare those", "that one" refer to those names: copy the exact names into turf_names (two for compare, one for question).

Cities: ${cities}. "Nasik" is nashik. "Bombay", Thane, Navi Mumbai, Panvel are mumbai. Secunderabad is hyderabad.
Sports (slug = labels): ${sports}. "Turf cricket", "cricket turf", "cage cricket" mean box-cricket; "nets", "practice" mean cricket; "futsal", "5-a-side", "7-a-side" mean football.

Known areas by city:
${areas}

Rules:
- turf_names: venue names exactly as typed, one per entry, for compare and question. Empty otherwise.
- question: the player's question in their words, for question intent. Else null.
- areas: neighbourhoods the player names, using the known spelling when one matches. Empty when none. Never a city, never a venue name.
- city: when stated, or when every area named belongs to one city. Otherwise null.
- wants_nearby: true for "near me", "nearby", "close by", "around here". Then leave areas empty.
- max_price_per_hour: only when a budget is given. "cheap", "budget", "affordable" alone mean 800.
- time: morning (before 12), afternoon, evening (after 5pm, "tonight"), late_night (after 11pm, "midnight", "2am").
- when: for games. today, tomorrow, weekend (Saturday or Sunday), this_week. Null when not said.
- skill: for games, only if the player says beginner, intermediate, advanced, pro, casual (casual = beginner).
- open_24x7: true for "24 hours", "all night", "open late", "after midnight".
- needs: only features the player asks for. "lights" or "night match" means floodlights. "rain" or "indoor" means covered.
- players: the number of people, if given.
- sort: price_low when the player cares about cost, reviews for "popular", nearby when wants_nearby, else rating.
- free_text: for find_turf, a single venue name or words you could not map ("rooftop"). Else null.
- summary: at most 12 words restating the request in plain words, sentence case, no quotes, ₹ before amounts. Examples: Box cricket in Kothrud under ₹1,000 an hour. Football games this weekend near you. Hindu Gymkhana vs Vedant Sports Academy. For other: a 3 to 6 word label like "Just saying hi".
- followups: two or three things the player might say next, each under 6 words, as they would type them ("Only 24 hours", "Cheaper ones", "Compare the top two", "Any games there this weekend"). For a greeting: three example asks. Never repeat the current message.
- reply: one or two short sentences to the player, as the box would say them. For a search: what you are about to show ("Here are box cricket cages in Kothrud under ₹1,000, cheapest first."). For compare or question: a lead-in ("Let me put those two side by side."). For create_game: one line saying you'll set the game up from their message ("Let's set that up. Tap below and check the details."). For a greeting or small talk: greet back warmly and say what you can do in one line (find a turf, find a game, compare two venues, ask about one). For anything else off-topic: a light, kind one-liner steering back to turfs and games. Never promise results you cannot see; never invent a venue.`;
}

let client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return client;
}

type StructuredParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "output_config">;

/**
 * messages.create with a JSON schema, parsed by hand. The SDK's .parse()
 * runs JSON.parse on every text block and throws on the first bad one.
 * In production Haiku now and then returned a block with a raw newline
 * inside a string, or the object split over two blocks, which surfaced
 * as "Unterminated string in JSON" and a dead answer. So: join the
 * blocks, scrub control characters, cut to the outer braces, validate
 * with zod, and try once more (with a doubled budget if it was cut off)
 * when it still does not parse. Null means the model declined or both
 * attempts came back unusable.
 */
export async function structured<T extends z.ZodType>(schema: T, params: StructuredParams, tag: string): Promise<z.output<T> | null> {
  const format = zodOutputFormat(schema);
  let maxTokens = params.max_tokens;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Thinking off: in production Haiku spent the whole budget on a
    // thinking block and the JSON came back cut at max_tokens.
    const res = await getAnthropic().messages.create({
      ...params,
      max_tokens: maxTokens,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format },
    });
    if (res.stop_reason === "refusal") return null;
    if (res.stop_reason === "max_tokens") maxTokens *= 2;
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = parseJsonObject(text);
    const out = parsed === undefined ? null : schema.safeParse(parsed);
    if (out?.success) return out.data as z.output<T>;
    console.error(`ai ${tag}: unusable structured output`, {
      attempt,
      stop: res.stop_reason,
      blocks: res.content.map((b) => b.type).join(","),
      issues: out && !out.success ? out.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`) : "not json",
      text: text.slice(0, 400),
    });
  }
  return null;
}

/** JSON.parse with two repairs: control characters inside strings, and text around the object. */
function parseJsonObject(text: string): unknown {
  const scrub = (t: string) => t.replace(/[\u0000-\u001f]+/g, " ");
  const tries = [text, scrub(text)];
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(scrub(text.slice(a, b + 1)));
  for (const t of tries) {
    try {
      return JSON.parse(t);
    } catch {
      /* next repair */
    }
  }
  return undefined;
}

export type AskParse = { filters: AskFilters; usage?: { input: number; output: number; cached: number } };

/** Sentence to intent and filters. Throws on API failure; returns null when the model declined. */
export async function parseAsk(
  query: string,
  areasByCity: Record<string, string[]>,
  history: AskTurn[] = [],
  ctx: AskContext = {},
): Promise<AskParse | null> {
  const parts: string[] = [];
  if (ctx.turf || ctx.city) {
    parts.push(`The player is looking at: ${ctx.turf ? `the venue page for ${ctx.turf}` : "the city page"}${ctx.city ? ` in ${ctx.city}` : ""}.`);
  }
  if (history.length) {
    parts.push(
      `Earlier in this conversation (oldest first):\n${history
        .map((h) => {
          const { top, ...filters } = h.filters;
          return `Player: ${h.user}\nBox: ${h.reply}\nFilters then: ${JSON.stringify(filters)}${top?.length ? `\nShown then (top): ${top.join(" | ")}` : ""}`;
        })
        .join("\n\n")}`,
    );
  }
  const context = parts.length ? `${parts.join("\n\n")}\n\nNow the player says: ${query}` : query;
  const filters = await structured(
    AskFilters,
    {
      model: ROUTER_MODEL,
      max_tokens: 600,
      system: [{ type: "text", text: systemPrompt(areasByCity), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: context }],
    },
    "router",
  );
  return filters ? { filters } : null;
}

/** Plain keyword fallback when the API is unavailable. */
export function keywordFilters(query: string): AskFilters {
  const q = query.toLowerCase();
  const city = CITIES.find((c) => q.includes(c.id)) ?? null;
  const sportPage = SPORT_PAGES.find((s) => s.labels.some((l) => q.includes(l.toLowerCase()))) ?? null;
  const sport = sportPage?.slug ?? null;
  const game = /\b(game|games|match|matches|squad|anyone playing)\b/.test(q);
  const known = !!(city || sportPage);
  const summary = game
    ? `${sportPage ? sportPage.name : "Open"} games${city ? ` in ${city.label}` : ""}`
    : known
      ? `${sportPage ? sportPage.name : "Turfs"}${city ? ` in ${city.label}` : ""}`
      : `Turfs matching "${query}"`;
  return {
    intent: game ? "find_game" : "find_turf",
    city: city?.id ?? null,
    sport,
    areas: [],
    turf_names: [],
    question: null,
    max_price_per_hour: null,
    min_rating: null,
    time: null,
    when: /\btoday|tonight\b/.test(q) ? "today" : /\btomorrow\b/.test(q) ? "tomorrow" : /\bweekend|saturday|sunday\b/.test(q) ? "weekend" : null,
    skill: null,
    open_24x7: /24 ?(hour|hr|x7)|all night|midnight/.test(q),
    wants_nearby: /near me|nearby|close by/.test(q),
    players: null,
    needs: [],
    sort: /near me|nearby/.test(q) ? "nearby" : "rating",
    // With a sport or city recognised, the rest of the words are noise.
    free_text: known || game ? null : query,
    summary,
    reply: game ? "Here are the open games that match." : "Here is what matches on TapTurf.",
    followups: [],
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

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const STOP = new Set(["turf", "turfs", "ground", "grounds", "sports", "sport", "arena", "academy", "club", "the", "and", "box", "cricket", "football", "complex", "hub"]);

/**
 * Match typed venue names against our rows. Generic words (turf,
 * arena, sports) don't count, so "Vedant" finds Vedant Sports Academy
 * and "CC Turf Pardi" needs both "cc" and "pardi". One result per
 * typed name, best match first, same city preferred.
 */
export function resolveTurfNames(all: Turf[], names: string[], prefCity?: CityId | null): { name: string; turf: Turf | null }[] {
  return names.map((name) => {
    const words = norm(name).split(" ").filter((w) => w.length >= 2);
    const strong = words.filter((w) => !STOP.has(w));
    const use = strong.length ? strong : words;
    if (!use.length) return { name, turf: null };
    let best: { t: Turf; score: number } | null = null;
    for (const t of all) {
      const hay = norm(`${t.name} ${areaFor(t) ?? ""}`);
      const hits = use.filter((w) => hay.includes(w)).length;
      if (hits === 0) continue;
      const score =
        hits / use.length +
        (hits === use.length ? 0.5 : 0) +
        (prefCity && t.city === prefCity ? 0.1 : 0) +
        Math.min(t.total_reviews, 1000) / 20000;
      if (!best || score > best.score) best = { t, score };
    }
    return { name, turf: best && best.score >= 0.75 ? best.t : null };
  });
}

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
      when: "the date",
      skill: "the skill level",
      sport: "the sport",
    } as Record<string, string>
  )[key] ?? key;
}
