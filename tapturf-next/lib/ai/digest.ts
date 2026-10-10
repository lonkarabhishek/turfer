import { z } from "zod";
import { ROUTER_MODEL, structured } from "./ask";

/**
 * "Where we fell short": Haiku reads a window of Ask TapTurf messages
 * and groups the ones we could not serve into a handful of themes with
 * verbatim examples and one action each. A product roadmap written by
 * the players, for the price of one cheap call a week.
 */

export const AskDigest = z.object({
  /** One sentence on the week. */
  headline: z.string(),
  themes: z.array(
    z.object({
      title: z.string(),
      /** What people were after, plainly. */
      wanted: z.string(),
      /** How many messages in the list fit this theme. */
      count: z.number(),
      /** Two or three messages, verbatim. */
      examples: z.array(z.string()),
      /** One concrete thing the TapTurf team could do. */
      action: z.string(),
    }),
  ),
  /** Two or three things that clearly worked. */
  wins: z.array(z.string()),
});
export type AskDigest = z.infer<typeof AskDigest>;

export type DigestRow = { query: string; intent: string | null; results: number | null; city: string | null };

const SYSTEM = `You review messages players typed into Ask TapTurf, the chat box on an Indian sports venue directory (turfs, courts and pickup games in Nashik, Pune, Mumbai, Nagpur, Hyderabad). Reply only with the JSON object.

Each line is one message with its intent and how many results it got. Group the messages that TapTurf could not serve well into 3 to 6 themes: searches with no results, cities, areas or sports we do not cover, things people expected the product to do (book, pay, see slots, see host numbers), repeated confusion, and off-topic asks that hint at a real need. Ignore plain greetings and tests ("hi", "test", "asdf").

Rules:
- title: 3 to 6 words. wanted: one sentence. count: how many listed messages fit, as an integer. examples: 2 or 3 messages copied exactly as written, no edits, no translation. action: one specific thing the team could do, under 20 words, plain.
- Order themes by count, biggest first. Merge near-duplicates. Hinglish and Marathi messages count like any other.
- wins: 2 or 3 things that clearly worked (intents that got results, languages understood), each under 15 words. Empty if nothing stands out.
- headline: one sentence, under 25 words, on what the week says. Indian English, no hype, no emoji.`;

export async function digestAsks(rows: DigestRow[], days: number): Promise<AskDigest | null> {
  const lines = rows.map((r) => `- "${r.query}" (${r.intent ?? "?"}, ${r.results ?? 0} results${r.city ? `, ${r.city}` : ""})`).join("\n");
  return structured(
    AskDigest,
    {
      model: ROUTER_MODEL,
      max_tokens: 1500,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Last ${days} days, ${rows.length} messages:\n${lines}` }],
    },
    "digest",
  );
}
