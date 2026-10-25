import { unstable_cache } from "next/cache";
import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import Anthropic from "@anthropic-ai/sdk";
import type { Post } from "@/content/blog";
import { accountKey } from "@/lib/account/server";
import { CITIES } from "@/lib/city";
import { outlineOf } from "@/lib/ask/blog";
import { backingSections, buildVisual, cleanFollowups, flatBars, livelierBars, pickSections, pickSources, pickTurfs, readArticle, turfsNamed, type Article } from "@/lib/ask/blogArticle";
import { BlogReply } from "@/lib/ask/blogReply";
import type { BlogAnswer, BlogVisual } from "@/lib/ask/blogTypes";
import { signArt } from "@/lib/ask/artToken";
import { candidatePages, deadPage, fetchableHost, pageKey, privateAddress, readWebAnswer, webDay, type WebAnswer } from "@/lib/ask/webLinks";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { questionKey } from "./parseCache";
import { ROUTER_MODEL, addUsage, getAnthropic, isAskConfigured, newUsage, structured, type AskUsage } from "./ask";

/**
 * Ask TapTurf on a blog post: every message typed while an article is
 * open comes here first. Claude Haiku reads the article (numbered by
 * lib/ask/blogArticle.ts) and answers from it, by section, with a chart,
 * steps, a comparison, headline numbers or a drawing when one helps.
 * "Summarize this blog" is the same call asked for the short version.
 * On topic but not in the article: one web search answers instead, with
 * the pages it used. A turf or game search is handed back to the route.
 *
 * Kept in Next's data cache by everything the model reads: the article's
 * text (its hash, so an edit that keeps the date is read afresh), the
 * prompts, the conversation before the message (hashed as sent) and the
 * question. So the same path again, from anyone, costs nothing: the same
 * question, or the same follow-up chips tapped in the same order. A
 * failed or declined answer is never cached (the cached function throws).
 *
 * The web part is kept apart, for the day (in India) it was searched:
 * pages change, so the next day searches again. Each search takes one
 * from the day's shared allowance (ask_ai_take 'web'); when that is used
 * up, or the search fails, the reader gets the article-only answer and
 * nothing is kept for the web. Without the model, or when it fails, the
 * reader gets the article's description and headings, never an error.
 * Clear with revalidateTag("blog-answer") and ("blog-web"); a prompt
 * change makes new keys by itself, bump v2 when compose() keeps
 * something else.
 */

export type BlogAsk = { mode: "summary" | "answer"; question: string; history: { user: string; reply: string }[] };
export type BlogResult =
  | { search: true; usage: AskUsage | null }
  | { search: false; reply: string; blog: BlogAnswer; followups: string[]; scope: BlogReply["scope"] | "none"; usage: AskUsage | null };

type Composed = { search: true } | Omit<Extract<BlogResult, { search: false }>, "usage">;

