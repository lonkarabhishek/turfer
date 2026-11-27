import { TOURNAMENT_CODE_RE } from "../tournament/types";
import { PREDICT, liveAskGate, liveAskKind, normAsk, type LiveOwnNames } from "./liveKind";

/**
 * Ask TapTurf on a tournament's page (/tournament/<code>), the light half
 * (lib/ask/tournament.ts has the facts, the answers and the guard): the
 * tournament's code in Ask's context, the sign-in rule there, what a
 * message asks, and the chips. No scoring engine, so the chat that every
 * page loads, and the tournament page itself, can use it without carrying
 * one.
 */

/* ------------------------------------------------------------------ */
/* The context and the sign-in rule                                    */
/* ------------------------------------------------------------------ */

/** The tournament code a page sent in Ask's ctx, or null: never anything that isn't shaped like one. */
export function tournamentCodeOf(raw: unknown): string | null {
  return typeof raw === "string" && TOURNAMENT_CODE_RE.test(raw) ? raw : null;
}

/** On a tournament's page asking takes a signed-in account, exactly as on a live score page (liveAskGate). none: not a tournament page. */
export function tournamentAskGate(code: string | null, userId: string | null): "none" | "sign_in" | "tournament" {
  const gate = liveAskGate(code, userId);
  return gate === "live" ? "tournament" : gate;
}

/* ------------------------------------------------------------------ */
/* Reading the question                                                */
/* ------------------------------------------------------------------ */

/**
 * The usual questions, each answered in code (lib/ask/tournament.ts
 * tournamentReply). team, player, squad and match are picked once the
 * tournament is known (tournamentAnswerKind): a question naming a team, a
 * player or one match.
 */
export type TournamentAskKind =
  | "leader"
  | "table"
  | "champion"
  | "playoffs"
  | "result"
  | "results"
  | "score"
  | "match"
  | "moments"
  | "potm"
  | "topScorer"
  | "topBowler"
  | "highest"
  | "bestBowling"
  | "sixes"
  | "fours"
  | "teamTotal"
  | "bigWin"
  | "next"
  | "left"
  | "live"
  | "nrr"
  | "about"
  | "team"
  | "player"
  | "squad"
  | "hello";

// Points at this tournament, so never a search: "any matches tomorrow" is a fixture here, "games near me" is not.
const THIS_TOURNAMENT = /\b(this|the|next|last|which|what|any|all|how many) (tournament|league|series|cup|table|final|semi[- ]?finals?|match|matches)\b|\b(fixtures?|points table|standings|nrr|net run ?rate)\b/;

