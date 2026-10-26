import type { Block, Post } from "@/content/blog";

/**
 * Ask on a blog post: the chip and nudge that offer the short version of
 * the article, the reading of a message as asking for it, and the
 * article's outline for when the model is unavailable. Pure (type
 * imports only), so the chat's chips and loader lines and /api/ask agree.
 * The article as the model reads it is lib/ask/blogArticle.ts.
 */

export const SUMMARY_CHIP = "Summarize this blog";

// "summarise", "sumarize", "summerize", "summary", "tl;dr", "gist", "saar", "सारांश".
const SUMMARY = /\b(su+m+[ae]ri[sz]e|su+m+[ae]ry|tl ?;? ?dr|gist|key (points|takeaways)|main points|short version|in short|in brief|saar|saransh)\b|सारांश|सार/;
const ABOUT = /\bwhat('?s| is)( this| the)? (blog|article|post) about\b/;

/** True when the message asks for the short version of the page's article (not, say, a venue's reviews). */
export function isSummaryAsk(q: string): boolean {
  const t = q.toLowerCase().replace(/\s+/g, " ").trim();
  return (SUMMARY.test(t) || ABOUT.test(t)) && !/\breviews?\b/.test(t);
}

// A search, not a question about the article: a time, "near me", booking or games, with nothing pointing back at the article.
const SEARCHY = /\b(near me|nearby|near by|tonight|today|tomorrow|this weekend|aaj|kal|book|booking|games?|host|cheapest|sasta)\b|\b(turfs?|courts?|grounds?|cages?|venues?|arenas?) (in|near|around|at)\b/;
const ABOUT_ARTICLE = /\b(this|these|that|those|article|blog|post|list|here|they|them|it)\b/;

/**
 * True when a message sent on an article reads like a turf or game
 * search ("box cricket near me tonight") rather than a question about it.
 * The chat shows search loader lines for it, and when the answerer can't
 * run, /api/ask sends it to search instead of the article's outline.
 */
export function looksLikeSearch(q: string): boolean {
  const t = q.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
  // "this weekend" is a time, not the article.
  const rest = t.replace(/\bthis (weekend|week|evening|morning|afternoon|night|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, "");
  return SEARCHY.test(t) && !ABOUT_ARTICLE.test(rest);
}

const SPORT_WORDS: [string, RegExp][] = [
  ["box cricket", /\bbox[ -]?cricket\b/],
  ["football", /\b(football|futsal|5-a-side|7-a-side)\b/],
  ["cricket", /\bcricket\b/],
  ["pickleball", /\bpickleball\b/],
  ["badminton", /\bbadminton\b/],
];
// Search chips that aren't a search for a venue: a tool, a host, a comparison.
const NOT_SEARCH = /\b(nrr|host|vs|compare)\b/i;

// Words of Hindi in Latin script that English doesn't use ("me" and "kal" are left out: "near me", a name).
const HINGLISH = /\b(hai|hain|kya|kaun|kaunsa|konsa|kitna|kitne|kitni|kaise|kab|kahan|kidhar|mein|nahi|nahin|sasta|saste|sabse|wala|wale|wali|raat|khule|khula|chahiye|batao|karo|karein|accha|acha|theek|yaar|bhai|kuch|abhi|ke liye|ka|ki|ko|aur)\b/;

/** True when a message is written in Hinglish (Hindi words in Latin script), or in Devanagari. */
export function isHinglish(q: string): boolean {
  const t = q.toLowerCase();
  return /[\u0900-\u097F]/.test(t) || HINGLISH.test(t);
}

// The city chips (lib/ask/chips.ts) in English and in Hinglish, the same search either way.
const CHIP_PAIRS: [RegExp, (x: string) => string, RegExp, (x: string) => string][] = [
  [/^Cheapest turf in (.+)$/i, (x) => `Cheapest turf in ${x}`, /^(.+?) me sasta turf$/i, (x) => `${x} me sasta turf`],
  [/^Box cricket in (.+) tonight$/i, (x) => `Box cricket in ${x} tonight`, /^(.+?) mein aaj raat box cricket$/i, (x) => `${x} mein aaj raat box cricket`],
  [/^Football turf in (.+) tonight$/i, (x) => `Football turf in ${x} tonight`, /^(.+?) mein aaj raat football turf$/i, (x) => `${x} mein aaj raat football turf`],
  [/^Open games in (.+) this weekend$/i, (x) => `Open games in ${x} this weekend`, /^(.+?) mein is weekend open games$/i, (x) => `${x} mein is weekend open games`],
  [/^Football turf in (.+) with floodlights$/i, (x) => `Football turf in ${x} with floodlights`, /^(.+?) mein floodlights wala football turf$/i, (x) => `${x} mein floodlights wala football turf`],
  [/^Box cricket near me tonight$/i, () => "Box cricket near me tonight", /^Aaj raat paas mein box cricket$/i, () => "Aaj raat paas mein box cricket"],
  [/^Cheapest football turf near me$/i, () => "Cheapest football turf near me", /^Paas mein sabse sasta football turf$/i, () => "Paas mein sabse sasta football turf"],
];

/** The chip as an English reader would type it: "Kothrud me sasta turf" is "Cheapest turf in Kothrud". */
export function englishChip(chip: string): string {
  const t = chip.trim();
  for (const [, en, hi] of CHIP_PAIRS) {
    const m = hi.exec(t);
    if (m) return en(m[1] ?? "");
  }
  return chip;
}

/** The chip as a Hinglish reader would type it: "Box cricket in Hyderabad tonight" is "Hyderabad mein aaj raat box cricket". */
export function hinglishChip(chip: string): string {
  const t = chip.trim();
  for (const [en, , , hi] of CHIP_PAIRS) {
    const m = en.exec(t);
    if (m) return hi(m[1] ?? "");
  }
  return chip;
}

/**
 * The city's search chips that fit an article, for the one search chip
 * under an answer: those for the sport it is about first, then ones for
 * no sport in particular, never one for another sport or a tool, and none
 * at all on an article for turf owners. The chips are in the question's
 * language: English under an English question, Hinglish under Hinglish.
 */
export function articleSearchChips(post: Pick<Post, "slug" | "title">, chips: string[], question = ""): string[] {
  const english = !isHinglish(question);
  return fittingChips(post, chips).map((c) => (english ? englishChip(c) : hinglishChip(c)));
}

function fittingChips(post: Pick<Post, "slug" | "title">, chips: string[]): string[] {
  const about = `${post.slug.replace(/-/g, " ")} ${post.title}`.toLowerCase();
  if (/\b(business|lease|leased|owner|owners|investment|investor)\b/.test(about)) return [];
  const sportsOf = (t: string) => {
    const l = t.toLowerCase();
    // "box cricket" is not also "cricket".
    const found = SPORT_WORDS.filter(([, re]) => re.test(l)).map(([w]) => w);
    return found.includes("box cricket") ? found.filter((w) => w !== "cricket") : found;
  };
  const mine = sportsOf(about);
  const fit = chips.filter((c) => !NOT_SEARCH.test(c));
  const ofMine = fit.filter((c) => sportsOf(c).some((w) => mine.includes(w)));
  const general = fit.filter((c) => sportsOf(c).length === 0);
  return mine.length ? [...ofMine, ...general] : general.length ? general : fit;
}

/** Without the model: the article's own description and its section headings. */
export function outlineOf(post: Post): { gist: string; points: string[] } {
  const heads = post.blocks.filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2").map((b) => b.text.trim());
  return { gist: post.description, points: heads.filter((h) => !/^(faq|frequently asked|sources)/i.test(h)).slice(0, 6) };
}