const SYSTEM = `You are TapTurf's guide to one article on its blog. TapTurf is an Indian directory of turfs, courts and pickup games. The article is shown after these instructions; a player has it open and asks you about it in the chat beside it. Reply only with the JSON object.

How the article is laid out: its sections are tagged [S0], [S1] and so on ([S0] is the opening, before the first heading). Venue cards are tagged [V1], [V2]. Tables and stat tiles are tagged [D1], [D2], and their rows are listed under DATASETS at the end, with columns numbered from 0. The sources it cites are tagged [R1], [R2]. "Hero image" under the title describes the photo at the top of the article. The tags are for you: put their numbers in the sections, turfs, sources and dataset fields, never in the words you write.

First, the scope of the message:
- article: the article answers it, fully or in part. That includes its venues, prices, timings, tips and rules, the article itself ("what's this about", "where do these numbers come from"), and asks to chart, compare, list, explain or draw what it covers. "This", "here", "these", "the list", "it" and "they" mean the article and what it covers, unless the conversation says otherwise.
- beyond: about sport, playing, fitness, kit, rules or the article's topic, but the article doesn't say.
- search: a job for TapTurf's search instead of this article: finding or booking a turf, court or game ("box cricket near me tonight", "football turfs in Baner", "any games this Sunday"), a question about a venue the article doesn't cover, hosting a game, TapTurf's free cricket tools (net run rate, toss, scorecards, picking teams), or a follow-up that changes an earlier search ("cheaper ones", "what about Kondapur", "only 24 hours"). When the article's own list answers it ("which of these are open all night"), it is article.
- off_topic: nothing to do with sport, venues, games or the article (homework, poems, coding, news, politics), or plain small talk. A question about any sport (its rules, scoring, umpiring, kit, technique, fitness or history) is never off_topic: it is article when the article covers it and beyond when it doesn't ("Is LBW allowed in box cricket?" on an article that doesn't say is beyond).

Answering from the article (scope article):
- Use only what the article says. Never add venues, prices, timings, ratings, advice or facts of your own, and never guess (the one exception is the general look of a thing the reader asks to see, under art). Quote numbers exactly as the article writes them (₹1,100, 4.8, 24 hours, 60x30), with the date and the caveat it gives for them ("listed on TapTurf, 22 Oct 2026", "as listed, not confirmed").
- Keep the article's meaning exactly as strong as it is: its hedges ("usually", "most", "about", "or smaller"), its scope ("on the premises", not "on the pitch"), its thresholds ("well under ₹1 lakh" stays that), and its conditions and consequences ("no refund if you cancel because your squad decided it was too wet" never becomes "no refund if your squad cancels"; "will get you turned away" stays "will"). Keep every qualifier a rule has and add none: "straight over the roof 6" keeps "straight", "on the full" stays in, and never say how a shot travels ("along the ground") unless the article does. Keep what each number measures: "90m x 60m minimum, real 22-yard pitch" is a 90m x 60m ground and a 22-yard pitch, never a 90m pitch. A statistic keeps its denominator and qualifier ("median of the 79 cages that list a rate", "average rating, venues with 20+ reviews"). Never merge two figures into a new range, or two rules with different scopes or penalties into one. When the article says something varies by venue, say so.
- Cheapest, highest, most, best-rated and the like: read every row of the matching DATASETS column ("weekend nights" is the weekend evening column), leave out cells that aren't amounts (Call, -) and say so, and name the row with the extreme value. The table wins when the article's prose says otherwise. When the article ranks by a median or an average and another row has the lowest (or highest) single figure, say that in a point. When that column has five or more rows whose values differ enough to see (ratings only when they differ by 0.3 or more), show it as bars, sorted to match (asc for cheapest or lowest, desc for highest). Before you reply, check that nothing you call the cheapest costs more than something else you name.
- "Which turfs" or "which venues": name every venue card [V] whose listed hours, prices, sports or area put it in the group asked about, and the areas the article lists for that group. Never say the article doesn't name a venue when a [V] card fits.
- A yes/no question about a group ("are these open at night", "do they have parking"): when only some qualify, start with how many ("Only 4 of the top 10", "Top 10 mein sirf 4"), name them, and say what the rest have instead. Never start with a bare yes.
- Times of day: "open at night", "raat ko khule" or "late" is not only "open 24 hours". Give what the article has for the evening and night (evening and weekend-night rates, closing times, the 24-hour count), so a venue that plays till late doesn't sound closed. "After midnight" or "past midnight" counts the venues open 24 hours (every day and some days) as well as those closing after midnight, while "until midnight" or "closes at midnight" is not after midnight. Lead with the total that matches, break it down by the article's rows, and say how it differs from the headline figure.
- A question broader than the article (what to wear, when it covers only shoes): answer what it covers and say in one clause that it goes no further.
- A question about one row of a reference table (a sole code, a format, a tier): add a point on the row it is most often confused with.
- "Give me 3 tips" or "top 5": exactly that many, all in points. The answer is one short sentence framing them that names none of them ("Three from the article's bowling section:").
- A calculation the article has a rule or calculator for (splitting a rate per head): give the result, and one point from the article that changes it (a bigger squad, a weekend rate).
- answer: the direct answer first, in one to three short sentences, naming the venues, areas and amounts asked about. When the article covers part of the question, start with what it says, never with what it lacks. Never talk about your own choice of visual ("a diagram fits here"); explain the thing, then introduce the visual in at most one clause.
- points: up to five more facts from the article that help, one sentence each under 20 words. Each adds something the answer and the visual don't have: never restate a fact or an amount from either, and never describe the article ("The article says", "using X as its example"); state the fact itself. Empty when the answer says it all, as it usually does for a simple question. Before you reply, check that no point contradicts the answer or another point, and that no point names something the answer says is missing.
- sections: the S numbers of the sections the answer, points and visual actually come from, one for each distinct place, at least one. Never S0, the opening, unless something you say is in the opening. An answer from the FAQ cites the section the FAQ sits in; a caveat about the data (sample size, coverage) cites the section about the data.
- turfs: the V numbers of the venues you name in the answer, points or visual, in that order, six at most. Never a venue you don't name.
- sources: the R numbers of the article's sources that back the answer, when it has them and they do (always for "where do these numbers come from"). Empty otherwise.

The other scopes:
- beyond: answer in one sentence that the article doesn't cover it, adding what it does say that comes closest, if anything. points empty; sections: the closest section, if any; visual none. A web search then answers the question itself.
- search: a short line in answer (it isn't shown); everything else empty.
- off_topic: answer with one kind, light line steering back to the article or to finding a game; for a greeting, greet back and say what you can do with this article. Everything else empty except followups.

Writing: Indian English, plain words, the way a friend who plays would put it. No emoji, no exclamation marks, no markdown, no lists inside the answer, no links, phone numbers or emails. Players write in English, Hinglish, Hindi or Marathi: write answer, points and followups in the mix they used, in Latin script, keeping names and amounts as the article writes them.

visual: one at most, and kind none when words are enough, which is most of the time.
- bars: one measure across several things (every bar the same kind of number in the same unit), when the reader asks for a chart, graph or ranking of amounts, asks which is cheapest or highest across a table, or wants the short version of a ranking or price article. Never bars of unrelated headline numbers (a count, a price and a rating side by side): those are stats. Best from a dataset: dataset is its D number, label_column the column with the names, value_column the column with the amounts, sort desc for highest first, asc for cheapest first or none for the article's order, unit says what the numbers are ("₹ per hour", "rating out of 5", "Google reviews", "cages"), and title names exactly what that column measures in its own words (a Rating column is "Google rating", never "rates" or "prices"); bars stays empty. Only when no dataset fits, give bars from numbers the text states: 2 to 16 of them, one unit for all, each value exactly as the article states it, never a sum, average, conversion or estimate. A chart shows at most 16 bars: with more rows than that, say which ones it shows, never "each of the N".
- steps: a how-to, a process, or a numbered list of rules or tips from the article, in order: 2 to 6 steps (the most important, for a long list), each a title of at most six words and one sentence of detail.
- compare: X vs Y. columns are the two or three things compared; rows are 2 to 8 aspects, each a label and exactly one short value per column, as the article puts it ("₹600", "24 hours", "Not listed"). Include every row the article itself calls the difference between the sides, and, for two formats of a game, one row on the rules that change. When two rows are separate labels in the data (Cricket and Box Cricket), a point says so. When the article warns about the comparison itself (a small sample), say so in a point.
- stats: two to four headline numbers: value as the article writes it ("83", "₹800", "4.39"), label saying what it counts with any qualifier the article puts on it ("Average rating, venues with 20+ reviews"). The answer then adds something the tiles don't show.
- art: a drawing, only when the reader asks to see, draw, picture or diagram something, or when a picture of a physical layout or object (a box cricket cage and its walls, a 5-a-side pitch and its markings, a stud pattern, how runs are scored off each wall) makes the answer much clearer. Never for numbers (that is bars) or processes (steps). The article need not describe the thing: "what does a cage look like", "show me a 5-a-side pitch" or "draw a turf shoe's studs" on an article about that sport or kit always gets art, scope article. Never decline, and never answer with only a description or a web search, because the article gives no layout or measurements.
  When the reader asks what something looks like, or to see, draw or picture it: the answer starts with what it looks like, in one or two plain sentences; when the article doesn't describe it, what it usually looks like, said as usual ("A box cricket cage is usually a netted box: nets on all four sides and overhead, an artificial-turf floor and floodlights"). Then what the article itself says about it (its sizes, prices, what to ask for, the hero image). For any other question with a drawing, the answer rule above holds: the direct answer first, the drawing introduced in a clause. Cite the section that mentions the thing.
  art_brief: at most 450 characters, terse. The view first, then each part to draw with its label together ("far end wall: Straight boundary"), every part and nothing else. Parts the article doesn't name may be drawn when the thing always has them (a cage's netted walls and roof net, turf floor, floodlights, stumps at both ends of the pitch), labelled plainly. Labels: three words at most each, in the article's words where it has them, each on or pointing to the middle of the part it names. Fix the orientation of anything with ends: in a cricket cage, the back wall is behind the batter and the far end is the straight boundary (never "back wall" at both ends), with the batter and bowler marked. A shot is an arrow that goes where the rule says (a straight shot runs along the pitch to the far end wall), never a shaded zone, and a run label keeps the rule's condition ("6, on the full"). Copy any measurement with its unit exactly as the article writes it ("90m x 60m"); a size it gives without a unit is "60x30, no unit given, add none"; never a size given for something else. alt describes the picture in one sentence; title says what it shows.
- When the reader says chart, graph or plot: bars from the article's main ranking or price table whenever a dataset has one ₹ or numeric column over three or more rows; stats only when none does, and never a copy of the tiles the article already shows at the top.
- "Chart the key numbers": that chart, and points giving the headline numbers it doesn't show (counts, medians, ranges, records, averages), each with its amount, its qualifier and the venue or city it belongs to ("The highest listed rate is ₹4,400 an hour, at Meridian Tightend Sports Arena in Madhapur").
- "Explain it with a diagram": art when the article's subject has a physical layout (a ground, cage, pitch, court or kit; for a versus article on two grounds, both side by side from above with the article's measurements), else bars for a ranking or prices, compare for any other versus article, steps for a how-to or list of rules, stats for a few headline numbers.
- When the article doesn't have the material for what was asked, kind none, and say in the answer that the article has no numbers (or steps) to draw it from, and what it does have.
- The answer and points describe the visual you actually chose (a chart is bars, tiles are stats, a table is compare, a drawing is art), and never explain how it is drawn (scales, units, axes).
- Fields a kind doesn't use: null, empty arrays, sort "none"; title "" for none.

followups: two or three short questions that a specific sentence of this article answers, eight words at most, in the player's own language mix (Hinglish in, Hinglish out), like "How much is a weekend night slot?". Never the question just asked, a rephrasing of it or its translation, one your answer or points already answer, or one about a topic or number the article doesn't give.

The conversation: earlier turns, from anywhere on TapTurf, may come before the message. Use them to understand it; answer only the last message.

The article follows.`;