// In order: the first that matches is the question. The narrow ones first: "most wickets" before "wickets", "highest total" before "highest score".
const KINDS: [TournamentAskKind, RegExp][] = [
  ["hello", /^(hi+|hello+|hey+|yo|namaste|namaskar|good (morning|afternoon|evening)|thanks?( a lot)?|thank you( so much)?|thx|shukriya|dhanyavaa?d|ok(ay)? thanks?)[ .!]*$/],
  ["moments", /\b(key moments?|highlights?|commentary|ball by ball|turning point|turned|what happened in|recap|last over|how did (the|that|this) (match|game|final|chase) go)\b/],
  ["potm", /\b((player|man|woman|men|women)s? of the (match|tournament|series|final)|potm|motm|mom|mvp)\b/],
  ["nrr", /\b(nrr|net run ?rate|run ?rate)\b/],
  ["sixes", /\b(six|sixes|sixers?|maximums?|chhakk?e|chakke)\b/],
  ["fours", /\b(fours|4s|boundaries|chauke|chaukke)\b/],
  ["bestBowling", /\b(best bowling|best figures|bowling figures|best spell)\b/],
  ["topBowler", /\b(most wickets|took (the )?most|top wicket ?takers?|wicket ?takers?|highest wicket ?takers?|leading wicket ?takers?|purple cap|best bowlers?|top bowlers?|sabse zyada wickets?)\b/],
  ["teamTotal", /\b(highest (team )?total|highest team score|biggest total|biggest team score|most runs by a team|team totals?)\b/],
  ["highest", /\b(highest (individual )?score|highest innings|best score|best knock|biggest knock|top score)\b/],
  ["topScorer", /\b(top ?scorers?|highest (run ?)?scorers?|most runs|scored (the )?most|maximum runs|leading (run ?)?scorers?|orange cap|top run ?getters?|best batters?|best batsm[ae]n|top batters?|top batsm[ae]n|sabse zyada runs?)\b/],
  ["bigWin", /\b(biggest win|largest win|biggest margin|largest margin|widest margin|biggest victory|largest victory)\b/],
  ["leader", PREDICT],
  ["champion", /\b(champions?|won the (tournament|title|cup|league|series|trophy)|winner of the (tournament|cup|league|series)|tournament winner|series winner|who won it|the title|trophy)\b/],
  ["playoffs", /\b(playoffs?|qualif(y|ies|ied|ying|ication)|semi[- ]?finalists?|finalists?|knockouts?|bracket|who (is|are|was|were|goes|go|went|got|made|reached) (in|into|through|it)?.{0,12}(semi|final))/],
  ["left", /\b(how many (matches|games) (are |have been |were )?(left|remaining|to go|played|done|over)|(matches|games) (are )?(left|remaining|to go|played)|kitne match)\b/],
  ["next", /\b(next (match|game|fixture|one)|next up|upcoming|agla match|agla game|who plays? next|play(ing|s)? next|fixtures?|schedule|when (is|are|do|does) .{0,40}\bplay(ing)?\b)/],
  ["live", /\b(on now|live now|right now|playing now|happening now|being played|any (match|game) (live|on)|is (anything|any match|a match) (live|on)|abhi|currently)\b/],
  ["leader", /\bseries (score|scoreline|status|standings?)\b/],
  ["about", /\b(rules|points for|how (does|do) (the )?points)\b/],
  ["result", /\b(who won|kaun jeeta|kon jeeta|kaun jita|kon jita|who lost|kaun haara|winner|result of|last (match|game|result)|latest (match|game|result|score)|previous (match|game)|pichla match)\b/],
  ["results", /\b(results|all (the )?(matches|scores)|scores so far|sare results?)\b/],
  ["score", /\b(score|scores|scorecard|scoreline|result|kitna hua|kitna bana|how many runs)\b/],
  ["leader", /\b(winning|leading|leads?|leader|on top|top of|first place|1st place|table toppers?|ahead|who'?s first|who is first|aage|jeet raha|jeet rahi|sabse upar|number one|no\.? ?1)\b/],
  ["table", /\b(points? table|table|standings|rankings?|ranks?|positions?|points|leaderboard)\b/],
  ["about", /\b(which teams|what teams|how many teams|list of teams|teams (are )?(playing|in it|in this)|who'?s playing|who is playing|who are playing|venue|where|ground|format|overs|dates?|when (does|did|is|was) (it|this|the (tournament|league|series|cup))|what is this|about (this|the) (tournament|league|series|cup))\b/],
];

/** Squad questions: "who plays for Titans", "Titans squad". Read once a team is known to be named (tournamentAnswerKind). */
export const SQUAD = /\b(squad|line[- ]?up|players? (of|in|for)|who plays? for|who (is|are) in|team list|playing (xi|11|eleven)|team sheet)\b/;

/** A match named by its number or its stage: "match 3", "3rd match", "the final", "semi-final 2", "the last match". */
export type MatchRef = { n: number } | { stage: "final" } | { stage: "semi"; slot: 1 | 2 | null } | { last: true };

export function matchRefOf(q: string): MatchRef | null {
  const t = normAsk(q);
  const semi = /\bsemi[- ]?finals?(?: ?(1|2|one|two))?\b|\b(1st|first|2nd|second) semi[- ]?final\b|\bsf ?(1|2)\b/.exec(t);
  if (semi) {
    const which = semi[1] ?? semi[2] ?? semi[3] ?? "";
    return { stage: "semi", slot: /^(1|one|1st|first)$/.test(which) ? 1 : /^(2|two|2nd|second)$/.test(which) ? 2 : null };
  }
  if (/\bfinals?\b/.test(t) && !/\bfinal (score|result|table|standings|over|ball)\b/.test(t)) return { stage: "final" };
  const m = /\b(?:match|game|fixture) (?:no\.? ?|number ?|#)?(\d{1,3})\b/.exec(t) ?? /\b(\d{1,3})(?:st|nd|rd|th) (?:match|game|fixture)\b/.exec(t);
  if (m) return { n: Number(m[1]) };
  const word = /\b(first|second|third|fourth|fifth|sixth) (?:match|game|fixture)\b/.exec(t);
  if (word) return { n: ["first", "second", "third", "fourth", "fifth", "sixth"].indexOf(word[1]) + 1 };
  if (/\b(last|latest|previous|most recent|pichla) (match|game|result|one)\b/.test(t)) return { last: true };
  return null;
}

/**
 * What a message on a tournament's page asks: one of the usual questions,
 * a search (the usual Ask answers it, exactly as on a live score page:
 * liveAskKind's own rules, with this tournament's names never read as a
 * place), or other (the model, from the facts). own and players: the
 * tournament's names (lib/ask/tournament.ts tournamentOwnNames).
 */
export function tournamentAskKind(q: string, opts: { places?: RegExp | null } & LiveOwnNames = {}): TournamentAskKind | "search" | "other" {
  const t = normAsk(q);
  if (!THIS_TOURNAMENT.test(t) && liveAskKind(q, opts) === "search") return "search";
  for (const [kind, re] of KINDS) if (re.test(t)) return kind;
  return "other";
}

const SEARCH_INTENTS: ReadonlySet<string> = new Set(["find_turf", "find_game", "compare", "create_game", "tool"]);

/**
 * Whether the quick reader's reading (lib/ai/quick.ts quickAnswer, its
 * intent or null) sends a message on a tournament's page on to the usual
 * Ask. Only a message that is none of the usual questions and that the
 * quick reader reads as a search, a comparison, a host or a tool: "what
 * is the net run rate of Titans" stays here though the site has an NRR
 * calculator.
 */
export function tournamentGoesOn(asked: TournamentAskKind | "other", quickIntent: string | null): boolean {
  return asked === "other" && !!quickIntent && SEARCH_INTENTS.has(quickIntent);
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

/** What a tournament has, as far as its chips care. scored: matches with a ball-by-ball scorecard (finished or on now). */
export type TournamentHas = { series: boolean; played: number; total: number; live: number; scored: number; champion: boolean };

/**
 * What to ask on this page, from what the tournament actually has: the
 * chat opens with these and offers them after each answer. No top scorer
 * chip without a scored match, no "what's on now" with nothing live, no
 * next match when every match is played. Four at most.
 */
export function tournamentAskChips(has: TournamentHas): string[] {
  const out: string[] = [];
  if (has.live > 0) out.push("What's on now?");
  if (has.champion) out.push("Who won the tournament?");
  else if (has.played > 0) out.push(has.series ? "What's the series score?" : "Who's leading the table?");
  if (has.scored > 0) out.push("Who's the top scorer?", "Most wickets?");
  if (has.played > 0 && out.length < 4) out.push("Latest result?");
  if (has.played < has.total && out.length < 4) out.push("When's the next match?");
  if (out.length < 4 && has.played === 0) out.push("Who's playing?");
  if (out.length < 4 && has.played === 0 && !has.series) out.push("What's the format?");
  if (out.length < 4 && has.played > 0 && has.played < has.total) out.push("How many matches are left?");
  return out.slice(0, 4);
}

/** The chips under an answer: this tournament's, without the one just asked, three at most. */
export function tournamentFollowups(chips: string[], q: string): string[] {
  const asked = normAsk(q).replace(/[?.!]+$/, "");
  return chips.filter((c) => normAsk(c).replace(/[?.!]+$/, "") !== asked).slice(0, 3);
}
