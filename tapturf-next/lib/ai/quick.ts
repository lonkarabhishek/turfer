import { CITIES, CITY_ALIASES, CITY_IDS, type CityId } from "../city";
import { sportBySlug, type SportPage } from "../sports";
import { norm, resolveTurfNames } from "./names";
import type { Turf } from "../../types/turf";
import type { AskFilters, Need } from "./ask";

/**
 * Ready answers for Ask TapTurf: the chips we offer (lib/ask/chips.ts)
 * and the questions players ask most, read without a model call.
 *
 * Only for a fresh question (the route never passes one with history)
 * and only when every word is understood: a sport, a city or an area
 * we list, a time, a budget, a feature, or filler like "show me".
 * Anything else returns null and goes to Claude as before. This returns
 * filters and a reply; the route still finds turfs and games in the
 * live rows, so a ready answer never goes stale. A reply only names
 * places and venues the player typed. No "@/" imports so the test can
 * compile it on its own (npm run test:ask).
 */

export type QuickContext = {
  /** The visitor's city (the ?city= param), for venue name matching. */
  prefCity?: CityId | null;
  /** The page they are on: a city page, a venue page. */
  city?: CityId | null;
  turf?: string | null;
};

export type QuickData = {
  /** areasFromTurfs() of the live rows. */
  areas: Record<string, string[]>;
  /** The live rows, for "A vs B". */
  turfs: Turf[];
};

type Slot =
  | { k: "sport"; slug: string }
  | { k: "venue" }
  | { k: "near" }
  | { k: "city"; id: CityId; label: string; alias?: boolean }
  | { k: "area"; name: string; cities: string[] }
  | { k: "clash" }
  | { k: "time"; time?: AskFilters["time"]; when?: AskFilters["when"] }
  | { k: "cheap"; cheapest: boolean }
  | { k: "budget" }
  | { k: "o24" }
  | { k: "need"; need: Need }
  | { k: "games" }
  | { k: "skill"; skill: NonNullable<AskFilters["skill"]> }
  | { k: "popular" }
  | { k: "fill" };

/** A slot, and whether the words are Hinglish (the reply then is too). */
type Entry = Slot & { hi?: boolean };

const VOCAB = new Map<string, Entry>();
const add = (e: Entry, ...phrases: string[]) => phrases.forEach((p) => VOCAB.set(p, e));

