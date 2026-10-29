import { googleMapsUrl } from "../utils/bookingApps";
import { listWords } from "../reviews/insights";
import { hasReviewText, type TurfFacts } from "./facts";

/**
 * "What do people say about this turf?": telling the question apart, and
 * the plain answer from the fact sheet (lib/ai/facts.ts) that Ask gives
 * without the model. The route answers this way when there is no model,
 * and when the sheet holds no written word about the venue: then there is
 * nothing for the model to read, and it used to fill the gap ("Reviewers
 * mention PLaY Arena is rated 4.5..."). Whose words are whose is always
 * said: TapTurf players first, then Google's rating, then the summary of
 * the written reviews as its sources' reviewers. pickAnswer is the route's
 * whole choice between this answer and the model's. Pure, relative imports.
 */

/** Words that make "it" this venue (the page's, or the card shown last): "this turf", "turf", "ye turf". */
const THIS = /^(?:it|here|this|that|this one|that one|turf|ground|place|venue|(?:this|that|the|ye|yeh|is) (?:turf|place|ground|venue|court|arena|box|cage|club|field))$/i;

/** A facility, a price or a time: "how is the parking" is about the parking, not what people say overall. */
const FACET =
  /\b(?:parking|washrooms?|toilets?|bathrooms?|changing|lights?|lighting|floodlights?|pitch|grass|surface|mat|prices?|pricing|priced|rates?|costs?|charges?|fees?|food|cafe|canteen|water|crowd|crowded|traffic|weather|timings?|hours|open|close|closed|staff|nets?|roof|size|location|road|route|directions?|reach|booking|slots?|coach|coaching|kids|children|beginners?|ladies|women|girls|night|morning|evening|rain|monsoon|summer|safe|safety|ac)\b/i;

/**
 * Not one venue's reviews: a search ("reviews of turfs in Pune", "best
 * rated turf near me", "turf with good reviews"), a comparison, or the
 * player about to rate it themselves.
 */
const NOT_ONE = new RegExp(
  [
    String.raw`\b(?:turfs|grounds|venues|courts|places|arenas|boxes|cages|fields|options|clubs)\b`,
    String.raw`\b(?:top|best|highest|higher|most|highly|well|better|lowest|worst|least)[ -]?(?:rated|reviewed|rating|ratings|reviews)\b`,
    String.raw`\bwith (?:good|great|the best|best|high|nice|top|\d)\b.*\b(?:reviews?|ratings?)\b`,
    String.raw`\b(?:vs|versus|compare|compared|comparison|better than|which)\b|\bv/s\b`,
    String.raw`\b(?:near me|nearby|near by|around me|close by|closest|nearest)\b`,
    String.raw`\b(?:above|over|more than|at least|atleast|min|minimum) \d`,
    String.raw`\b\d(?:\.\d)? ?\+? ?(?:stars?|rated)\b`,
    String.raw`\b(?:how (?:do|can|to|should) (?:i |we )?|can i |can we |let me |i want to |i wanna |want to |i'd like to |i would like to |i will |i'll )(?:rate|review|write|leave|give|post|add|submit|edit|delete|remove|complain|report|file)\b`,
    String.raw`\b(?:my|our) (?:review|rating|report|complaint)\b`,
    String.raw`\b(?:file|lodge|raise|register|make) a complaint\b`,
  ].join("|"),
  "i",
);

const WHO = String.raw`(?:people|players|other players|others|users|customers|reviewers|guys|ppl|folks|they|everyone|players on tapturf)`;
/** The same without "they" and "everyone": "do they recommend booking ahead" asks the venue, not its players. */
const PEOPLE = String.raw`(?:people|players|other players|others|users|customers|reviewers|guys|ppl|folks|players on tapturf)`;

/**
 * What people say, in so many words. Not bare "rated" or "recommended":
 * "is it rated for night matches", "what shoes are recommended" ask
 * something else.
 */
const TOPIC = new RegExp(
  [
    String.raw`\bwhat (?:do|did|does|are|is|would) ${WHO} (?:say|saying|think|thinking|feel|write|writing|said)\b`,
    String.raw`\bhow (?:do|did) ${WHO} (?:find|rate|like)\b`,
    String.raw`\b(?:do|did|does|would|will) ${PEOPLE} (?:like|love|hate|dislike|enjoy|recommend|complain)\b`,
    String.raw`\b(?:are|were|r) ${PEOPLE} (?:happy|satisfied|unhappy|disappointed) with\b`,
    String.raw`\b(?:reviews?|ratings?|feedback|opinions?|testimonials?|reputation|complaints?)\b`,
    String.raw`\brated (?:\d|on google)`,
    String.raw`\b(?:worth it|worth going|worth the money|worth a visit|worth playing|pros and cons)\b`,
    String.raw`\blog (?:kya|kaisa) (?:kehte|kahte|bolte|bol rahe|keh rahe|sochte)\b`,
  ].join("|"),
  "i",
);

