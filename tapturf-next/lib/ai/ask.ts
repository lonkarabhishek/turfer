import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
// Relative, so npm run test:ask runs applyAskFilters (lib/ai/relax.test.ts).
import { CITIES, CITY_ALIASES, CITY_IDS, cityInText, cityInfo, type CityId } from "../city";
import { SPORT_PAGES, turfPlaysSport, sportBySlug } from "../sports";
import { areaFor } from "../utils/area";
import { getMinimumPrice, summarisePrice } from "../utils/prices";
import { sportBandTimeRange, sportMinimumPrice, sportPrice, type CardSport, type SportBandMap, type SportBandTimeMap } from "../utils/cardSport";
import { compareTopRated } from "../utils/ranking";
import { haversineKm, type Coords } from "../utils/location";
import { dropOrder, nearbyLabel, relaxNearby, relaxSteps } from "./relax";
import { reviewsSubject } from "./reviewsAnswer";
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

export const NEEDS = ["floodlights", "parking", "washroom", "changing_room", "cafeteria", "covered", "equipment"] as const;
export type Need = (typeof NEEDS)[number];

const SPORT_SLUGS = SPORT_PAGES.map((s) => s.slug) as [string, ...string[]];

export const AskFilters = z.object({
  intent: z.enum(["find_turf", "find_game", "compare", "question", "create_game", "tool", "other"]),
  /** For the tool intent: which free tool fits (lib/tools/registry.ts slugs). */
  tool: z.enum(["cricket-nrr-calculator", "cricket-toss", "cricket-scorecard-maker", "cricket-live-scorer", "live-scoreboard", "cricket-tournament-scorer", "cricket-team-generator"]).nullable(),
  city: z.enum(CITY_IDS as [CityId, ...CityId[]]).nullable(),
  sport: z.enum(SPORT_SLUGS).nullable(),
  areas: z.array(z.string()),
  /** Venue names the player typed, for compare, question and a find_turf that names one (looked up in every city). */
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
/** What the player is looking at when they ask (a turf page, a city page). turfId: that venue's row, as two can share a name in one city. */
export type AskContext = { turf?: string | null; turfId?: string | null; city?: CityId | null };

export function isAskConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Bump when systemPrompt() or AskFilters changes: cached readings (lib/ai/parseCache.ts) are keyed by it. */
export const ROUTER_VERSION = 9;

/**
 * Stable system prompt (cacheable): cities, sports, and the areas we
 * know. Cities and their other names come from the curated lib/city.ts
 * (every live city since 26 Oct), never the live list: it changes only
 * on a deploy, with no counts and no order that moves, so the cached
 * prefix holds. The city enum in AskFilters is built the same way.
 */
function systemPrompt(areasByCity: Record<string, string[]>): string {
  const cities = CITIES.map((c) => `${c.id} (${c.label})`).join(", ");
  const otherNames = Object.entries(CITY_ALIASES)
    .map(([alias, id]) => `"${alias}" is ${id}`)
    .join(", ");
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
- question: a question about one named venue ("does X have parking", "what time does Y open", "how much is Z"), including what people say about it ("what do players say about X", "X reviews", "is X any good"). Which venues are best reviewed ("best reviewed turfs in Pune") is find_turf.
- create_game: wants to host, organise or set up their own game, or needs players for it ("host box cricket Saturday 7pm at X", "need 4 players for my match", "create a game", "mujhe game banana hai").
- tool: wants one of TapTurf's free tools, or asks for something one of them does. Set tool to the matching one:
  cricket-nrr-calculator: net run rate, NRR, run rate maths ("how to calculate NRR", "our NRR after 63 in 6 overs vs 54").
  cricket-toss: a coin toss, heads or tails, who bats first ("toss karo", "flip a coin").
  cricket-scorecard-maker: a scorecard, result card or match poster to share after the match ("make a scorecard", "result image for WhatsApp").
  cricket-live-scorer: scoring their own cricket or box cricket match ball by ball while it is played; also a plain "live score" or "scoring app" with no sport named ("ball by ball scorer", "score our match", "box cricket scoring app").
  live-scoreboard: keeping score of any other sport: football, futsal, basketball, volleyball, badminton, pickleball, tennis, table tennis, padel or another game ("football score", "badminton score counter", "keep score of our game").
  cricket-tournament-scorer: a points table, standings, series score, tournament or league tracking ("points table for our tri-series", "track my tournament").
  cricket-team-generator: splitting players into teams, random teams, balanced teams ("divide 10 players into 2 teams", "team banao").
  For a question about the rules of NRR or a toss, still use tool: the tool page explains it.
- other: greetings, small talk, thanks, or anything not about sports venues or games.

Page context: the message may say what the player is looking at right now (a venue page or a city page). Then "this turf", "this place", "here", "it" mean that venue: put its name in turf_names for question and compare, and use its city when none is stated. But when the player names another venue, or an area listed under a different city and not under the page's, leave city null unless they state one: we look venues up in every city, and players ask about venues in other cities.

Follow-ups: the message may come with the last few turns of this conversation. When the new message refines the previous one ("cheaper", "what about Baner", "only 24 hours", "and for football", "is it open late"), keep the earlier intent and filters and change only what the player changed; a venue named earlier (turf_names, free_text) stays until they name another or start a new search. A new topic resets them. Each earlier turn lists "top": the venues that were shown, in order. "The top two", "the first one", "the second", "compare those", "that one" refer to those names: copy the exact names into turf_names (two for compare, one for question).

Cities: ${cities}. Other names: ${otherNames}. Panvel is mumbai.
Sports (slug = labels): ${sports}. "Turf cricket", "cricket turf", "cage cricket" mean box-cricket; "nets", "practice nets", "net practice", "bowling machine" mean cricket-nets; "cricket ground" means cricket; "futsal", "5-a-side", "7-a-side" mean football.

Known areas by city:
${areas}

Rules:
- turf_names: venue names exactly as typed, one per entry, for compare, question, and a find_turf that names a venue ("Prime Turf Marol", "kage turf bro" gives "kage turf", "DN Parande Football And Cricket Turf"). Leave out words around the name (near me, bro, a city). Empty otherwise.
- question: the player's question in their words, for question intent. Else null.
- areas: neighbourhoods the player names, using the known spelling when one matches. Empty when none. Never a city, never a venue name, even when a venue is named after its area ("Begur Turf" is a venue: turf_names and free_text, no area). A listed area with only generic words or a time around it ("Mahadevapura turf 8pm", "turf in Shivaji Nagar", "Baner box cricket") is that area.
- city: when stated, or when every area named belongs to one city. Otherwise null. A venue name never sets a city: many venues share a name across cities, and we find the venue in every city.
- wants_nearby: true for "near me", "nearby", "close by", "around here". Then leave areas empty.
- max_price_per_hour: only when a budget is given. "cheap", "budget", "affordable" alone mean 800.
- time: morning (before 12), afternoon, evening (after 5pm, "tonight"), late_night (after 11pm, "midnight", "2am").
- when: for games. today, tomorrow, weekend (Saturday or Sunday), this_week. Null when not said.
- skill: for games, only if the player says beginner, intermediate, advanced, pro, casual (casual = beginner).
- open_24x7: true for "24 hours", "all night", "open late", "after midnight".
- needs: only features the player asks for. "lights" or "night match" means floodlights. "rain" or "indoor" means covered. "equipment", "kit", "bat and ball provided" means equipment.
- players: the number of people, if given.
- sort: price_low when the player cares about cost, reviews for "popular", nearby when wants_nearby, else rating.
- free_text: for find_turf, the venue name when one is named (as in turf_names), else words you could not map ("rooftop"). Else null. A message that is only a venue's name ("Dribble den", "Praxis") is find_turf with that name, never other.
- summary: at most 12 words restating the request in plain words, sentence case, no quotes, ₹ before amounts. Examples: Box cricket in Kothrud under ₹1,000 an hour. Football games this weekend near you. Hindu Gymkhana vs Vedant Sports Academy. For other: a 3 to 6 word label like "Just saying hi".
- followups: two or three things the player might say next, each under 6 words, as they would type them ("Only 24 hours", "Cheaper ones", "Compare the top two", "Any games there this weekend"). For a greeting: three example asks. Never repeat the current message.
- reply: one or two short sentences to the player, as the box would say them. For a search: what you are about to show ("Here are box cricket cages in Kothrud under ₹1,000, cheapest first."). For a named venue, say you are looking it up ("Let me find Prime Turf Marol."), never a city you guessed for it. For compare or question: a lead-in ("Let me put those two side by side."). For create_game: one line saying you'll set the game up from their message ("Let's set that up. Tap below and check the details."). For tool: one line saying which free tool does it and that it needs no sign-in ("TapTurf has a free NRR calculator for exactly this. It reads overs the cricket way, so 5.3 is five overs and three balls."); when the message includes numbers you may give the answer in the reply too, but only if you are sure of the maths. For other: when the player is clearly after cricket admin we do not have a tool for, say so and offer the nearest tool. For a greeting or small talk: greet back warmly and say what you can do in one line (find a turf, find a game, compare two venues, ask about one). For anything else off-topic: a light, kind one-liner steering back to turfs and games. Never promise results you cannot see; never invent a venue.
- Never name, recommend or point to a turf-booking app or booking website (Playo, Hudle, KheloMore, Playspots, Turf Town, District, Kixar, BookMyShow, Turfwala, TIDA Sports, Sporloc and the like) in reply, summary or followups, not even when the player names one ("Hudle pe Baner me football turf?" gets "Here are football turfs in Baner."), and never say a venue is booked online or through an app: TapTurf lists venues itself.`;
}

let client: Anthropic | null = null;
export function getAnthropic(): Anthropic {
  if (!client) client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  return client;
}

type StructuredParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "output_config">;

/** Tokens spent on one ask, across every model call it made (retries included). */
export type AskUsage = { input: number; output: number; cache_read: number; cache_write: number; calls: number };

export const newUsage = (): AskUsage => ({ input: 0, output: 0, cache_read: 0, cache_write: 0, calls: 0 });

export function addUsage(to: AskUsage, u: Anthropic.Usage | AskUsage): void {
  if ("input_tokens" in u) {
    to.input += u.input_tokens;
    to.output += u.output_tokens;
    to.cache_read += u.cache_read_input_tokens ?? 0;
    to.cache_write += u.cache_creation_input_tokens ?? 0;
    to.calls += 1;
  } else {
    to.input += u.input;
    to.output += u.output;
    to.cache_read += u.cache_read;
    to.cache_write += u.cache_write;
    to.calls += u.calls;
  }
}

/** A second try of structured() needs at least this long before its deadline. */
const MIN_RETRY_MS = 5_000;

/**
 * messages.create with a JSON schema, parsed by hand. The SDK's .parse()
 * runs JSON.parse on every text block and throws on the first bad one.
 * In production Haiku now and then returned a block with a raw newline
 * inside a string, or the object split over two blocks, which surfaced
 * as "Unterminated string in JSON" and a dead answer. So: join the
 * blocks, scrub control characters, cut to the outer braces, validate
 * with zod, and try once more (with a doubled budget if it was cut off)
 * when it still does not parse. Null means the model declined or both
 * attempts came back unusable. Pass `usage` to have the tokens of each
 * attempt added to it, `info` to learn whether a null was the model
 * declining (refused) rather than output we couldn't use, and `opts` to
 * give each attempt its own timeout or retries (else the client's: 20 s,
 * one retry, so an attempt can take about 41 s), or a deadline that
 * every attempt ends by.
 */
export async function structured<T extends z.ZodType>(
  schema: T,
  params: StructuredParams,
  tag: string,
  usage?: AskUsage,
  info?: { refused?: boolean },
  opts?: { timeout?: number; maxRetries?: number; think?: boolean; deadline?: number },
): Promise<z.output<T> | null> {
  const format = zodOutputFormat(schema);
  const { think = false, deadline, ...request } = opts ?? {};
  // think: reason before answering (adaptive thinking, medium effort), for
  // answers that must read a table right. It needs room: the caller's
  // max_tokens is kept for the JSON and the thinking gets its own on top.
  let maxTokens = think ? params.max_tokens + 4_000 : params.max_tokens;
  for (let attempt = 0; attempt < 2; attempt++) {
    // deadline (ms since 1970): every try ends by it, and a second try
    // with too little time left to answer isn't started.
    const left = deadline === undefined ? Infinity : deadline - Date.now();
    if (attempt > 0 && left < MIN_RETRY_MS) {
      console.warn(`ai ${tag}: no time left to ask again`, { left });
      return null;
    }
    // Thinking off by default: in production Haiku spent the whole budget
    // on a thinking block and the JSON came back cut at max_tokens.
    const res = await getAnthropic().messages.create(
      {
        ...params,
        max_tokens: maxTokens,
        thinking: think ? { type: "adaptive" } : { type: "disabled" },
        output_config: { effort: think ? "medium" : "low", format },
      },
      { ...request, ...(Number.isFinite(left) ? { timeout: Math.max(1_000, Math.min(request.timeout ?? left, left)) } : {}) },
    );
    if (usage && res.usage) addUsage(usage, res.usage);
    if (res.stop_reason === "refusal") {
      if (info) info.refused = true;
      return null;
    }
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

export type AskParse = { filters: AskFilters; usage: AskUsage };

/**
 * Sentence to intent and filters. Throws on API failure; returns null
 * when the model declined. The tokens spent go into `usage` either way.
 */
export async function parseAsk(
  query: string,
  areasByCity: Record<string, string[]>,
  history: AskTurn[] = [],
  ctx: AskContext = {},
  usage: AskUsage = newUsage(),
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
    usage,
  );
  return filters ? { filters, usage } : null;
}

// The commonest question shapes, for the keyword reading: the venue is the part in the middle.
const QUESTION_SHAPES = [
  /^(?:does|do|did|can|will)\s+(.+?)\s+(?:have|has|had|allow|allows|provide|provides|offer|offers|open|close|charge|cost|take|serve|let)\b/i,
  /^(?:what time|when)\s+(?:does|do|is|will)\s+(.+?)\s+(?:open|close|start|shut|opens|closes)\b/i,
  /^how much\s+(?:is|does|at)\s+(.+?)(?:\s+(?:per|for|an|a|cost|costs|charge|charges)\b.*)?$/i,
  /^is\s+(.+?)\s+(?:open|good|any good|safe|available|cheap|expensive|crowded|covered|indoor|lit|worth)\b/i,
];
const THIS_VENUE = /^(?:this|the|that)?\s*(?:turf|place|ground|venue|court|one)$|^(?:it|here|this|that)$/i;
/** "The second one": a card shown last turn, not a venue called Second Innings. */
const NTH_SHOWN = /^(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|last)(?:\s+(?:one|turf|venue|place))?$/i;
const NTH: Record<string, number> = { first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2, fourth: 3, "4th": 3, fifth: 4, "5th": 4 };

/**
 * Plain keyword fallback when the API is unavailable. With `turfs`, it
 * also reads "A vs B", the commonest questions about one venue, and a
 * venue named next to a city or a sport ("Hotfut in Hyderabad"), which
 * would otherwise be a plain city search. `pageTurf`: the venue page
 * the player is on, for "does this turf have parking". `shown`: the
 * names the last turn showed, for "does the second one have parking".
 */
export function keywordFilters(query: string, opts: { turfs?: readonly Turf[]; pageTurf?: string | null; shown?: readonly string[] } = {}): AskFilters {
  const q = query.toLowerCase();
  const raw = query.trim().replace(/[?.!]+$/, "");
  const { turfs } = opts;
  if (turfs) {
    const blank = keywordFilters(query);
    if (/^compare\s+(?:the\s+)?(?:top\s+(?:two|2)|those|them|these|both|the two)$/i.test(raw))
      return { ...blank, intent: "compare", free_text: null, summary: "Compare the top two", reply: "Let me put those two side by side." };
    const cmp = /^(?:compare\s+)?(.+?)\s+(?:vs\.?|v\/s|versus)\s+(.+)$/i.exec(raw) ?? /^compare\s+(.+?)\s+(?:and|with|&)\s+(.+)$/i.exec(raw);
    // Each side must be a venue's own name, not "Pune", "football" or an
    // area; "this" on a venue page is that venue.
    const side = (s: string) => (THIS_VENUE.test(s.trim()) ? (opts.pageTurf ?? null) : namesVenue(turfs, s) ? s.trim() : null);
    const sides = cmp ? [side(cmp[1]), side(cmp[2])] : [];
    if (sides.length === 2 && sides[0] && sides[1]) {
      const names = sides as string[];
      return { ...blank, intent: "compare", city: null, sport: null, free_text: null, turf_names: names, summary: `${names[0]} vs ${names[1]}`.slice(0, 120), reply: "Let me put those two side by side." };
    }
    // The venue part of a common question shape, else of a question about
    // what people say of one ("what do players say about it", "Hotfut Bavdhan reviews").
    const shaped = QUESTION_SHAPES.map((shape) => shape.exec(raw)?.[1]).find((m) => m != null);
    // What people say of a venue named by its whole name: "Kothrud reviews" and "football turf reviews" stay searches.
    const reviewed = shaped == null ? reviewsSubject(raw) : null;
    const said = shaped ?? (reviewed && (THIS_VENUE.test(reviewed) || NTH_SHOWN.test(reviewed) || wholeVenueName(turfs, reviewed)) ? reviewed : null);
    const question = (words: string): AskFilters | null => {
      let name = words.trim();
      const nth = NTH_SHOWN.exec(name);
      if (nth) {
        const k = nth[1].toLowerCase();
        const pick = opts.shown?.[k === "last" ? opts.shown.length - 1 : NTH[k]];
        if (!pick) return null;
        name = pick;
      }
      const here = !nth && THIS_VENUE.test(name) && !!opts.pageTurf;
      // A venue's own name: "does Andheri have box cricket" is a search in Andheri.
      if (!here && !nth && !namesVenue(turfs, name)) return null;
      return {
        ...blank,
        intent: "question",
        sport: null,
        free_text: null,
        turf_names: here ? [] : [name],
        question: raw,
        summary: `Question about ${here ? opts.pageTurf : name}`.slice(0, 120),
        // Over the answer card, which comes in the same response.
        reply: `Here's what I found about ${here ? opts.pageTurf : name}.`,
      };
    };
    const asked = said != null ? question(said) : null;
    if (asked) return asked;
  }
  // Labels, ids and other names on word boundaries ("goal" is not Goa).
  const cityId = cityInText(query);
  const city = cityId ? cityInfo(cityId) : null;
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
    tool: null,
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
    // With a sport or city recognised, the rest of the words are noise,
    // unless they name a venue: "Hotfut in Hyderabad" is Hotfut.
    free_text: game ? null : known ? (turfs ? (findNamedVenues(turfs, query)?.label ?? null) : null) : query,
    summary,
    reply: game ? "Here are the open games that match." : "Here is what matches on TapTurf.",
    followups: [],
  };
}