/** Sent in place of the reader's words for "Summarize this blog": the answer is the same however they asked. */
const SUMMARY_ASK = `Summarize this article.

The short version, in place of the answer rules above:
- scope: article.
- answer: the article's main point or conclusion in one sentence of at most 28 words, in its own framing (when it ends on a callout stating its main principle, that principle). When it ranks or lists a selection, say how many of how many ("its top 10 of 83"). Never start with "This article", "The article" or "The blog".
- points: three to five key takeaways in the article's order, one sentence each under 20 words, keeping the concrete names, areas, prices, numbers, dates and qualifiers it gives, every range and count exactly as written. A price or ranking article's points give its headline price figures (medians, ranges) with their qualifiers. When the article explains how its list or ranking was made, one point says how. When it gives a set of tiers or thresholds, give all of them. Never give in a point an item or number the visual shows: for a list of rules, the points and the steps together cover as many different rules as fit, always including any with a money or booking consequence (deposits, damage charges, refunds, cancellation).
- sections: the S numbers of every section the answer, points and visual come from, in the article's order, up to twelve.
- sources: the R numbers of the sources behind the numbers in your points, up to four, whenever the article cites sources.
- turfs: the V numbers of the venues the answer and points name, and only those.
- visual: required when the article has the material. A ranking of venues: bars of the column that best shows how they differ (ratings only when they differ by 0.3 or more; otherwise reviews or the main ₹ rate). An article about prices: bars from a dataset whose value column is ₹ amounts, else stats from its key numbers, never ratings or reviews. A how-to or a numbered list of rules or tips: steps, its 4 to 6 most important. A versus article: compare. A few headline numbers: stats. Otherwise none. Never art.
- followups: two or three questions a specific section answers that a reader would ask next.`;

