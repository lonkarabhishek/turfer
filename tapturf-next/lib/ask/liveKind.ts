import { LIVE_CODE_RE } from "../live/types";

/**
 * Ask TapTurf on a live score page, the light half (lib/ask/live.ts has
 * the facts and answers): the live code in Ask's context, the sign-in
 * rule there, and what a message asks. No scoring engine, so the chat
 * that every page loads can read a message without carrying one.
 */

/* ------------------------------------------------------------------ */
/* The context and the sign-in rule                                    */
/* ------------------------------------------------------------------ */

/** The live link code a page sent in Ask's ctx, or null: never anything that isn't one. */
export function liveCodeOf(raw: unknown): string | null {
  return typeof raw === "string" && LIVE_CODE_RE.test(raw) ? raw : null;
}

/** On a live page (a code), asking takes a signed-in account: sign_in without one. none: not a live page, nothing changes. */
export function liveAskGate(code: string | null, userId: string | null): "none" | "sign_in" | "live" {
  if (!code) return "none";
  return userId ? "live" : "sign_in";
}

/* ------------------------------------------------------------------ */
/* Reading the question                                                */
/* ------------------------------------------------------------------ */

/** player: a question naming one of this match's players (lib/ask/live.ts liveAnswerKind), answered from that player's lines. */
export type LiveAskKind = "need" | "rate" | "partnership" | "over" | "batting" | "bowling" | "wickets" | "result" | "overs" | "time" | "score" | "updated" | "teams" | "summary" | "player";

// A turf or game search typed on the page: on to the usual search. Not when it points at this match.
// "games" alone is a board's unit ("any games left in this set"), so only with a sport, a place or a day.
const SPORT = "football|cricket|badminton|pickleball|volleyball|basketball|tennis|futsal|open";
const SEARCH = new RegExp(
  `\\b(near me|nearby|near by|book|booking|slots?|host|hosting|cheap|cheaper|cheapest|sasta|budget|affordable|per hour|pick-?up|join|is there (a|any) game|any (${SPORT}) games|(${SPORT}) games|any (\\w+ )?games (in|near|around|at|on|for|this|next|today|tonight|tomorrow)|where (can|do|should|to) (i |we )?play|(need|needs|needed|want|wanted|looking for) \\d+ (more )?players?|players? (needed|wanted|required)|for \\d+ players|turfs?|courts? (in|near|around)|grounds? (in|near|around)|find (a |me |some )?(grounds?|courts?|venues?|games?|players?))\\b`,
);
// A day or time with a game, playing or a venue ("cricket game tomorrow", "where to play tonight"): a search for one.
const WHEN = /\b(tonight|tomorrow|tmrw|today|weekend|this (morning|afternoon|evening|week)|next week|(mon|tues|wednes|thurs|fri|satur|sun)days?|\d{1,2} ?(am|pm))\b/;
const TO_PLAY = /\b(games?|(to|can|could|i|we) play|turfs?|grounds?|courts?|slots?|venues?)\b/;
const THIS_MATCH = /\b(this|the) (match|game|scorecard|innings)\b|\bscore\b/;

/** Asks who will win: never answered with a guess, only with how it stands. */
export const PREDICT = /\b(who will win|going to win|gonna win|predict|prediction|chances?|favou?rites?)\b/;