add({ k: "sport", slug: "box-cricket" }, "box cricket", "boxcricket", "turf cricket", "cricket turf", "cricket turfs", "cage cricket");
add({ k: "sport", slug: "football" }, "football", "futsal", "soccer", "5 a side", "five a side", "7 a side", "seven a side");
// "Nets" and "practice" mean the practice nets (Cricket Nets, Indoor
// Cricket Net, Bowling Machine), not every cricket ground: the cricket
// slug also matches full grounds with no nets (Mumbai: 30 vs 8). Plain
// "cricket" could be either, so it goes to Claude.
add({ k: "sport", slug: "cricket-nets" }, "cricket nets", "cricket net", "nets", "practice nets", "net practice", "cricket practice", "bowling machine");
add({ k: "sport", slug: "cricket" }, "cricket ground", "cricket grounds");
add({ k: "sport", slug: "badminton" }, "badminton");
add({ k: "sport", slug: "pickleball" }, "pickleball", "pickle ball");
add({ k: "sport", slug: "volleyball" }, "volleyball");
add({ k: "sport", slug: "basketball" }, "basketball");
add({ k: "sport", slug: "tennis" }, "tennis", "lawn tennis");
add({ k: "sport", slug: "table-tennis" }, "table tennis");
add({ k: "sport", slug: "padel" }, "padel");
add({ k: "sport", slug: "swimming" }, "swimming", "swimming pool", "swimming pools");
add({ k: "venue" }, "turf", "turfs", "truf", "trufs", "ground", "grounds", "court", "courts", "cage", "cages", "venue", "venues", "arena", "arenas", "field", "fields", "place", "places");
add({ k: "near" }, "near me", "near to me", "nearby", "nearby me", "nearby to me", "near by", "near by me", "close by", "close to me", "around me", "near my location", "near my place", "near my home", "nearest", "nearest to me");
add({ k: "near", hi: true }, "mere paas", "paas me", "paas mein", "mere paas me", "mere paas mein", "aas paas");
add({ k: "time", time: "evening", when: "today" }, "tonight", "today night", "today evening", "this evening");
add({ k: "time", when: "today" }, "today");
add({ k: "time", when: "tomorrow" }, "tomorrow");
add({ k: "time", when: "weekend" }, "weekend", "this weekend", "the weekend", "saturday", "sunday", "this saturday", "this sunday");
add({ k: "time", when: "this_week" }, "this week");
add({ k: "time", time: "morning" }, "morning", "in the morning");
add({ k: "time", time: "afternoon" }, "afternoon", "in the afternoon");
add({ k: "time", time: "evening" }, "evening", "in the evening", "night", "at night");
add({ k: "time", time: "late_night" }, "late night", "midnight");
add({ k: "time", when: "today", hi: true }, "aaj");
add({ k: "time", time: "evening", when: "today", hi: true }, "aaj raat", "aaj raat ko", "aaj shaam");
add({ k: "time", time: "evening", hi: true }, "raat", "raat ko", "shaam", "shaam ko");
add({ k: "time", when: "tomorrow", hi: true }, "kal");
add({ k: "time", time: "morning", hi: true }, "subah");
add({ k: "cheap", cheapest: false }, "cheap", "budget friendly", "affordable", "low price", "low cost", "inexpensive", "economical");
add({ k: "cheap", cheapest: true }, "cheapest", "lowest price", "least expensive", "most affordable");
add({ k: "cheap", cheapest: false, hi: true }, "sasta", "saste", "sasti", "kam paise", "kam paise me", "kam daam", "kam price");
add({ k: "cheap", cheapest: true, hi: true }, "sabse sasta", "sabse saste", "sabse sasti", "sabse kam daam");
// A budget word must be followed by an amount ("budget" alone means cheap).
add({ k: "budget" }, "under", "below", "within", "less than", "upto", "up to", "max", "maximum", "budget");
add({ k: "o24" }, "24 hours", "24 hour", "24 hrs", "24 hr", "24hrs", "24hr", "24x7", "24 7", "24 by 7", "round the clock", "all night", "open late", "open all night");
add({ k: "need", need: "floodlights" }, "floodlights", "floodlight", "flood lights", "flood light", "floodlit", "lights", "lighting");
add({ k: "need", need: "parking" }, "parking", "car parking", "bike parking");
add({ k: "need", need: "washroom" }, "washroom", "washrooms", "toilet", "toilets", "restroom", "restrooms");
add({ k: "need", need: "changing_room" }, "changing room", "changing rooms");
add({ k: "need", need: "cafeteria" }, "cafeteria", "cafe", "canteen");
add({ k: "need", need: "covered" }, "covered", "indoor", "indoors", "roofed");
add({ k: "need", need: "equipment" }, "equipment", "equipment provided", "kit provided");
add({ k: "games" }, "game", "games", "match", "matches", "pickup", "pickup game", "pickup games", "anyone playing");
add({ k: "skill", skill: "beginner" }, "beginner", "beginners", "casual", "beginner friendly");
add({ k: "skill", skill: "intermediate" }, "intermediate");
add({ k: "skill", skill: "advanced" }, "advanced", "competitive");
add({ k: "popular" }, "popular", "most popular", "most reviewed");
add(
  { k: "fill" },
  "a", "an", "the", "for", "in", "at", "on", "of", "near", "around", "with", "and", "to", "from", "open", "only", "ones",
  "show", "show me", "find", "find me", "search", "search for", "list", "list of", "get", "get me", "give me", "for me",
  "any", "some", "all", "best", "good", "nice", "top", "top rated", "best rated", "highest rated",
  "please", "pls", "plz", "i", "want", "i want", "need", "i need", "looking for", "im looking for", "i am looking for",
  "can you", "can u", "could you", "let me", "which", "where", "is", "are", "there", "is there", "are there",
  "available", "book", "book me", "booking", "play", "to play", "want to play", "options", "bro", "bhai", "yaar",
  "rs", "inr", "rupees", "hour", "hr", "per hour", "an hour", "a hour", "hourly", "per hr",
);
add(
  { k: "fill", hi: true },
  "me", "mein", "hai", "hain", "kya", "hai kya", "koi", "dikhao", "dikha do", "dikhaiye", "dikhoa", "batao", "bata do",
  "chahiye", "thoda", "wala", "wale", "wali", "khelna", "khelna hai", "khelne", "ke liye", "ka", "ke", "ki", "hoon", "hu",
);

