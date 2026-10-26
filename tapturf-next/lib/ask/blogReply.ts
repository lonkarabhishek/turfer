import { z } from "zod";

/**
 * What Claude returns when it answers a question about a blog post (or
 * summarises it): lib/ai/blogAnswer.ts asks for it with structured
 * output, lib/ask/blogArticle.ts turns it into what the reader sees.
 * One flat object, every field always present (structured output wants
 * that); unused arrays come back empty and unused fields null.
 *
 * Sections (S), datasets (D), sources (R) and venues (V) are numbers
 * from the article as the model was shown it (readArticle().prompt), so
 * nothing it links to can be made up: unknown numbers are dropped.
 */

export const VISUAL_KINDS = ["none", "bars", "steps", "compare", "stats", "art"] as const;

export const BlogReply = z.object({
  /**
   * article: answered from the article. beyond: on topic, but the article
   * doesn't say (a web search is tried). search: a turf or game search,
   * not a question about the article. off_topic: nothing to do with sport
   * or the article.
   */
  scope: z.enum(["article", "beyond", "search", "off_topic"]),
  /** The direct answer, one to three sentences. For a summary: the article's point in one sentence. */
  answer: z.string(),
  /** Up to five key points, one sentence each. Empty when the answer says it all. */
  points: z.array(z.string()),
  /** S numbers of the sections the answer uses. */
  sections: z.array(z.number()),
  /** R numbers of the article's own sources that back the answer. */
  sources: z.array(z.number()),
  /** V numbers of the venues the answer is about. */
  turfs: z.array(z.number()),
  visual: z.object({
    kind: z.enum(VISUAL_KINDS),
    title: z.string(),
    /** bars from a dataset: its D number and the columns for the label and the value (from 0). */
    dataset: z.number().nullable(),
    label_column: z.number().nullable(),
    value_column: z.number().nullable(),
    sort: z.enum(["desc", "asc", "none"]),
    /** bars: "₹ per hour", "rating", "turfs". */
    unit: z.string().nullable(),
    /** bars without a dataset: every value must be a number the article states. */
    bars: z.array(z.object({ label: z.string(), value: z.number() })),
    steps: z.array(z.object({ title: z.string(), detail: z.string() })),
    /** steps: true for a process (the order matters), false for rules or tips in any order. */
    ordered: z.boolean().nullable(),
    /** compare: the two or three things compared, then a row per aspect with one value per column. */
    columns: z.array(z.string()),
    rows: z.array(z.object({ label: z.string(), values: z.array(z.string()) })),
    stats: z.array(z.object({ value: z.string(), label: z.string() })),
    /** art: what to draw, in a sentence or two, with the labels to show. */
    art_brief: z.string().nullable(),
    alt: z.string().nullable(),
  }),
  /** Two or three short questions about the article the reader might ask next. */
  followups: z.array(z.string()),
});
export type BlogReply = z.infer<typeof BlogReply>;
export type RawVisual = BlogReply["visual"];