// In order: the first that matches is the question. "Required rate" before "run rate", "is it over" before overs.
const KINDS: [LiveAskKind, RegExp][] = [
  ["result", new RegExp(`${PREDICT.source}|\\b(is it|is the (match|game)|match|game) (over|finished|done|khatam)\\b|\\bover yet\\b`)],
  ["need", /\b(need|needs|needed|required|require|requires|target|chasing|chase|asking rate|rrr|req (run )?rate|chahiye|chahie|baki|baaki|how many (more )?(runs? )?(to|for) (win|go))\b/],
  ["rate", /\b(run ?rate|crr|current rate|scoring rate)\b/],
  ["partnership", /\b(partnership|stand)\b/],
  ["over", /\b(this over|last over|current over|that over|last ball|last few balls|recent balls|last delivery|is over (me|mein)|pichla over)\b/],
  ["batting", /\b(batting|batter|batters|batsman|batsmen|on strike|striker|crease|who'?s in|who is in|top scorer|highest scorer|most runs|khel raha|khel rahe)\b/],
  ["bowling", /\b(bowling|bowler|bowlers|who'?s bowling|figures|best bowling|most wickets|daal raha|dal raha|ball daal)\b/],
  ["wickets", /\b(wickets?|wkts?|out|outs|dismissed|gire|fall of wickets?|fow)\b/],
  ["result", /\b(won|win|wins|winner|winning|result|kaun jeeta|kon jeeta|kaun jita|kon jita|jeeta|jeeti|jeet|leads?|leading|ahead|behind|draw|drawn|tied?|finished|khatam)\b/],
  ["overs", /\b(overs?|balls? (left|remaining)|how many balls|kitne over|kitne ball)\b/],
  ["time", /\b(time|clock|minutes?|how long|half|quarter|period|kitna time)\b/],
  ["score", /\b(score|scores|scorecard|scoreline|kitna hua|kitne hue|kya hua|kitna hai|runs?|total|points?|goals?|sets?|games?)\b/],
  ["updated", /\b(updated?|updating|last update|latest|refresh|still (live|on|going)|is it live|live now|kab)\b/],
  ["teams", /\b(teams?|who'?s playing|who is playing|which teams|vs|versus|venue|where|ground|title|tournament|format)\b/],
  ["summary", /\b(summary|summari[sz]e|recap|happening|kya chal raha|situation|status|how'?s it going|how is it going|update me|tell me about|kaisa chal|kaisa hai)\b/],
];

/** Lower case, curly quotes straight, spaces single. */
export const normAsk = (q: string) => q.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const placesMemo = new WeakMap<object, RegExp | null>();

/**
 * The places a message may name for a search: the turf areas per city
 * (lib/ai/ask.ts areasFromTurfs, memoised per turf list, so this is too)
 * and the cities, after in, near, around, at or from ("games in Baner").
 */
export function livePlaces(areas: Record<string, string[]>, cities: readonly string[]): RegExp | null {
  if (placesMemo.has(areas)) return placesMemo.get(areas)!;
  const names = [...new Set([...Object.values(areas).flat(), ...cities].map(normAsk).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  const re = names.length ? new RegExp(`\\b(in|near|around|at|from) (${names.map(escapeRe).join("|")})\\b`) : null;
  placesMemo.set(areas, re);
  return re;
}

/** This match's names, never read as a search: its teams, title and venue as whole names, its players by every word of theirs. */
export type LiveOwnNames = { own?: readonly string[]; players?: readonly string[] };

/** The message with this match's own names blanked out ("_"), so they are not read as a place, a turf or a day. */
function withoutOwnNames(t: string, names: LiveOwnNames): string {
  const whole = [...(names.own ?? []), ...(names.players ?? [])].map(normAsk).filter((n) => n.length >= 3).sort((a, b) => b.length - a.length);
  const words = new Set((names.players ?? []).flatMap((n) => normAsk(n).split(/[^a-z0-9]+/)).filter((w) => w.length >= 3));
  let out = t;
  for (const n of whole) out = out.replace(new RegExp(`(^|[^a-z0-9])${escapeRe(n)}(?![a-z0-9])`, "g"), "$1_");
  return words.size ? out.replace(/[a-z0-9]+/g, (w) => (words.has(w) ? "_" : w)) : out;
}

/**
 * What a message on a live page asks: one of the usual questions, a search
 * (the usual Ask answers it), or other (the model, from the facts). A
 * search says so ("near me", "book", "pickup games"), or names a day with
 * a game or a venue ("cricket game tomorrow"), or a place the caller knows
 * (places: "in Baner"). own and players: this match's names
 * (LiveOwnNames), never read as a search: "Turf Kings" are a team,
 * "Baner Blasters" not a place, Sagar a player and not the town.
 */
export function liveAskKind(q: string, opts: { places?: RegExp | null } & LiveOwnNames = {}): LiveAskKind | "search" | "other" {
  const t = normAsk(q);
  const bare = withoutOwnNames(t, opts);
  if (!THIS_MATCH.test(t) && (SEARCH.test(bare) || (WHEN.test(bare) && TO_PLAY.test(bare)) || !!opts.places?.test(bare))) return "search";
  for (const [kind, re] of KINDS) if (re.test(t)) return kind;
  return "other";
}

const SEARCH_INTENTS: ReadonlySet<string> = new Set(["find_turf", "find_game", "compare", "create_game", "tool"]);

/**
 * Whether the quick reader's reading (lib/ai/quick.ts quickAnswer, its
 * intent or null) sends a message on a live page on to the usual Ask: for
 * a message about nothing in the match ("Calculate our NRR"), any reading
 * it has; for one of the usual questions, only a search, a comparison, a
 * host or a tool, and never one pointing at this match.
 */
export function liveGoesOn(q: string, asked: LiveAskKind | "other", quickIntent: string | null): boolean {
  if (!quickIntent || quickIntent === "other") return false;
  return asked === "other" || (SEARCH_INTENTS.has(quickIntent) && !THIS_MATCH.test(normAsk(q)));
}

/** The chips under an answer: this match's, without the one just asked, three at most. */
export function liveFollowups(chips: string[], q: string): string[] {
  const asked = normAsk(q).replace(/[?.!]+$/, "");
  return chips.filter((c) => normAsk(c).replace(/[?.!]+$/, "") !== asked).slice(0, 3);
}