const areasMemo = new WeakMap<Turf[], Record<string, string[]>>();

/**
 * Distinct, sorted areas per city from the live turf rows. Sorted, so
 * the same rows in any order give the same prompt bytes and the prompt
 * caches. Worked out once per turf list (the list is memoised for 10
 * minutes); callers must not change the result.
 */
export function areasFromTurfs(turfs: Turf[]): Record<string, string[]> {
  const hit = areasMemo.get(turfs);
  if (hit) return hit;
  const out: Record<string, Set<string>> = {};
  for (const t of turfs) {
    const area = areaFor(t);
    if (!t.city || !area) continue;
    (out[t.city] ??= new Set()).add(area);
  }
  const res = Object.fromEntries(
    Object.entries(out)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([city, set]) => [city, [...set].sort((a, b) => a.localeCompare(b))]),
  );
  areasMemo.set(turfs, res);
  return res;
}

import { areaElsewhere, cityNamed, closestNames, findNamedVenues, nameIn, namedInSearch, namesVenue, namesWhich, norm, placedAt, readsAsName, resolveTurfNames, wholeVenueName, type VenueMatch } from "./names";
export { cityNamed, findNamedVenues, nameIn, norm, resolveTurfNames };

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
    case "equipment":
      return t.equipment_provided === true || /equipment|bats? |stumps|kit provided/.test(am);
    case "covered":
      return t.is_covered === true || /covered|indoor|roof/.test(am);
  }
}