const WEB_SYSTEM = `You answer a player's question for TapTurf, an Indian directory of turfs, courts and pickup games. They are reading one of TapTurf's articles, which doesn't cover it, so search the web (once, twice at most) and answer from what you find.
- Two to four short sentences, the direct answer first, for players in India: ₹, Indian cities and conditions where it matters.
- Every fact from the pages you found, and only from pages about the same thing that was asked: a box cricket turf is not a practice net, a futsal court is not a football pitch, a club's own rules are not the laws of the game. Use only pages whose content you actually got: never one that showed "Page not found", an error or nothing. If the pages don't answer it, say so in one sentence rather than guess.
- Sport, fitness, kit, rules, venues and games only. For anything else, say in one line that you can only help with sport.
- Plain Indian English: no lists, headings, markdown, links, emoji, phone numbers or emails. Don't mention searching or the results; just answer.
- Don't send the player to other booking apps or websites: TapTurf lists venues itself.`;

const SUMMARY_REPLY = "Here's the short version of this article.";

/** The reader asked for a chart in so many words. */
const CHART_ASK = /\b(chart|graph|plot|bars?|visuali[sz]e)\b/i;

/**
 * By default the answer must be ready this long after answerBlog starts.
 * The route passes its own deadline: the chat gives up at 45 s.
 */
const BUDGET_MS = 38_000;
/**
 * The first call, which reasons before it answers (a table read wrong is
 * a wrong answer), at most. The short version of a long article reasons
 * longest: at 16 s the lease guide's timed out twice. It is kept for
 * good once made, so its first reader's wait is the only one.
 */
const ANSWER_MS = 22_000;
const SUMMARY_MS = 30_000;
/** Time left for one more try after an overload or a dropped connection. */
const RETRY_MIN_MS = 8_000;
/** Each page a web answer links to is checked for this long, at most. */
const LINK_CHECK_MS = 3_000;
/** The web search, at most. */
const WEB_MS = 18_000;
/** Below this, a web search is not worth starting. */
const MIN_WEB_MS = 6_000;
/** The allowance check, at most: a slow database must not eat the search's time. */
const TAKE_MS = 2_500;

