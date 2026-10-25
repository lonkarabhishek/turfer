import type Anthropic from "@anthropic-ai/sdk";
import type { BlogLink } from "./blogTypes";

/**
 * The web answer Ask TapTurf gives on a blog post when the article
 * doesn't cover the question: Claude Haiku searches the web and answers
 * in a few sentences, and this reads that reply into the text the reader
 * sees and the pages it stands on. Links come only from the search
 * itself (the pages the answer cites, else the first results), never
 * from words the model typed, and an answer with no page behind it is
 * no answer. Pure (type imports only), so node --test can run it.
 */

export type WebAnswer = { text: string; links: BlogLink[] };

const MAX_TEXT = 700;
const MAX_CITED = 4;
const MAX_RESULTS = 3;

type Block = Anthropic.ContentBlock;
type Result = Anthropic.WebSearchResultBlock;

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const tidy = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** At most n characters: whole sentences when one fits, else cut at a word. */
function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (end > n * 0.4) return cut.slice(0, end + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut.slice(0, n - 1)).replace(/[\s,;:.–-]+$/, "")}…`;
}

// Contact details are never shown, and neither is a sentence sending the
// player to another site ("read more at https://...", "book on x.in").
// Digits are fenced by lookarounds, not \b, which can't fall between the
// 91 and the number in "+919876543210".
const TLDS = "com|in|co|org|net|io|app|ai|me|info|biz|xyz|club|live|online|site|store|shop|sport|sports|uk|us|tv|gg|ly";
const CONTACT = new RegExp(
  [
    // Emails and UPI ids (raju@okaxis).
    String.raw`[\w.+-]+@[a-z][\w-]*`,
    // Social handles (@turfname).
    String.raw`(?<![\w.@])@[a-z][\w.]{2,}`,
    // Mobiles: ten digits from 6-9, grouped any way, after +91, 0091, 91 or 0.
    String.raw`(?<![\d+])(?:(?:\+|\b00)\s?91[\s-]?|91[\s-]?|0)?[6-9](?:[\s-]?\d){9}(?!\d)`,
    // Landlines with the trunk 0: (080) 2345 6789, 040-23456789.
    String.raw`(?<!\d)0(?:[\s()-]{0,2}\d){9,10}(?!\d)`,
    // Any number after +91: +91 80 2345 6789.
    String.raw`(?:\+|\b00)\s?91[\s()-]{0,2}\d(?:[\s()-]{0,2}\d){7,9}(?!\d)`,
    // Toll-free and shared-cost: 1800-123-4567, 1860 500 1515.
    String.raw`(?<!\d)18[06]0(?:[\s-]?\d){6,7}(?!\d)`,
    // Links, and bare domains (turfbook.in, playo.co).
    String.raw`https?:\/\/|www\.`,
    String.raw`\b[a-z0-9][a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:${TLDS})\b`,
  ].join("|"),
  "i",
);

/**
 * The model's words as one plain paragraph: no citation markers, markdown
 * or list bullets, and no sentence that carries a phone number, an email,
 * a UPI id or handle, a URL or a site's name. Cut to 700 characters at a
 * sentence.
 */
export function cleanWebText(raw: string): string {
  const flat = raw
    // [label](url) keeps the label.
    .replace(/\[([^\]]+)\]\((?:https?:)?\/\/[^)]*\)/g, "$1")
    // [1], [1, 2], [^3], 【4†source】.
    .replace(/\[\^?\d+(?:\s*[,–-]\s*\d+)*\]|【[^】]*】/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
  // Split where a sentence ends, so "4.8" and "₹1.5 lakh" stay whole.
  const kept = flat.split(/(?<=[.!?])\s+/).filter((s) => s && !CONTACT.test(s));
  return clip(kept.join(" "), MAX_TEXT);
}

/** Text written after a cut-off: only the sentences that finished. */
function finished(text: string): string {
  const end = Math.max(text.lastIndexOf(". "), text.lastIndexOf("? "), text.lastIndexOf("! "), /[.!?]$/.test(text) ? text.length - 1 : -1);
  return end > 0 ? text.slice(0, end + 1) : "";
}

/**
 * The pages behind the answer: the ones its text cites (text from block
 * `from` on, the part shown), else the first results. Deduped by URL,
 * http(s) only.
 */
export function webLinks(content: Block[], from = 0): BlogLink[] {
  const results = new Map<string, Result>();
  for (const b of content) {
    if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
    for (const r of b.content) if (r.type === "web_search_result" && !results.has(r.url)) results.set(r.url, r);
  }
  const out: BlogLink[] = [];
  const seen = new Set<string>();
  const add = (url: string, title: string | null | undefined, max: number) => {
    const u = tidy(url);
    const host = hostOf(u);
    // The same page with a #fragment is the same page.
    const key = u.replace(/#.*$/, "");
    if (!host || seen.has(key) || out.length >= max) return;
    seen.add(key);
    out.push({ label: tidy(title) || tidy(results.get(url)?.title) || host, url: u, host });
  };
  for (const b of content.slice(from)) {
    if (b.type !== "text") continue;
    for (const c of b.citations ?? []) if (c.type === "web_search_result_location") add(c.url, c.title, MAX_CITED);
  }
  if (out.length === 0) for (const r of results.values()) add(r.url, r.title, MAX_RESULTS);
  return out;
}

/**
 * The answer and its pages from a web-search reply, or null when there is
 * nothing to stand on: every search failed (a failed search comes back as
 * an error object in place of the result list) or found nothing, the
 * model declined or paused mid-search, or there is no text or no page.
 * The answer is the text after the last search result, so a "Let me look
 * that up" written before searching is never shown. Text that was going
 * on to more work (another search, or thinking it was cut off in) is a
 * preamble, not the answer, so that is no answer either.
 */
export function readWebAnswer(content: Block[], stop: Anthropic.StopReason | null): WebAnswer | null {
  if (stop === "refusal" || stop === "pause_turn") return null;
  let last = -1;
  let found = false;
  content.forEach((b, i) => {
    if (b.type !== "web_search_tool_result") return;
    last = i;
    if (Array.isArray(b.content) && b.content.some((r) => r.type === "web_search_result")) found = true;
  });
  if (!found) return null;
  const tail = content.slice(last + 1);
  // A search after the last results never got its own.
  if (tail.some((b) => b.type === "server_tool_use")) return null;
  // Cut off after its text, while doing something else: that text led into more work.
  if (stop === "max_tokens" && tail.length && tail[tail.length - 1].type !== "text") return null;
  const raw = tail.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const text = cleanWebText(stop === "max_tokens" ? finished(tidy(raw)) : raw);
  const links = webLinks(content, last + 1);
  if (!text || links.length === 0) return null;
  return { text, links };
}

/**
 * The day in India (YYYY-MM-DD) at `now`. A web answer is kept for the day
 * it was searched (its cache key carries the day), so the next day
 * searches again.
 */
export function webDay(now: number = Date.now()): string {
  // India keeps one offset all year: UTC+5:30, no daylight saving.
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}