/** Narrow sports and the wider one Ask shows when a place has none, with the words for the reply. */
export const SPORT_FALLBACK: Record<string, { slug: string; none: string; instead: string }> = {
  "cricket-nets": { slug: "cricket", none: "cricket practice nets", instead: "cricket grounds" },
};

export type AskResult = {
  turfs: (Turf & { distanceKm?: number })[];
  total: number;
  /** Filters we had to drop to find anything, in the order dropped. */
  relaxed: string[];
  /** The sport the cards are for: the wider one when a narrow sport had none ("cricket" for nets). */
  sport: string | null;
  /** The city the cards are in when the search settled on one (a named venue's city), or the city filter; null for several. */
  city: CityId | null;
  /**
   * Set when the player named a venue: the cards are the venues by that
   * name, from every city. whole: they have the whole name typed, not
   * only part of it ("Kage" for Kage Multisport Turf).
   */
  venue: { label: string; askedCity: CityId | null; whole: boolean } | null;
  /**
   * Set when the player's city is known and no venue by the name typed
   * is in it (named elsewhere, or a name no venue has): the venues there
   * with the closest names (closestNames), maybe none. Not cards yet.
   * Not for words of a search ("rooftop turf"): only a venue's name.
   */
  closest: { city: CityId; turfs: Turf[] } | null;
};