const titleCase = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

const CITY_WORDS = new Map<string, Slot>();
for (const c of CITIES) CITY_WORDS.set(norm(c.label), { k: "city", id: c.id, label: c.label });
// Aliases keep the name as typed: "Bengaluru" stays "Bengaluru" in the reply.
// One that names only part of a city ("Navi Mumbai" is not all of Mumbai) is left to Claude.
const PART_OF_CITY = new Set(["navi mumbai", "thane", "new delhi", "secunderabad"]);
for (const [alias, id] of Object.entries(CITY_ALIASES)) {
  CITY_WORDS.set(norm(alias), PART_OF_CITY.has(alias) ? { k: "clash" } : { k: "city", id, label: titleCase(alias), alias: true });
}

/**
 * Cities and areas by spelling. An area named after its own city
 * ("Gurgaon" in Gurgaon) reads as the city; one named after another
 * city ("Nanded" in Pune) or after an alias ("Thane" in Mumbai, which
 * is part of it, not all of it) is a clash, left to Claude.
 */
const placeMemo = new WeakMap<Record<string, string[]>, Map<string, Slot>>();
function placesFor(areas: Record<string, string[]>): Map<string, Slot> {
  const hit = placeMemo.get(areas);
  if (hit) return hit;
  const m = new Map<string, Slot>(CITY_WORDS);
  for (const [city, list] of Object.entries(areas)) {
    for (const name of list) {
      const key = norm(name);
      if (!key || VOCAB.has(key)) continue;
      const cur = m.get(key);
      if (!cur) m.set(key, { k: "area", name, cities: [city] });
      else if (cur.k === "area") {
        if (!cur.cities.includes(city)) cur.cities.push(city);
      } else if (!(cur.k === "city" && !cur.alias && cur.id === city)) m.set(key, { k: "clash" });
    }
  }
  placeMemo.set(areas, m);
  return m;
}

