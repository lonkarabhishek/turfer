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

export type LiveAskKind = "need" | "rate" | "partnership" | "over" | "batting" | "bowling" | "wickets" | "result" | "overs" | "time" | "score" | "updated" | "teams" | "summary";

// A turf or game search typed on the page: on to the usual search. Not when it points at this match.
const SEARCH = /\b(near me|nearby|near by|book|booking|slots?|host|hosting|cheapest|sasta|per hour|open games|join (a|the|any) game|turfs?|courts? (in|near|around)|grounds? (in|near|around)|find (a |me |some )?(grounds?|courts?|venues?|games?|players?))\b/;
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

/** What a message on a live page asks: one of the usual questions, a search (the usual Ask answers it), or other (the model, from the facts). */
export function liveAskKind(q: string): LiveAskKind | "search" | "other" {
  const t = normAsk(q);
  if (SEARCH.test(t) && !THIS_MATCH.test(t)) return "search";
  for (const [kind, re] of KINDS) if (re.test(t)) return kind;
  return "other";
}

/** The chips under an answer: this match's, without the one just asked, three at most. */
export function liveFollowups(chips: string[], q: string): string[] {
  const asked = normAsk(q).replace(/[?.!]+$/, "");
  return chips.filter((c) => normAsk(c).replace(/[?.!]+$/, "") !== asked).slice(0, 3);
}