type Shape = { re: RegExp; overall?: boolean };
// The venue is the captured part; none captured means the one on screen ("reviews?").
const SHAPES: Shape[] = [
  { re: new RegExp(String.raw`^what (?:do|did|does|are|is|would) ${WHO} (?:say|saying|think|thinking|feel|write|writing|said)(?: (?:about|of|on|regarding|for) (.+?))?$`, "i") },
  // "What do players like about it?", "What do people complain about?"
  { re: new RegExp(String.raw`^what (?:do|did|does) ${PEOPLE} (?:like|love|hate|dislike|enjoy|complain)(?: about| of)?(?: (?:about|at|in|of|with) (.+?))?$`, "i") },
  // "Do people like it?", "would players recommend Hotfut Bavdhan"
  { re: new RegExp(String.raw`^(?:do|did|does|would|will) ${PEOPLE} (?:like|love|hate|dislike|enjoy|recommend|rate)(?: playing)?(?: (?:at|in))? (.+?)$`, "i") },
  // "Are players happy with it?"
  { re: new RegExp(String.raw`^(?:are|were|r) ${PEOPLE} (?:happy|satisfied|unhappy|disappointed) with (.+?)$`, "i") },
  // "Any complaints?", "complaints about Hotfut"
  { re: /^(?:(?:any|are there any|what are the|what are|main|common) )?complaints?(?: (?:about|with|at|for|of) (.+?))?$/i },
  // "pros and cons?", "pros and cons of Hotfut"
  { re: /^(?:what are )?(?:the )?(?:pros and cons|good and bad)(?: (?:of|for|at|about) (.+?))?$/i },
  // "how is it rated", "how well rated is Hotfut": before the plain "how is it".
  { re: /^how (?:is|'s|well is|highly is) (.+?) rated(?: on google)?$/i },
  { re: /^how (?:well|highly) rated is (.+?)$/i },
  {
    re: /^(?:(?:what|how) (?:are|is|were|r)|what's|whats|show(?: me)?|any|read|see|check|get|give me|tell me)? ?(?:the |its |it's )?(?:google |tapturf |players'? )?(?:reviews?|ratings?|feedback|opinions?)(?: like)?(?: (?:of|for|on|about|at) (.+?))?(?: like)?$/i,
  },
  { re: /^(?:does|do|did) (.+?) (?:have|has|get|got) (?:good|nice|great|bad|any|many|decent|positive|negative) (?:reviews?|ratings?|feedback)$/i },
  { re: /^(.+?)(?:'s|s')? (?:google |tapturf )?(?:reviews?|ratings?|feedback)(?: (?:please|pls|plz))?$/i },
  { re: /^(?:would|do|can|will) you recommend (?!(?:a|an|some|any|me)\b)(.+?)$/i },
  { re: /^(?:log kya (?:kehte|kahte|bolte) (?:hai|hain|he)|(.+?) (?:ke|ka) (?:bare|baare) (?:me|mein|mai) log kya (?:kehte|kahte|bolte) (?:hai|hain|he))$/i },
  { re: /^(.+?) (?:ke|ka|ki|che|cha|chi|chya) (?:reviews?|ratings?|feedback)(?: (?:kaise|kaisa|kaisi|kya|kasa|kashe|kase))?(?: (?:hai|hain|he|aahe|ahe))?$/i },
  // What it is like overall: never a question about one facility ("how is the parking").
  { re: /^how(?:'s| is| was| r| are) (.+?)(?: overall| for playing| to play)?$/i, overall: true },
  { re: /^how good is (.+?)$/i, overall: true },
  // "any good?", "good turf?", "is it a good turf": the venue on screen.
  { re: /^(?:(?:is|was) (?:it|this|that)(?: (?:turf|place|ground|venue))? )?any good$/i, overall: true },
  { re: /^(?:(?:is|was) (?:it|this|that) )?(?:a )?(?:good|nice|decent) (?:turf|place|ground|venue)(?: or not)?$/i, overall: true },
  {
    re: /^(?:is|was|r|are) (.+?) (?:good|any good|nice|decent|great|ok|okay|bad|worth it|worth going|worth the money|worth a visit|reliable|legit|well rated|rated well|highly rated)(?: or not| overall| place| turf| ground| venue| one| enough)?$/i,
    overall: true,
  },
  // Recommended: the venue itself ("is it recommended"), never shoes, studs or booking ahead.
  { re: /^(?:is|was) (it|this|that|this one|this (?:place|turf|ground|venue)) recommended(?: or not)?$/i, overall: true },
  {
    re: /^(?:(.+?) )?(?:kaisa|kaisi|kaise|kese|kesa|kesi|kasa|kashi) (?:hai|hain|he|h|aahe|ahe)(?: (?:ye|yeh|is|this)(?: turf| ground| place| venue)?)?(?: kya)?$/i,
    overall: true,
  },
  { re: /^(.+?) (?:accha|acha|achha|achcha|badhiya|theek|thik|mast|changla|chaangla) (?:hai|he|h|aahe|ahe)(?: kya| ka)?$/i, overall: true },
  // With no venue said it must be a question ("acha hai kya"); "acha hai" alone is "OK, good".
  { re: /^(?:accha|acha|achha|achcha|badhiya|theek|thik|mast|changla|chaangla) (?:hai|he|h|aahe|ahe) (?:kya|ka)$/i, overall: true },
];

const tidy = (q: string) =>
  q
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s?.!]+$/, "")
    .trim();

/**
 * The venue a question about what people say is about, as typed
 * ("what do players say about Hotfut Bavdhan" gives "Hotfut Bavdhan";
 * "reviews?", "is it any good" and "what do people say about the pitch"
 * give "it", the venue on screen), or null when it is not such a question.
 * Whether the words name a venue is the caller's to check.
 */
export function reviewsSubject(q: string): string | null {
  const raw = tidy(q);
  if (!raw || raw.length > 160 || NOT_ONE.test(raw)) return null;
  for (const { re, overall } of SHAPES) {
    const m = re.exec(raw);
    if (!m) continue;
    // "reviews kaise hai": the reviews of the venue on screen.
    const said = (m[1] ?? "")
      .trim()
      .replace(/^(?:about|of) /i, "")
      .replace(/^(?:the |its |it's )?(?:reviews?|ratings?)$/i, "");
    if (!said || THIS.test(said)) return "it";
    if (FACET.test(said)) {
      // How one part is ("how is the parking"): not what people say overall.
      if (overall) return null;
      // What people say about a part of it: the venue named after it, else the one on screen.
      const at = /^.+? (?:at|of|in|for) (.+)$/i.exec(said);
      if (at && !FACET.test(at[1])) return THIS.test(at[1]) ? "it" : at[1].trim();
      return said.split(" ").length <= 3 ? "it" : null;
    }
    if (said.length > 60 || /^(?:a|an|some|any|me|you|i|we)\b/i.test(said)) return null;
    return said;
  }
  return null;
}

/** True when the question is about what people say of the venue, or how good it is overall. */
export function isReviewsAsk(q: string): boolean {
  const raw = tidy(q);
  if (!raw || NOT_ONE.test(raw)) return false;
  return reviewsSubject(raw) != null || TOPIC.test(raw);
}

/**
 * Also asks for a price, a time or a facility ("price and reviews", "what
 * do people say about the price"): the model answers that, never the plain
 * answer, which names none of them.
 */
export function asksMore(q: string): boolean {
  return FACET.test(tidy(q));
}

type Reports = {
  players: number;
  average_stars: string;
  would_play_again?: { yes: number; maybe: number; no: number };
  scorecard?: { part: string; says: string }[];
  recent?: { stars: number; text: string }[];
};
type Google = { rating: string; reviews?: string; reviews_link?: string };
type Said = { from: string; written_reviews?: number; summary?: string; likes?: string[]; gripes?: string[] };

/** "Google reviews" gives "Google reviewers", "TapTurf reviews" gives "TapTurf players"; both, "reviewers on Google and TapTurf". */
function whose(from: string): string {
  const google = /google/i.test(from);
  const tapturf = /tapturf/i.test(from);
  return google && tapturf ? "reviewers on Google and TapTurf" : tapturf ? "TapTurf players" : "Google reviewers";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number | string, one: string) => `${n} ${one}${String(n) === "1" ? "" : "s"}`;

/** A tip, quoted short and ending as a sentence: cut at a word, never mid-word. */
function quote(text: string, max = 120): string {
  const s = text.replace(/^["“]+|["”]+$/g, "").trim();
  if (s.length > max) {
    const cut = s.slice(0, max);
    return `"${cut.slice(0, cut.lastIndexOf(" ") > 40 ? cut.lastIndexOf(" ") : max).replace(/[\s,;:.-]+$/, "")}…"`;
  }
  return `"${/[.!?…]$/.test(s) ? s : `${s}.`}"`;
}

/**
 * What the summary's reviewers like and what some mention, and how many
 * written reviews it sums up (never all of Google's count), or its two
 * sentences when it has no lists.
 */
function saidLines(s: Said): string[] {
  const who = whose(s.from);
  const of = s.written_reviews ? ` (summed up from ${plural(s.written_reviews, "written review")})` : "";
  const likes = s.likes?.length ? listWords(s.likes) : null;
  const gripes = s.gripes?.length ? listWords(s.gripes) : null;
  if (likes && gripes) return [`${cap(who)} like ${likes}; some mention ${gripes}${of}.`];
  if (likes) return [`${cap(who)} like ${likes}${of}.`];
  if (gripes) return [`Some ${who} mention ${gripes}${of}.`];
  if (s.summary) return [`TapTurf's summary of ${s.written_reviews ? `${s.written_reviews} written ` : ""}${s.from}: ${s.summary}`];
  return [];
}

/**
 * The answer to "what do people say" from the sheet alone: TapTurf
 * players' stars, would play again and words, then Google's rating, then
 * what the summary's reviewers like and complain about. With nothing
 * written, it says so and where the Google reviews are, and asks the
 * player to rate it after they play. No prices, hours or facilities, and
 * no number the sheet doesn't hold.
 */
export function reviewsAnswer(f: TurfFacts): { answer: string; covered: boolean } {
  const name = typeof f.name === "string" && f.name.trim() ? f.name.trim() : "This turf";
  const tt = f.tapturf_reports as Reports | undefined;
  const g = f.google as Google | undefined;
  const said = f.players_say as Said | undefined;
  const ownSaid = said && whose(said.from) === "TapTurf players" ? said : null;
  const otherSaid = said && !ownSaid ? said : null;
  const out: string[] = [];

  if (tt) {
    const stars = Number(tt.average_stars);
    let line =
      tt.players === 1
        ? `1 player on TapTurf gave ${name} ${stars} star${stars === 1 ? "" : "s"}`
        : `${tt.players} players on TapTurf rate ${name} ${tt.average_stars}`;
    const again = tt.would_play_again;
    const answered = again ? again.yes + again.maybe + again.no : 0;
    if (again && answered > 0) line += `, and ${again.yes} of ${answered} would play again`;
    // Their words: the summary of their reports, else the latest tip, quoted.
    const tip = !ownSaid && tt.recent?.length ? quote(tt.recent[0].text) : null;
    if (tip && tt.players === 1 && !answered) out.push(`${line} and wrote: ${tip}`);
    else out.push(`${line}.`);
    if (tt.scorecard?.length) out.push(`On their scorecard, ${tt.scorecard.slice(0, 2).map((p) => `${p.part}: ${p.says}`).join("; ")}.`);
    if (ownSaid) out.push(...saidLines(ownSaid));
    else if (tip && !(tt.players === 1 && !answered)) out.push(`The latest says: ${tip}`);
  }
  if (g) {
    const who = tt ? "It is" : `${name} is`;
    out.push(g.reviews ? `${who} rated ${g.rating} on Google from ${plural(g.reviews, "review")}.` : `${who} rated ${g.rating} on Google.`);
  }
  // The players' summary without their reports (a sheet built without the rows): still said as theirs.
  if (ownSaid && !tt) out.push(...saidLines(ownSaid));
  if (otherSaid) out.push(...saidLines(otherSaid));
  else {
    const texts = f.google_reviews as { text: string }[] | undefined;
    if (texts?.length) out.push(`One Google reviewer wrote: ${quote(texts[0].text)}`);
  }

  const none = `TapTurf has no ratings or reviews for ${name} yet. Played there? Rate it on TapTurf after you play.`;
  if (!hasReviewText(f)) {
    if (!tt && !g) return { answer: none, covered: true };
    out.push(
      g?.reviews_link === "yes"
        ? "No written reviews on TapTurf yet: read them on Google, or rate it on TapTurf after you play."
        : "No written reviews on TapTurf yet. Played there? Rate it on TapTurf after you play.",
    );
  }
  // Never an empty answer card.
  return { answer: out.length ? out.join(" ") : none, covered: true };
}

/** "Read Google reviews" under a reviews answer: the venue's Google Maps page, as the turf page links it, when it has a Google rating. */
export function googleReviewsLink(t: { rating?: number | string | null; external_review_url?: string | null }): { label: string; href: string } | null {
  const href = Number(t.rating) > 0 ? googleMapsUrl(t.external_review_url) : null;
  return href ? { label: "Read Google reviews", href } : null;
}

/** An answer about the venue, as the route shows it: with the Google reviews link under one about what people say. */
export type Answered = { answer: string; covered: boolean; link?: { label: string; href: string } };

/**
 * How the answer was made: plain (from the sheet, no model), model,
 * plain-fallback (the model failed or gave nothing on a review question),
 * plain-backstop (the model said what people say with nothing written to
 * back it), none (no sheet, or no model for a question that needs one).
 */
export type AnswerPath = "plain" | "model" | "plain-fallback" | "plain-backstop" | "none";

/**
 * Says what people said, liked or complained of: never right with no word
 * of theirs in the sheet. Not "find" or "feel", which also say what a
 * player will find there ("players will find parking on site").
 */
const CLAIM =
  /\b(?:reviewers?|players?|people|customers|users|visitors|guests|others)\b[^.]{0,24}?\b(?:say|says|said|saying|mention|mentions|mentioned|like|likes|liked|love|loves|loved|praise|praises|praised|complain|complains|complained|report|reports|reported|note|notes|noted|found|describe|describes|described|felt|appreciate|appreciates|appreciated|recommend|recommends|recommended)\b|\baccording to (?:reviews|reviewers|players|people)\b/i;

/** Any word of what people say: tips, the summary, Google texts, a reviewer's note (good_to_know) or a price a Google reviewer gave. */
function anyWords(f: TurfFacts): boolean {
  return hasReviewText(f) || !!f.good_to_know || !!f.google_reviewers_reported_prices;
}

/** The model's answer says what people said when the sheet holds nothing they said (29 Oct: "Reviewers mention PLaY Arena is rated 4.5..."). */
export function claimsUnwritten(answer: string, f: TurfFacts): boolean {
  return !anyWords(f) && CLAIM.test(answer);
}

/**
 * The answer to a question about one venue (app/api/ask/route.ts, the
 * question branch). What people say of it, with nothing written to read
 * or no model, is the plain answer; a question that also asks for a
 * price, a time or a facility goes to the model when there is one. When
 * the model fails on a review question (null, an overload, a timeout),
 * the plain answer; on any other question the error is the caller's, as
 * before. When the model says what people said with no word of theirs in
 * the sheet, the plain answer instead. The Google reviews link goes under
 * any answer about what people say.
 */
export async function pickAnswer(
  asked: string,
  sheet: { turf: { rating?: number | string | null; external_review_url?: string | null }; facts: TurfFacts } | null,
  model: ((question: string, facts: TurfFacts) => Promise<{ answer: string; covered: boolean } | null>) | null,
  onModelError?: (e: unknown) => void,
): Promise<{ answer: Answered | null; path: AnswerPath; aboutReviews: boolean; more: boolean }> {
  const aboutReviews = isReviewsAsk(asked);
  const more = aboutReviews && asksMore(asked);
  if (!sheet) return { answer: null, path: "none", aboutReviews, more };
  const link = googleReviewsLink(sheet.turf);
  const plain = (path: AnswerPath) => {
    const a = reviewsAnswer(sheet.facts);
    return { answer: link ? { ...a, link } : a, path, aboutReviews, more };
  };
  if (aboutReviews && (!model || (!more && !hasReviewText(sheet.facts)))) return plain("plain");
  if (!model) return { answer: null, path: "none", aboutReviews, more };
  let said: { answer: string; covered: boolean } | null;
  try {
    said = await model(asked, sheet.facts);
  } catch (e) {
    if (!aboutReviews) throw e;
    onModelError?.(e);
    return plain("plain-fallback");
  }
  if (!said) return aboutReviews ? plain("plain-fallback") : { answer: null, path: "model", aboutReviews, more };
  if (claimsUnwritten(said.answer, sheet.facts)) return plain("plain-backstop");
  return { answer: aboutReviews && link ? { ...said, link } : said, path: "model", aboutReviews, more };
}