/** Lower case words, "1,000" as 1000, "₹" dropped, "5-a-side" as "5 a side". */
function words(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[’‘]/g, "")
    .replace(/(\d),(?=\d)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

const MAX_PHRASE = 6;

/** Every word read as a slot, or null when any word is not understood. */
function read(ws: string[], places: Map<string, Slot>): { slots: Entry[]; max: number | null } | null {
  const slots: Entry[] = [];
  let max: number | null = null;
  for (let i = 0; i < ws.length; ) {
    let hit: Entry | undefined;
    let len = 0;
    for (let n = Math.min(MAX_PHRASE, ws.length - i); n >= 1 && !hit; n--) {
      const key = ws.slice(i, i + n).join(" ");
      hit = VOCAB.get(key) ?? places.get(key);
      len = n;
    }
    if (!hit || hit.k === "clash") return null;
    // "Football turf near" with nothing after it means near me: left to Claude.
    if (len === 1 && ws[i] === "near" && i === ws.length - 1) return null;
    i += len;
    if (hit.k === "budget") {
      // "under 1000", "under rs 800", "under 1k", "budget 1200".
      if (ws[i] === "rs" || ws[i] === "inr") i++;
      const m = /^(\d{2,5})(k?)$/.exec(ws[i] ?? "");
      if (m) {
        const v = Number(m[1]) * (m[2] ? 1000 : 1);
        if (v < 100 || v > 20000 || max != null) return null;
        max = v;
        i++;
        continue;
      }
      if (ws[i - 1] !== "budget") return null;
      slots.push({ k: "cheap", cheapest: false });
      continue;
    }
    slots.push(hit);
  }
  return { slots, max };
}

const blank = (): AskFilters => ({
  intent: "find_turf",
  tool: null,
  city: null,
  sport: null,
  areas: [],
  turf_names: [],
  question: null,
  max_price_per_hour: null,
  min_rating: null,
  time: null,
  when: null,
  skill: null,
  open_24x7: false,
  wants_nearby: false,
  players: null,
  needs: [],
  sort: "rating",
  free_text: null,
  summary: "",
  reply: "",
  followups: [],
});

const knownCity = (id: string | null | undefined): CityId | null => (id && CITY_IDS.includes(id) ? id : null);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// ── Greetings, thanks, tools, hosting, compare ─────────────────────

const ABILITIES = "I can find you a turf, look for a pickup game, compare two venues, or answer a question about one.";

const SMALL_TALK: [string[], string, (onTurf: boolean) => string][] = [
  [
    ["hi", "hii", "hiii", "hello", "helo", "hey", "hey there", "hi there", "hello there", "hola", "yo", "good morning", "good afternoon", "good evening", "hi tapturf", "hey tapturf", "hello tapturf"],
    "Just saying hi",
    (onTurf) => (onTurf ? "Hey, good to see you. I can tell you about this turf, compare it with another venue, or find other turfs and games." : `Hey, good to see you. ${ABILITIES}`),
  ],
  [
    ["namaste", "namaskar", "namaste ji"],
    "Just saying hi",
    () => "Namaste. Main aapke liye turf ya game dhoondh sakta hoon, do venues compare kar sakta hoon, ya kisi ek venue ke baare mein bata sakta hoon.",
  ],
  [
    ["how are you", "hey how are you", "hi how are you", "hello how are you", "how r u", "how are u", "hows it going", "how is it going", "whats up", "sup"],
    "Just saying hi",
    () => "Doing well, thanks for asking. I can find you a turf, look up a game to join, compare two venues, or answer a question about one.",
  ],
  [
    ["thanks", "thank you", "thanks a lot", "thank u", "thx", "ty", "thanks bro", "thank you so much", "dhanyavad", "shukriya"],
    "Just saying thanks",
    () => "Anytime, happy to help. Want me to find you a turf or a game?",
  ],
  [["ok", "okay", "ok thanks", "okay thanks", "cool", "alright", "got it"], "Just an acknowledgement", () => `Sounds good. ${ABILITIES}`],
];

type ToolSlug = NonNullable<AskFilters["tool"]>;
/** The Live Scoreboard's sports as players type them. */
const BOARD_SPORT_WORDS = ["football", "futsal", "basketball", "volleyball", "badminton", "pickleball", "tennis", "table tennis", "padel"];
const TOOLS: [ToolSlug, string[], string, string][] = [
  [
    "cricket-nrr-calculator",
    ["calculate our nrr", "calculate nrr", "calculate my nrr", "nrr", "nrr calculator", "net run rate", "net run rate calculator", "calculate net run rate", "calculate our net run rate", "how to calculate nrr", "how is nrr calculated", "what is nrr", "what is net run rate"],
    "Calculate net run rate",
    "TapTurf has a free NRR calculator for exactly this, no sign-in needed. Enter runs and overs for both sides, and it reads overs the cricket way, so 5.3 is five overs and three balls.",
  ],
  [
    "cricket-toss",
    ["toss", "toss karo", "toss karo yaar", "toss kar do", "do the toss", "cricket toss", "coin toss", "toss a coin", "flip a coin", "coin flip", "heads or tails"],
    "Coin toss for the match",
    "TapTurf has a free cricket toss tool for exactly this, no sign-in needed. Call heads or tails, flip, and the winner picks bat or bowl.",
  ],
  [
    "cricket-team-generator",
    ["divide players into teams", "divide into teams", "divide teams", "split players into teams", "split into teams", "make teams", "make two teams", "random teams", "balanced teams", "pick teams", "team generator", "team banao", "teams banao"],
    "Split players into teams",
    "TapTurf has a free team generator for exactly this, no sign-in needed. Enter your players and it splits them into teams.",
  ],
  [
    "cricket-scorecard-maker",
    ["scorecard", "make a scorecard", "make scorecard", "create a scorecard", "scorecard maker", "match scorecard", "result card", "make a result card"],
    "Make a match scorecard",
    "TapTurf has a free scorecard maker for exactly this, no sign-in needed. Add the scores and result, then download it or share it on WhatsApp.",
  ],
  [
    "cricket-live-scorer",
    [
      "live score", "live scorer", "live scoring", "live cricket scorer", "live score our match", "ball by ball", "ball by ball scorer", "ball by ball scoring", "ball by ball score",
      "score our match", "score my match", "score the match", "score a match", "scoring app", "cricket scoring app", "cricket scorer", "score counter", "cricket score counter", "box cricket score counter",
    ],
    "Score a match ball by ball",
    "TapTurf has a free live scorer for exactly this, no sign-in needed. One tap a ball, and the scorecard, run rate and overs keep themselves up to date.",
  ],
  [
    // A sport named with a score word; a plain "live score" or "score counter" stays with cricket above.
    "live-scoreboard",
    [
      ...BOARD_SPORT_WORDS.flatMap((s) => [`${s} score`, `${s} scorer`, `${s} score counter`, `${s} scoreboard`, `${s} score board`, `${s} scoring app`]),
      "scoreboard", "score board", "live scoreboard", "scoreboard app", "score keeper", "scorekeeper",
      "keep score", "keep the score", "keep score of our game", "keep score of the game", "keep score of any sport", "keep score for any sport",
    ],
    "Keep score of a game",
    "TapTurf has a free live scoreboard for exactly this, no sign-in needed. One tap a point or a goal, and the sets, halves and clock keep themselves up to date.",
  ],
  [
    "cricket-tournament-scorer",
    ["points table", "make a points table", "points table maker", "tournament scorer", "track our tournament", "track my tournament", "league table"],
    "Track a tournament points table",
    "TapTurf has a free series and tournament scorer for exactly this, no sign-in needed. Add each match and it keeps the points table and NRR.",
  ],
];
const TOOL_ASKS: Record<ToolSlug, string> = {
  "cricket-nrr-calculator": "Calculate our NRR",
  "cricket-toss": "Toss for who bats first",
  "cricket-team-generator": "Divide players into teams",
  "cricket-scorecard-maker": "Make a scorecard",
  "cricket-live-scorer": "Score our match live",
  "live-scoreboard": "Keep score of any sport",
  "cricket-tournament-scorer": "Make a points table",
};
/** Tools to offer first after a hit, so the two scorers point at each other; the rest follow in TOOL_ASKS order. */
const NEXT_TOOLS: Partial<Record<ToolSlug, ToolSlug[]>> = {
  "cricket-live-scorer": ["live-scoreboard"],
  "live-scoreboard": ["cricket-team-generator", "cricket-live-scorer"],
};

const COMPARE_ANY = new Set(["compare two turfs", "compare two venues", "compare two grounds", "compare 2 turfs", "compare 2 venues", "compare turfs", "compare venues"]);

/** "Host a game Saturday 7pm": the host words, then only days, times and sports. */
const HOST = /^(?:host|create|organise|organize|set up|setup|start|plan) (?:a |an |my |our )?(?:new )?(?:game|match)(?: (.*))?$/;
const HOST_WORDS = new Set(
  "on at for this next today tonight tomorrow weekend monday tuesday wednesday thursday friday saturday sunday morning afternoon evening night am pm box cricket football futsal badminton pickleball tennis basketball volleyball".split(" "),
);
const hostTail = (tail: string) => tail.split(" ").every((w) => HOST_WORDS.has(w) || /^\d{1,2}(?:[ap]m)?$/.test(w));

function smallTalk(key: string, query: string, ctx: QuickContext): AskFilters | null {
  for (const [phrases, summary, reply] of SMALL_TALK) {
    if (!phrases.includes(key)) continue;
    // No follow-ups: the route offers this city's own chips instead.
    return { ...blank(), intent: "other", city: knownCity(ctx.city), summary, reply: reply(!!ctx.turf) };
  }
  for (const [slug, phrases, summary, reply] of TOOLS) {
    if (!phrases.includes(key)) continue;
    const next = [...(NEXT_TOOLS[slug] ?? []), ...(Object.keys(TOOL_ASKS) as ToolSlug[])];
    const followups = next.filter((s, i) => s !== slug && next.indexOf(s) === i).slice(0, 3).map((s) => TOOL_ASKS[s]);
    return { ...blank(), intent: "tool", tool: slug, summary, reply, followups };
  }
  if (COMPARE_ANY.has(key)) {
    return { ...blank(), intent: "compare", summary: "Compare two venues", reply: "Sure, which two? Type both names with vs in between and I'll put them side by side." };
  }
  const host = HOST.exec(key);
  if (host && (!host[1] || hostTail(host[1]))) {
    return {
      ...blank(),
      intent: "create_game",
      city: knownCity(ctx.city),
      summary: cap(query.trim().replace(/[?.!]+$/, "")),
      reply: "Let's set that up. Tap below and check the details.",
      followups: ["Find a turf nearby", "Open games this weekend"],
    };
  }
  return null;
}

/** "Hindu Gymkhana vs Vedant Sports Academy": both names must be venues we list. */
function compareNames(query: string, data: QuickData, ctx: QuickContext): AskFilters | null {
  const raw = query.trim().replace(/[?.!]+$/, "");
  const parts =
    /^(?:compare\s+)?(.+?)\s+(?:vs\.?|v\/s|versus)\s+(.+)$/i.exec(raw) ?? /^compare\s+(.+?)\s+(?:and|with|&)\s+(.+)$/i.exec(raw);
  if (!parts) return null;
  const names = [parts[1].trim(), parts[2].trim()];
  const places = placesFor(data.areas);
  for (const n of names) {
    const w = words(n);
    // A side made only of words we know ("Pune", "football turf") is not a venue name.
    if (n.length < 2 || n.length > 60 || !w.length || read(w, places)) return null;
  }
  const hits = resolveTurfNames(data.turfs, names, ctx.prefCity ?? null);
  const turfs = hits.map((h) => h.turf);
  if (!turfs[0] || !turfs[1] || turfs[0].id === turfs[1].id) return null;
  // The typed name must be how the venue's name starts (a chip is the first words of it).
  const starts = (t: Turf, typed: string) => {
    const a = norm(t.name);
    const b = norm(typed);
    return a === b || a.startsWith(`${b} `);
  };
  if (!starts(turfs[0], names[0]) || !starts(turfs[1], names[1])) return null;
  const shared = turfs[0].city === turfs[1].city ? knownCity(turfs[0].city) : null;
  return {
    ...blank(),
    intent: "compare",
    city: shared ?? knownCity(ctx.city),
    turf_names: names,
    summary: `${names[0]} vs ${names[1]}`,
    reply: "Let me put those two side by side.",
    followups: ["Which one has floodlights", "Any games there this weekend"],
  };
}

// ── Find a turf, find a game ───────────────────────────────────────

const TIME_WORDS: Record<NonNullable<AskFilters["time"]>, string> = { morning: "morning", afternoon: "afternoon", evening: "evening", late_night: "late night" };

/** For a summary or a games reply: "tonight", "tomorrow morning", "this weekend", "in the evening". */
function atWords(when: AskFilters["when"], time: AskFilters["time"]): string {
  if (when === "today" && time === "evening") return "tonight";
  if (when === "today") return !time ? "today" : time === "late_night" ? "late tonight" : `this ${TIME_WORDS[time]}`;
  if (when === "tomorrow") return time ? `tomorrow ${TIME_WORDS[time]}` : "tomorrow";
  if (when === "weekend") return time ? `weekend ${TIME_WORDS[time]}s` : "this weekend";
  if (when === "this_week") return "this week";
  return !time ? "" : time === "late_night" ? "late at night" : `in the ${TIME_WORDS[time]}`;
}

/** For a turf reply: "for tonight", "for the weekend", "for the evening". */
function forWords(when: AskFilters["when"], time: AskFilters["time"]): string {
  if (when === "weekend" && !time) return " for the weekend";
  if (!when && time) return time === "late_night" ? " for late night" : ` for the ${TIME_WORDS[time]}`;
  const at = atWords(when, time);
  return at ? ` for ${at}` : "";
}

/** "box cricket turfs", "badminton courts", "turfs"; singular for Hinglish. */
function venues(sport: SportPage | undefined, plural = true): string {
  if (!sport) return plural ? "turfs" : "turf";
  if (sport.slug === "cricket") return plural ? "cricket grounds and nets" : "cricket ground";
  return `${sport.name.toLowerCase()} ${sport.venue}${plural ? "s" : ""}`;
}

const NEED_WORDS: Record<Need, string> = {
  floodlights: "floodlights",
  parking: "parking",
  washroom: "washrooms",
  changing_room: "changing rooms",
  cafeteria: "a cafeteria",
  covered: "cover",
  equipment: "equipment provided",
};

function findAnswer(query: string, data: QuickData, ctx: QuickContext): AskFilters | null {
  const got = read(words(query), placesFor(data.areas));
  if (!got) return null;
  const { slots } = got;
  const of = <K extends Slot["k"]>(k: K) => slots.filter((s): s is Extract<Entry, { k: K }> => s.k === k);

  const sports = [...new Set(of("sport").map((s) => s.slug))];
  const cities = [...new Set(of("city").map((s) => s.id))];
  const areas = of("area");
  if (sports.length > 1 || cities.length > 1 || new Set(areas.map((a) => a.name)).size > 1) return null;
  const sport = sports[0] ? sportBySlug(sports[0]) : undefined;
  const near = of("near").length > 0;
  const hi = slots.some((s) => s.hi);

  // The place: one city, or one area (and its city, when every area by
  // that name is in one city), or near me. None: the page's city.
  let city: string | null = cities[0] ?? null;
  let place: string | null = city ? of("city")[0].label : null;
  const area = areas[0];
  if (area) {
    if (near || (city && !area.cities.includes(city)) || (!city && area.cities.length > 1)) return null;
    // An area we only list in another city than the page's ("MIDC" on the
    // Sambhajinagar page): Claude is told the page, so it decides.
    if (!city && ctx.city && !area.cities.includes(ctx.city)) return null;
    city = city ?? area.cities[0];
    place = area.name;
  }
  if (near && place) return null;

  const times = of("time");
  const when = [...new Set(times.map((t) => t.when).filter((w) => w != null))];
  const time = [...new Set(times.map((t) => t.time).filter((t) => t != null))];
  if (when.length > 1 || time.length > 1) return null;
  const needs = [...new Set(of("need").map((n) => n.need))];
  const cheap = of("cheap");
  const cheapest = cheap.some((c) => c.cheapest);
  const o24 = of("o24").length > 0;
  const skills = [...new Set(of("skill").map((s) => s.skill))];
  const popular = of("popular").length > 0;
  // "Cheap" alone means ₹800 an hour; "cheapest" only sorts.
  const max = got.max ?? (cheap.some((c) => !c.cheapest) ? 800 : null);
  const priceLow = max != null || cheapest;

  const f = blank();
  f.city = place ? knownCity(city) : knownCity(ctx.city);
  f.sport = sport?.slug ?? null;
  f.areas = area ? [area.name] : [];
  f.wants_nearby = near;
  f.when = when[0] ?? null;
  f.time = time[0] ?? null;
  const at = atWords(f.when, f.time);
  const where = place ? ` in ${place}` : near ? " close to you" : "";

  if (of("games").length) {
    // Games: sport, city or near me, when, skill. Budgets, features and areas are for turfs.
    if (hi || area || needs.length || cheap.length || max != null || o24 || popular || of("venue").length || skills.length > 1) return null;
    f.intent = "find_game";
    f.skill = skills[0] ?? null;
    f.sort = near ? "nearby" : "rating";
    const what = `${sport ? sport.name.toLowerCase() : "open"}${f.skill ? ` ${f.skill}` : ""} games`;
    f.summary = cap(`${what}${place ? ` in ${place}` : near ? " near you" : ""}${at ? ` ${at}` : ""}.`);
    f.reply = `Here are ${what}${where}${at ? ` ${at}` : ""}, ${near ? "nearest" : "soonest"} first.`;
    f.followups = [f.skill ? "Only evening games" : "Beginner friendly ones", f.when === "weekend" ? "Any games today" : "Only this weekend", "Host a game"];
    return f;
  }
  // A turf search needs a sport or a place to go on.
  if (skills.length || (!sport && !place && !near)) return null;

  f.max_price_per_hour = max;
  f.open_24x7 = o24;
  f.needs = needs;
  f.sort = priceLow ? "price_low" : popular ? "reviews" : near ? "nearby" : "rating";
  const kind = `${needs.includes("covered") ? "covered " : ""}${venues(sport)}`;
  const extras = needs.filter((n) => n !== "covered").map((n) => NEED_WORDS[n]);
  const withs = `${o24 ? " open 24 hours" : ""}${extras.length ? ` with ${extras.join(" and ")}` : ""}`;
  const budget = max != null ? ` under ${rupees(max)} an hour` : "";
  const lead = got.max == null && max != null ? "cheap " : cheapest && max == null ? "cheapest " : "";
  f.summary = cap(`${lead}${kind}${withs}${place ? ` in ${place}` : near ? " near you" : ""}${budget}${at ? ` ${at}` : ""}.`);

  if (hi) {
    // Hinglish replies for the simple shapes; anything richer goes to Claude.
    if (needs.length || o24 || got.max != null || popular || (f.time && f.time !== "evening") || f.when === "weekend" || f.when === "this_week") return null;
    const timeHi = f.when === "today" ? (f.time ? " aaj raat ke liye" : " aaj ke liye") : f.when === "tomorrow" ? " kal ke liye" : f.time ? " raat ke liye" : "";
    const sortHi = priceLow ? "sabse kam daam wale pehle" : near ? "sabse paas wale pehle" : "sabse achhi rating wale pehle";
    f.reply = cap(`${place ? `${place} me` : near ? "Aapke paas" : ""}${timeHi} ${priceLow ? "saste " : ""}${venues(sport, false)} ye rahe, ${sortHi}.`.trim());
    f.followups = [priceLow ? "Best rating wale" : "Aur saste wale", "24 ghante khule wale", "Weekend pe koi game hai"];
    return f;
  }
  const order =
    f.sort === "price_low" ? "cheapest first" : f.sort === "reviews" ? "most reviewed first" : f.sort === "nearby" ? "nearest first" : f.time === "evening" ? "lit grounds first" : "best rated first";
  f.reply = `Here are ${kind}${withs}${where}${budget}${forWords(f.when, f.time)}, ${order}.`;
  f.followups = [priceLow ? "Best rated ones" : "Cheaper ones", o24 ? "With floodlights" : "Only 24 hours", "Any games there this weekend"];
  if (o24 && needs.includes("floodlights")) f.followups[1] = "Compare the top two";
  return f;
}

/**
 * Filters and a reply for a fresh question, or null to ask Claude.
 * `query` is the player's text as the route trimmed it (at most 160 chars).
 */
export function quickAnswer(query: string, data: QuickData, ctx: QuickContext = {}): AskFilters | null {
  // Devanagari, emoji and other scripts go to Claude.
  if (/[^\x20-\x7E₹’‘]/.test(query)) return null;
  const ws = words(query);
  if (!ws.length || ws.length > 16) return null;
  return smallTalk(ws.join(" "), query, ctx) ?? compareNames(query, data, ctx) ?? findAnswer(query, data, ctx);
}
