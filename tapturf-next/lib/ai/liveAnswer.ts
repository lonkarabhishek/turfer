import { z } from "zod";
import { liveFallback, numbersOk, type LiveFacts } from "@/lib/ask/live";
import { mentionsBookingApp } from "@/lib/utils/bookingApps";
import { ROUTER_MODEL, isAskConfigured, structured, type AskUsage } from "./ask";

/**
 * Ask on a live score page, for a question about the match that isn't one
 * of the usual ones (lib/ask/live.ts liveReply answers those without a
 * model): Claude Haiku phrases an answer from the facts lib/ask/live.ts
 * worked out from the match, and only from them. Its reply is used only
 * when every number in it is one the facts have and it names no booking
 * app; otherwise, and without the model, the player gets where the match
 * stands (liveFallback). Never cached: the score changes every ball.
 */

const LiveReply = z.object({
  /** One to three short sentences. */
  reply: z.string(),
});

const SYSTEM = `You answer one message from a player on TapTurf's live score page for one match. TapTurf is an Indian directory of turfs, courts and pickup games; the scorer keeps score on their phone and this page follows it. The FACTS after these instructions are the live scorecard as it stands now, worked out by TapTurf. Reply only with the JSON object.

- Use only the FACTS. Every number, name, score, over and time you write must be in the FACTS, written the same way. Never work out a new number (no sums, differences, averages, projections or predictions), and never guess who will win: say how it stands.
- When the FACTS don't answer the question, say so in one sentence, then give what they do say that comes closest (the score, who is batting or bowling, how many are needed).
- When the status says the link stopped updating, was turned off, expired or has no score yet, say that first.
- A message that isn't about this match (finding or booking a turf, joining a game, anything else): one light line saying you can tell them about this match here, and that Ask TapTurf on any other page finds turfs and games. Never say a turf or venue can be booked here or online.
- A greeting: greet back and say you can tell them the score, who is batting or bowling, or how many are needed.
- One to three short sentences, Indian English, plain words, the way a friend at the ground would say it. Players write in English, Hinglish, Hindi or Marathi: reply in the mix they used, in Latin script, keeping names and numbers as the FACTS write them.
- No emoji, no exclamation marks, no markdown, no lists, no links, phone numbers or emails. Never name a turf-booking app or booking website.`;

/**
 * The model's answer to `question` from the facts, or the fallback. via
 * says which: "claude" for a reply that passed the checks, "keywords" for
 * the fallback.
 */
export async function answerLive(question: string, facts: LiveFacts, history: { user: string; reply: string }[], usage: AskUsage, deadline: number): Promise<{ reply: string; via: "claude" | "keywords" }> {
  const fallback = { reply: liveFallback(facts), via: "keywords" as const };
  if (!isAskConfigured()) return fallback;
  const before = history
    .slice(-2)
    .map((h) => `Player: ${h.user}\nTapTurf: ${h.reply}`)
    .join("\n");
  try {
    const out = await structured(
      LiveReply,
      {
        model: ROUTER_MODEL,
        max_tokens: 300,
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `FACTS\n${facts.lines.join("\n")}\n\n${before ? `EARLIER IN THE CHAT\n${before}\n\n` : ""}MESSAGE\n${question}` }],
      },
      "live-answer",
      usage,
      undefined,
      { deadline, maxRetries: 0 },
    );
    const reply = out?.reply.replace(/\s+/g, " ").trim() ?? "";
    if (!reply) return fallback;
    // A number the facts don't have, or a booking app: the facts' own words instead.
    if (!numbersOk(reply, facts) || mentionsBookingApp(reply)) {
      console.warn("ask live: reply failed the checks", { question, reply: reply.slice(0, 200) });
      return fallback;
    }
    return { reply: reply.slice(0, 600), via: "claude" };
  } catch (e) {
    console.error("ask live: the model failed", e);
    return fallback;
  }
}