/**
 * Apply the filters to our rows. Hard filters first; when nothing
 * matches, drop the least important ones one at a time so the player
 * always sees something close rather than an empty page.
 *
 * A venue the player named (turf_names, or free_text that names one) is
 * looked up in every city first (lib/ai/names.ts), and the cards are
 * those venues: "Prime Turf Marol" asked from Pune is the Mumbai venue,
 * not Pune's top rated turfs. The cities (the one asked about, the
 * reading's, the visitor's) then only choose among venues by that name,
 * and give way before the name does. `askedCity`: the city the
 * player's words name (cityNamed), when the caller knows it: a reading's
 * city that the words don't name (the page's) then gives way to an area
 * it doesn't have ("Begur" on the Nashik page is Bangalore's Begur), and
 * to "near me" with the visitor's location. `sportPrices`: the venues'
 * sport bands (getSportBands, getSportBandTimes), when the cards show the
 * price for the sport asked (the route's cardPrices): the budget and
 * cheapest first then read that price too.
 */
export function applyAskFilters(
  all: Turf[],
  f: AskFilters,
  opts: {
    prefCity?: CityId | null;
    loc?: Coords | null;
    limit?: number;
    askedCity?: CityId | null;
    sportPrices?: { bands: SportBandMap | null; times: SportBandTimeMap | null };
  } = {},
): AskResult {
  const limit = opts.limit ?? 12;
  const sport = f.sport ? sportBySlug(f.sport) : undefined;
  const areas = f.areas.map(norm).filter(Boolean);
  const inArea = (t: Turf) => {
    const hay = `${norm(areaFor(t) ?? "")} ${norm(t.address ?? "")}`;
    return areas.some((a) => hay.includes(a));
  };
  // turf_names is a name (one of only a city and generic words too:
  // "Coimbatore Sports Club"); free_text may just be words to find in the
  // city ("skating", "rooftop"), so it names a venue only when that city
  // has no row with them (namedInSearch).
  const asName = findNamedVenues(all, f.turf_names[0], true);
  const inText = asName ? null : namedInSearch(all, f.free_text, opts.askedCity ?? f.city ?? opts.prefCity ?? null);
  const named = asName ?? inText?.named ?? null;
  const match = new Map<Turf, VenueMatch>((named?.matches ?? []).map((m) => [m.turf, m]));
  const askedCity = named ? (opts.askedCity ?? named.city) : null;
  // The player's city (the one asked about, the reading's, the visitor's),
  // for "No turf called X here" and the closest names there.
  const home = (named ? askedCity : opts.askedCity) ?? f.city ?? opts.prefCity ?? null;
  const found = named ? named.matches.map((m) => m.turf) : [];
  // The name the venues were found by.
  const typed = named ? (asName ? f.turf_names[0] : f.free_text) : null;
  // The whole name typed: Golden turf, not Golden Boot Turf, for "Golden turf".
  const whole = (t: Turf) => !!match.get(t)?.whole;
  // A venue's name, not what a venue has: the reading's turf_names, or
  // free_text that is a venue's whole name and names one ("rooftop",
  // "astro turf" and "turf with cafe" say what a venue has, though venues
  // are called that: "N venues match rooftop turf", as before).
  const asTyped = !!asName || (found.some(whole) && namesWhich(all, f.free_text));
  // Where it is, said, as with its city typed: an area of the venue that
  // is no word of a name found ("Dribble Den in Begur", "Prime Turf Marol").
  const located = !!named && placedAt(found, typed, f.areas);
  const here = found.filter((t) => t.city === home);
  // None by that name in the player's city: none found there, or only
  // venues with part of it while the whole name is elsewhere ("Golden
  // turf" from Mumbai is Lucknow's; Golden Boot Turf is the closest).
  const notHere = !!home && asTyped && !located && (!here.length || (found.some(whole) && !here.some(whole)));
  // Then the cards are the venues with the whole name, when any has it,
  // and of those the ones called just that ("Prime Turf", not Prime
  // Sports Turf cricket), when any is.
  const wholes = notHere ? found.filter(whole) : [];
  const called = wholes.filter((t) => norm(t.name) === norm(named?.label ?? ""));
  const pool = !named ? all : called.length ? called : wholes.length ? wholes : found;
  // Every word must appear, so "CC Turf" doesn't match every turf in the
  // city. A name we found no venue for is searched as text too, so the
  // reply can say so when it matched nothing. Words that are a search in
  // the city rather than a name: the ones namedInSearch found there.
  const text = named ? null : (f.free_text ?? f.turf_names[0] ?? null);
  const freeWords = inText?.words ?? (text ? norm(text).split(" ").filter((w) => w.length >= 2) : []);
  let explicitCity = f.city;
  // Only an area another city lists as its own: "College Road" is in
  // other cities' addresses, but on the Nashik page it is Nashik's.
  if (!named && explicitCity && opts.askedCity !== undefined && opts.askedCity !== explicitCity && areas.length && areaElsewhere(all, f.areas, explicitCity))
    explicitCity = null;
  // Near me with the visitor's location: within a radius of them
  // (relaxNearby). Only a city the player named bounds it; the page's (the
  // quick reading's city for "near me") gives way, as their own city does:
  // from Baner on a Mumbai page, Pune turfs 1 km away, not Mumbai's at 85.
  const near = !named && f.wants_nearby && opts.loc ? opts.loc : null;
  if (near && explicitCity && opts.askedCity !== undefined && opts.askedCity !== explicitCity) explicitCity = null;
  // "Near me" with no location shared yet stays in the visitor's city
  // (the Use my location card shows) rather than listing all of India.
  const scopeCity = named
    ? null
    : (explicitCity ?? (!(f.wants_nearby && opts.loc) && areas.length === 0 ? (opts.prefCity ?? null) : null));

  type Step = { key: string; keep: (t: Turf) => boolean };
  const steps: Step[] = [];
  // A narrow sport ("nets": Cricket Nets, Indoor Cricket Net, Bowling
  // Machine) widens to its parent rather than to nothing: Nashik had 45
  // cricket venues and no nets on 26 Oct, and the sport and an explicit
  // city are never dropped.
  const wider = sport ? SPORT_FALLBACK[sport.slug] : undefined;
  const widerSport = wider ? sportBySlug(wider.slug) : undefined;
  if (sport && widerSport) {
    steps.push({ key: "sport", keep: (t) => turfPlaysSport(t.sports, widerSport) || turfPlaysSport(t.sports, sport) });
    steps.push({ key: "narrow_sport", keep: (t) => turfPlaysSport(t.sports, sport) });
  } else if (sport) steps.push({ key: "sport", keep: (t) => turfPlaysSport(t.sports, sport) });
  if (areas.length) steps.push({ key: "area", keep: inArea });
  if (named) {
    // The city asked about, then the reading's, then the visitor's: the first that has the venue.
    const cities = [
      ["asked_city", askedCity],
      ["city", f.city],
      ["pref_city", opts.prefCity ?? null],
    ] as const;
    cities.forEach(([key, c], i) => {
      if (c && !cities.slice(0, i).some(([, d]) => d === c)) steps.push({ key, keep: (t) => t.city === c });
    });
  } else if (explicitCity) steps.push({ key: "city", keep: (t) => t.city === explicitCity });
  else if (scopeCity) steps.push({ key: "pref_city", keep: (t) => t.city === scopeCity });
  // An area and no city: the visitor's city first. It gives way before
  // the area does ("Begur" from Nashik is Bangalore's), and comes back
  // once an area that matches nothing is dropped ("box cricket in
  // Swargate" from Pune: Pune box cricket, not all of India).
  else if (areas.length && opts.prefCity) {
    const home = opts.prefCity;
    steps.push({ key: "area_city", keep: (t) => t.city === home });
  }
  // With a sport, the budget and cheapest first read the price its card
  // shows for it (cardPrice with the venue's sport bands, as the route's
  // cardPrices), so no card sits under "Under ₹1,500" at football's band
  // of ₹3,000 to ₹4,000 (N Sports Arena, Hyderabad, 30 Oct), or ahead of
  // listed rates with none for the sport. A venue with the narrow sport is
  // priced for it, any other for the wider one, as its card is
  // (AskResult.sport). Without a sport or the bands, or for a named venue
  // (its card shows its own price): its own rates, as before.
  const priced = !named && sport && opts.sportPrices ? opts.sportPrices : null;
  const forSport = new Map<Turf, { row: Turf; rule: CardSport }>();
  const shownFor = (t: Turf) => {
    let s = forSport.get(t);
    if (!s) {
      const bands = priced?.bands?.[t.id];
      const page = widerSport && !turfPlaysSport(t.sports, sport!) ? widerSport : sport!;
      s = { row: bands ? { ...t, sport_bands: bands } : t, rule: { labels: page.labels } };
      forSport.set(t, s);
    }
    return s;
  };
  if (f.max_price_per_hour != null) {
    const max = f.max_price_per_hour;
    const evening = f.time === "evening" || f.time === "late_night";
    const own = (t: Turf) => (evening ? (t.evening_price ?? getMinimumPrice(t)) : getMinimumPrice(t));
    // The sport's band, at evening's where the bands list one (weekday, as evening_price is).
    const forTheSport = (t: Turf) => {
      const { row, rule } = shownFor(t);
      const summary = summarisePrice(row);
      if (summary.kind !== "real") return null;
      const p = sportPrice(row, summary, rule);
      if (p.from === "card") return own(t);
      if (p.from === "none") return null;
      return (evening ? sportBandTimeRange(priced!.times?.[t.id], rule, "evening", "weekday")?.[0] : null) ?? p.min;
    };
    steps.push({
      key: "price",
      keep: (t) => {
        const p = priced ? forTheSport(t) : own(t);
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
        const hay = norm(`${t.name} ${areaFor(t) ?? ""} ${t.address ?? ""} ${(t.sports ?? []).join(" ")}`);
        return freeWords.every((w) => hay.includes(w));
      },
    });

  // Softest first (dropOrder in lib/ai/relax.ts).
  const order = dropOrder(f.needs.map((n) => `need:${n}`), !!named);
  // Near me with the visitor's location: within a radius of them, widened
  // only while too few match, never all of India (relaxNearby). A city the
  // player named bounds it too: a visitor far from every match in it gets
  // the city, as before.
  let { matched, relaxed } = near
    ? relaxNearby(pool, steps, order, (t) => (t.lat != null && t.lng != null ? haversineKm(near, { lat: Number(t.lat), lng: Number(t.lng) }) : null))
    : relaxSteps(pool, steps, order);
  if (near && !matched.length && explicitCity) ({ matched, relaxed } = relaxSteps(pool, steps, order));

  const withDist = matched.map((t) => {
    const km =
      opts.loc && t.lat != null && t.lng != null
        ? haversineKm(opts.loc, { lat: Number(t.lat), lng: Number(t.lng) })
        : undefined;
    return { t, km: km != null && Number.isFinite(km) ? km : undefined };
  });

  const sort = f.sort === "nearby" && !opts.loc ? "rating" : f.sort;
  // Cheapest first: the low end of the price the card shows (sportMinimumPrice, as the sport pages order), worked out once a card.
  const lows = new Map<Turf, number | null>();
  const lowest = (t: Turf): number | null => {
    if (!priced) return getMinimumPrice(t);
    if (!lows.has(t)) lows.set(t, sportMinimumPrice(shownFor(t).row, shownFor(t).rule));
    return lows.get(t) ?? null;
  };
  // A named venue: the closest match first ("Mundhwa Turf Ground" before
  // the other turfs in Mundhwa, the exact "Prime Turf" before Prime Turf
  // Zone), then the order asked for. Near me with a location: nearest first.
  const byName = (a: Turf, b: Turf) => {
    const ma = match.get(a);
    const mb = match.get(b);
    if (!ma || !mb) return 0;
    return mb.nameHits - ma.nameHits || (sort === "nearby" ? 0 : Number(mb.exact) - Number(ma.exact));
  };
  withDist.sort((a, b) => {
    const closer = byName(a.t, b.t);
    if (closer) return closer;
    switch (sort) {
      case "nearby":
        if (a.km == null && b.km == null) return compareTopRated(a.t, b.t);
        if (a.km == null) return 1;
        if (b.km == null) return -1;
        return a.km - b.km;
      case "price_low": {
        const ap = lowest(a.t);
        const bp = lowest(b.t);
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

  // A name no venue has (the text step went): the reading's turf_names,
  // or free text that reads as a name on its own, with no sport, budget,
  // needs or players asked ("Circuit", "Dribble Zone Sports Arena"; not
  // "real grass" for pickleball or "turf for 14 players").
  const missing =
    named || !relaxed.includes("text")
      ? null
      : f.turf_names[0] && nameIn(all, f.turf_names[0])
        ? f.turf_names[0]
        : !f.sport && f.max_price_per_hour == null && !f.needs.length && f.players == null && readsAsName(all, f.free_text)
          ? f.free_text
          : null;
  // Its closest names there pass the search's other filters (sport, budget, area) and have every word of it.
  const kept = steps.filter((s) => !relaxed.includes(s.key) && !["text", "city", "pref_city", "area_city", "asked_city"].includes(s.key));
  const closest = !home
    ? null
    : notHere
      ? { city: home, turfs: closestNames(all, typed, home, pool, 3, { also: here }) }
      : missing
        ? { city: home, turfs: closestNames(all, missing, home, [], 3, { every: true, keep: (t) => kept.every((s) => s.keep(t)) }) }
        : null;
  const shownCities = new Set(matched.map((t) => t.city));
  return {
    turfs: withDist.slice(0, limit).map(({ t, km }) => (km != null ? { ...t, distanceKm: km } : t)),
    total: withDist.length,
    relaxed,
    sport: relaxed.includes("sport") ? null : relaxed.includes("narrow_sport") && widerSport ? widerSport.slug : (f.sport ?? null),
    city: named
      ? shownCities.size === 1
        ? ([...shownCities][0] ?? null)
        : null
      : (explicitCity ?? (steps.some((s) => s.key === "area_city") && !relaxed.includes("area_city") ? (opts.prefCity ?? null) : null)),
    venue: named ? { label: named.label, askedCity, whole: pool.some(whole) } : null,
    closest,
  };
}

/** Human labels for relaxed filters, for the "we widened your search" line. */
export function relaxedLabel(key: string): string {
  if (key.startsWith("need:")) return key.slice(5).replace("_", " ");
  if (key.startsWith("near:")) return nearbyLabel(key) ?? key;
  return (
    {
      text: "the name",
      rating: "the rating",
      open_24x7: "24-hour opening",
      price: "the budget",
      pref_city: "your city",
      area_city: "your city",
      area: "the area",
      narrow_sport: "the sport",
      when: "the date",
      skill: "the skill level",
      sport: "the sport",
    } as Record<string, string>
  )[key] ?? key;
}