class NoAnswer extends Error {
  constructor(
    readonly usage: AskUsage,
    readonly reason?: unknown,
  ) {
    super("blog answer: the model declined or returned nothing usable");
  }
}

/** No web answer this time (the search failed or found nothing, too late, or today's searches are used up). Never kept: it may work next time. */
class NoWeb extends Error {
  constructor(
    readonly usage: AskUsage,
    readonly why: "late" | "capped" | "none",
  ) {
    super(`blog answer: no web answer (${why})`);
  }
}

type Stored = Composed & { usage: AskUsage; run: string };
type WebStored = { web: WebAnswer; usage: AskUsage; run: string };

/** An error that may pass on a second try: overloaded, rate limited, a server error or a dropped connection (not a timeout). */
function transient(e: unknown): boolean {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return false;
  if (e instanceof Anthropic.APIConnectionError) return true;
  return e instanceof Anthropic.APIError && (e.status === 429 || (e.status ?? 0) >= 500);
}

/**
 * How long to wait before asking again after `e`: what the API asked for
 * (retry-after-ms, retry-after), else a short jittered pause. Null when
 * it said not to try again (x-should-retry: false).
 */
function retryWait(e: unknown): number | null {
  const h = e instanceof Anthropic.APIError && e.headers instanceof Headers ? e.headers : null;
  if (h?.get("x-should-retry") === "false") return null;
  const ms = Number(h?.get("retry-after-ms"));
  if (Number.isFinite(ms) && ms > 0) return Math.ceil(ms);
  const after = h?.get("retry-after");
  if (after) {
    const secs = Number(after);
    if (Number.isFinite(secs) && secs >= 0) return Math.ceil(secs * 1000);
    const at = Date.parse(after);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 500 + Math.floor(Math.random() * 500);
}

/** A short, stable digest of `parts`, for cache keys. */
const digest = (...parts: string[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 20);

// In every cache key, so a change to any prompt makes new keys.
const PROMPTS = digest(SYSTEM, SUMMARY_ASK, SUMMARY_REPLY, WEB_SYSTEM);

const tidy = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
// The model's own [S2] or [V3] in its words: the links show those.
const untag = (s: string) => tidy(s.replace(/\s*\[(?:[SDRV]\d+(?:\s*,\s*)?)+\]/g, ""));

/** At most n characters: whole sentences when one fits, else cut at a word. */
function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (end > n * 0.4) return cut.slice(0, end + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > n * 0.6 ? cut.slice(0, space) : cut.slice(0, n - 1)).replace(/[\s,;:.–-]+$/, "")}…`;
}

// The FAQ and sources headings are not what the article covers.
const END_MATTER = /^(faq|frequently asked|sources)/i;

/** Without the model: the article's description and headings, linked to its sections. */
function outline(post: Post, article: Article, mode: BlogAsk["mode"]): Composed {
  const o = outlineOf(post);
  return {
    search: false,
    reply:
      mode === "summary"
        ? "I can't write the short version right now, so here's what this article covers."
        : "I can't answer questions about this article right now. Here's what it covers.",
    blog: {
      slug: post.slug,
      title: post.title,
      readMinutes: post.readMinutes,
      mode,
      kind: "outline",
      gist: o.gist,
      points: o.points,
      visual: null,
      sections: pickSections(
        article,
        article.sections.filter((s) => s.id && !END_MATTER.test(s.title)).map((s) => s.n),
      ),
      sources: [],
      web: [],
      turfs: [],
      cta: post.cta ?? null,
    },
    // The model is down, so questions about the article would fail too; the route adds city chips.
    followups: [],
    scope: "none",
  };
}

/** Earlier turns as the chat showed them, for the model. */
function turnsOf(history: BlogAsk["history"]) {
  return history.flatMap((h) => [
    { role: "user" as const, content: h.user },
    // The API refuses an empty turn.
    { role: "assistant" as const, content: h.reply || "(no answer shown)" },
  ]);
}

/** The earlier turns, then the message (for a summary, the fixed ask). */
function messagesFor(ask: BlogAsk, history: BlogAsk["history"]) {
  return [...turnsOf(history), { role: "user" as const, content: ask.mode === "summary" ? SUMMARY_ASK : ask.question }];
}

/** The conversation as the model is sent it, for the cache key ("" for none). */
const historyKey = (history: BlogAsk["history"]) => (history.length ? digest(JSON.stringify(turnsOf(history))) : "");

/**
 * One web search for a question the article doesn't cover, sent the turn
 * before it (`before`, "" for none). Null when it fails or finds nothing
 * to stand on.
 */
async function webAnswer(post: Post, question: string, before: string, usage: AskUsage, timeout: number): Promise<WebAnswer | null> {
  const city = CITIES.find((c) => c.id === post.city);
  try {
    const res = await getAnthropic().messages.create(
      {
        model: ROUTER_MODEL,
        // Thinking off: it counts toward max_tokens, and at 1200 it left
        // replies cut off before the answer (as on the compare call).
        max_tokens: 1500,
        thinking: { type: "disabled" },
        system: WEB_SYSTEM,
        messages: [
          {
            role: "user",
            // A follow-up ("and in Pune?") needs the turn before it.
            content: `They are reading "${post.title}" on TapTurf.${before ? ` Before this they asked: ${before}` : ""} Question: ${question}`,
          },
        ],
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 2,
            user_location: { type: "approximate", country: "IN", timezone: "Asia/Kolkata", ...(city ? { city: city.label } : {}) },
          },
        ],
        output_config: { effort: "low" },
      },
      { timeout, maxRetries: 0 },
    );
    addUsage(usage, res.usage);
    // A page the search found can be gone by now: it isn't shown, nor what it alone said.
    const dead = await deadPages(candidatePages(res.content));
    if (dead.size) console.warn("blog answer: pages gone from a web answer", { slug: post.slug, dead: dead.size });
    const got = readWebAnswer(res.content, res.stop_reason, dead);
    if (!got) {
      console.warn("blog answer: web search gave nothing usable", {
        slug: post.slug,
        stop: res.stop_reason,
        blocks: res.content.map((b) => (b.type === "web_search_tool_result" && !Array.isArray(b.content) ? `error:${b.content.error_code}` : b.type)).join(","),
      });
    }
    return got;
  } catch (e) {
    console.error("blog answer: web search failed", post.slug, e);
    return null;
  }
}

/**
 * The start of a page a web answer would link to; "blocked" when it is
 * no page to send a reader to (not http(s) on the usual ports, an IP
 * address, or a name that points into a private network: never fetched
 * from here); null when it can't be read by `until` (kept: a bot block
 * or a slow site may still open for the reader). A redirect is not
 * followed: it counts as a live page.
 */
async function pageStart(url: string, until: number): Promise<{ status: number; head: string } | "blocked" | null> {
  const host = fetchableHost(url);
  if (!host) return "blocked";
  try {
    const left = until - Date.now();
    const addrs = await Promise.race([lookup(host, { all: true }), new Promise<null>((r) => setTimeout(() => r(null), Math.max(0, left)))]);
    if (addrs === null) return null;
    if (addrs.length === 0 || addrs.some((x) => privateAddress(x.address))) return "blocked";
  } catch {
    return null;
  }
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(Math.max(250, until - Date.now())),
      headers: { "user-agent": "Mozilla/5.0 (compatible; TapTurf link check; +https://www.tapturf.in)", accept: "text/html,*/*" },
    });
    let head = "";
    const reader = res.body?.getReader();
    if (reader) {
      const text = new TextDecoder();
      // The title is near the top: 24 KB is plenty.
      while (head.length < 24_000) {
        const { done, value } = await reader.read();
        if (done) break;
        head += text.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => {});
    }
    return { status: res.status, head };
  } catch {
    return null;
  }
}

/** The pages of `urls` that are gone or no page for a reader, by pageKey. Takes LINK_CHECK_MS at most. */
async function deadPages(urls: string[]): Promise<Set<string>> {
  const until = Date.now() + LINK_CHECK_MS;
  const checked = await Promise.all(urls.map(async (u) => ({ u, p: await pageStart(u, until) })));
  return new Set(checked.filter(({ p }) => p === "blocked" || (p !== null && deadPage(p.status, p.head))).map(({ u }) => pageKey(u)));
}

/**
 * One search off today's shared allowance. An unset key or a failing
 * check lets it through: a search costs a paisa or two, and the ask has
 * passed the per-IP budget. Only drawings (the money) fail closed.
 */
async function takeSearch(slug: string): Promise<boolean> {
  const key = accountKey();
  if (!key) return true;
  try {
    const { data, error } = await createReadOnlyClient()
      .rpc("ask_ai_take", { p_key: key, p_kind: "web" })
      .abortSignal(AbortSignal.timeout(TAKE_MS));
    if (error) {
      console.warn("blog answer: web allowance check failed, searching anyway", slug, error.message);
      return true;
    }
    if (data === false) console.warn("blog answer: today's web searches are used up", slug);
    return data !== false;
  } catch (e) {
    console.warn("blog answer: web allowance check failed, searching anyway", slug, e);
    return true;
  }
}

/** A web answer found now, or NoWeb. Starts only with time for the check and a search before `deadline`. */
async function searchWeb(post: Post, question: string, before: string, usage: AskUsage, deadline: number): Promise<WebAnswer> {
  if (deadline - Date.now() < TAKE_MS + MIN_WEB_MS + LINK_CHECK_MS) throw new NoWeb(usage, "late");
  if (!(await takeSearch(post.slug))) throw new NoWeb(usage, "capped");
  // The search, then the check of its pages, before the deadline.
  const left = deadline - Date.now() - LINK_CHECK_MS;
  if (left < MIN_WEB_MS) throw new NoWeb(usage, "late");
  const web = await webAnswer(post, question, before, usage, Math.min(WEB_MS, left));
  if (!web) throw new NoWeb(usage, "none");
  return web;
}

/** The model's reply made into what the reader sees; for beyond, the article-only answer (answerBlog adds the web). Throws NoAnswer. */
/** The words a visual shows (bar labels, step titles, table cells), for telling which venues it names. */
function visualText(v: BlogVisual | null): string {
  if (!v) return "";
  switch (v.kind) {
    case "bars":
      return v.bars.map((b) => b.label).join(" ");
    case "steps":
      return v.steps.map((x) => `${x.title} ${x.detail}`).join(" ");
    case "compare":
      return [...v.columns, ...v.rows.flatMap((r) => [r.label, ...r.values])].join(" ");
    case "stats":
      return v.stats.map((x) => x.label).join(" ");
    default:
      return "";
  }
}

async function compose(post: Post, article: Article, ask: BlogAsk, history: BlogAsk["history"], usage: AskUsage, deadline: number): Promise<Composed> {
  const summary = ask.mode === "summary";
  const info: { refused?: boolean } = {};
  const most = summary ? SUMMARY_MS : ANSWER_MS;
  // Its own deadline: the client's 20 s and its retries could take far longer.
  const ask1 = (timeout: number) =>
    structured(
      BlogReply,
      {
        model: ROUTER_MODEL,
        max_tokens: 1800,
        system: [
          { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
          { type: "text", text: article.prompt, cache_control: { type: "ephemeral" } },
        ],
        messages: messagesFor(ask, history),
      },
      "blog-answer",
      usage,
      info,
      // Both of structured()'s tries end by the deadline.
      { timeout, maxRetries: 0, think: true, deadline },
    );
  let out: BlogReply | null;
  try {
    out = await ask1(Math.max(5_000, Math.min(most, deadline - Date.now())));
  } catch (e) {
    // Overloaded, rate limited or a dropped connection: once more in the
    // time left, after the wait the API asks for. A timeout would only
    // time out again.
    const wait = transient(e) ? retryWait(e) : null;
    if (wait === null || deadline - Date.now() - wait < RETRY_MIN_MS) throw new NoAnswer(usage, e);
    console.warn("blog answer: trying again after", e instanceof Anthropic.APIError ? e.status : e, `in ${wait} ms`);
    await new Promise((r) => setTimeout(r, wait));
    try {
      out = await ask1(Math.min(most, deadline - Date.now() - 500));
    } catch (e2) {
      throw new NoAnswer(usage, e2);
    }
  }
  if (!out) {
    if (info.refused) console.warn("blog answer: declined", post.slug);
    throw new NoAnswer(usage);
  }
  // The short version is always about the article, whatever the model called it.
  const scope = summary ? "article" : out.scope;
  if (scope === "search") return { search: true };

  const answer = untag(out.answer);
  const points = [...new Set(out.points.map((p) => clip(untag(p), 220)).filter(Boolean))].slice(0, 5);
  if (!answer || (summary && points.length === 0)) throw new NoAnswer(usage);
  const followups = cleanFollowups(out.followups.map(untag), ask.question);
  const base = { slug: post.slug, title: post.title, readMinutes: post.readMinutes, mode: ask.mode, cta: post.cta ?? null };

  if (scope === "off_topic") {
    return {
      search: false,
      reply: clip(answer, 700),
      blog: { ...base, kind: "ai", gist: "", points: [], visual: null, sections: [], sources: [], web: [], turfs: [] },
      followups,
      scope,
    };
  }

  // The short version's chart must show a difference: ten ratings of 4.8 from zero look alike.
  let visual = buildVisual(article, summary ? livelierBars(article, out.visual) : out.visual, (brief, alt) => signArt(post.slug, brief, alt));
  // A chart nobody asked for that shows no difference (best-rated: ten bars of 4.8 to 5.0) says nothing the answer doesn't.
  if (!summary && flatBars(visual) && !CHART_ASK.test(ask.question)) visual = null;
  // A summary of a rules list can draw on a dozen sections; an answer on a few.
  const maxSections = summary ? 12 : 4;
  let cited = pickSections(article, out.sections, maxSections).map((x) => x.n);
  // The model now and then leaves out where a point's number or venue
  // comes from: a section that alone holds it is cited too.
  if (scope === "article") cited = [...cited, ...backingSections(article, [answer, ...points, visualText(visual)], cited, maxSections - cited.length)];
  let sections = pickSections(article, cited, maxSections);
  if (scope === "article" && sections.length === 0) sections = pickSections(article, [0]);
  // beyond: the article doesn't say. Only a drawing survives: anything
  // else in a visual was the model's own.
  if (scope === "beyond" && visual?.kind !== "art") visual = null;
  const blog: BlogAnswer = {
    ...base,
    kind: "ai",
    gist: summary ? clip(answer, 260) : "",
    points: scope === "beyond" ? [] : points,
    visual,
    sections,
    sources: pickSources(article, out.sources),
    web: [],
    // Only venues the reader is told about: the model now and then lists more.
    turfs: turfsNamed(pickTurfs(article, out.turfs), [answer, ...points, visualText(visual)].join(" ")),
  };
  return { search: false, reply: summary ? SUMMARY_REPLY : clip(answer, 700), blog, followups, scope };
}

/**
 * Today's web answer to `question` on `post`: one another request found,
 * else a new search. Null when there is none; the tokens this request
 * spent go into `paid` either way.
 */
async function webPart(post: Post, article: Article, question: string, before: string, run: string, paid: AskUsage, deadline: number): Promise<WebAnswer | null> {
  try {
    const got = await unstable_cache(
      async (): Promise<WebStored> => {
        const usage = newUsage();
        return { web: await searchWeb(post, question, before, usage, deadline), usage, run };
      },
      ["blog-web-v2", post.slug, article.hash, PROMPTS, questionKey(question), before ? digest(before) : "", webDay()],
      // Never stale while its day is in the key, so never refreshed in the
      // background (where no request logs the tokens); the next day is a new key.
      { revalidate: 86_400, tags: ["blog-web"] },
    )();
    if (got.run === run) addUsage(paid, got.usage);
    return got.web;
  } catch (e) {
    if (e instanceof NoWeb) addUsage(paid, e.usage);
    else console.error("blog answer: web part failed", post.slug, e);
    return null;
  }
}

/**
 * The answer to `ask` about `post`, or { search: true } when the message
 * is a turf or game search for the route's usual pipeline. `usage` is set
 * only when this call paid for some of the answer. Ready by `deadline`
 * (ms since 1970), or near it when the model is slow.
 */
export async function answerBlog(post: Post, ask: BlogAsk, deadline = Date.now() + BUDGET_MS): Promise<BlogResult> {
  const article = readArticle(post);
  if (!isAskConfigured()) return { ...outline(post, article, ask.mode), usage: null };
  const summary = ask.mode === "summary";
  // The short version doesn't depend on the conversation, so it is always
  // asked (and kept) without it, as it was before answers existed.
  const history = summary ? [] : ask.history.filter((h) => h.user.trim());
  // Tells this request's own calls apart from answers another request stored.
  const run = randomUUID();
  const paid = newUsage();
  const spent = () => (paid.calls ? paid : null);

  let first: Stored;
  try {
    first = await unstable_cache(
      async (): Promise<Stored> => {
        const usage = newUsage();
        const composed = await compose(post, article, ask, history, usage, deadline);
        return { ...composed, usage, run };
      },
      ["blog-answer-v2", post.slug, article.hash, PROMPTS, ask.mode, summary ? "" : questionKey(ask.question), historyKey(history)],
      { revalidate: false, tags: ["blog-answer"] },
    )();
    if (first.run === run) addUsage(paid, first.usage);
  } catch (e) {
    if (e instanceof NoAnswer) {
      addUsage(paid, e.usage);
      if (e.reason) console.error("blog answer: failed", post.slug, e.reason);
    } else console.error("blog answer: failed", post.slug, e);
    return { ...outline(post, article, ask.mode), usage: spent() };
  }
  if (first.search) return { search: true, usage: spent() };
  const { reply, blog, followups, scope } = first;
  if (scope !== "beyond") return { search: false, reply, blog, followups, scope, usage: spent() };

  // The article doesn't say, so the web answers when it can; else the article-only answer stands.
  const web = await webPart(post, article, ask.question, history.at(-1)?.user ?? "", run, paid, deadline);
  if (!web) return { search: false, reply, blog, followups, scope, usage: spent() };
  return {
    search: false,
    reply: web.text,
    // Nothing in the article backs a web answer, so it lists no section,
    // source or venue; a drawing the reader asked for stays.
    blog: { ...blog, kind: "web", points: [], sections: [], sources: [], turfs: [], web: web.links },
    followups,
    scope,
    usage: spent(),
  };
}
