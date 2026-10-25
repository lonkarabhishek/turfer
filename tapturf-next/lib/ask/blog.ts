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

/** Without the model: the article's own description and its section headings. */
export function outlineOf(post: Post): { gist: string; points: string[] } {
  const heads = post.blocks.filter((b): b is Extract<Block, { type: "h2" }> => b.type === "h2").map((b) => b.text.trim());
  return { gist: post.description, points: heads.filter((h) => !/^(faq|frequently asked|sources)/i.test(h)).slice(0, 6) };
}
