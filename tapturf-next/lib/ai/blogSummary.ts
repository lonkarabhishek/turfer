import { unstable_cache } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Post } from "@/content/blog";
import { outlineOf, postText } from "@/lib/ask/blog";
import { ROUTER_MODEL, isAskConfigured, newUsage, structured, type AskUsage } from "./ask";

/**
 * "Summarize this blog" in Ask TapTurf: the short version of one of our
 * articles, a sentence and a few takeaways, written by Claude Haiku from
 * the article itself. Kept in Next's data cache per article and edit
 * (slug + updatedAt), so every reader after the first gets it without a
 * model call. Without the model, or when it fails, the reader gets the
 * article's description and section headings instead, never an error.
 * Clear with revalidateTag("blog-summary").
 */

export const BlogSummary = z.object({
  /** One sentence, at most 28 words: what the article concludes. */
  gist: z.string(),
  /** Three to five takeaways, one sentence each. */
  points: z.array(z.string()),
});

export type BlogDigest = { kind: "ai" | "outline"; gist: string; points: string[] };

const SYSTEM = `You write the short version of an article from the blog of TapTurf, an Indian directory of turfs, courts and pickup games, for a reader who is short on time. Reply only with the JSON object.

- gist: one sentence, at most 28 words, giving the article's answer or main point. Never start with "This article" or "The blog".
- points: three to five key takeaways in the article's order, each one sentence under 20 words. Keep the concrete names, areas, prices and numbers the article gives.
- Only what the article says. Never add venues, prices, advice or opinions of your own.
- Indian English, plain words. No emoji, no exclamation marks, no marketing words.`;

class NoSummary extends Error {
  constructor(readonly usage: AskUsage) {
    super("blog summary: the model declined or returned nothing usable");
  }
}

type Stored = { gist: string; points: string[]; usage: AskUsage; run: string };

const tidy = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** The short version of `post`. `usage` is set only when this call paid for it. */
export async function summarisePost(post: Post): Promise<{ digest: BlogDigest; usage: AskUsage | null }> {
  const outline = (): BlogDigest => ({ kind: "outline", ...outlineOf(post) });
  if (!isAskConfigured()) return { digest: outline(), usage: null };
  // Tells this request's own call apart from a summary another request stored.
  const run = randomUUID();
  const read = unstable_cache(
    async (): Promise<Stored> => {
      const usage = newUsage();
      const out = await structured(
        BlogSummary,
        {
          model: ROUTER_MODEL,
          max_tokens: 600,
          system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: postText(post) }],
        },
        "blog-summary",
        usage,
      );
      const points = (out?.points ?? []).map((p) => tidy(p, 220)).filter(Boolean).slice(0, 5);
      if (!out || !out.gist.trim() || points.length === 0) throw new NoSummary(usage);
      return { gist: tidy(out.gist, 260), points, usage, run };
    },
    ["blog-summary-v1", post.slug, post.updatedAt ?? post.publishedAt],
    { revalidate: false, tags: ["blog-summary"] },
  );
  try {
    const got = await read();
    return { digest: { kind: "ai", gist: got.gist, points: got.points }, usage: got.run === run ? got.usage : null };
  } catch (e) {
    if (!(e instanceof NoSummary)) console.error("blog summary: failed", post.slug, e);
    return { digest: outline(), usage: e instanceof NoSummary ? e.usage : null };
  }
}
