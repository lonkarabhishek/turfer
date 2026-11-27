import { z } from "zod";
import { tournamentFallback, tournamentReplyOk, type ReplyCheck, type TournamentFacts } from "../ask/tournament";
import { mentionsBookingApp } from "../utils/bookingApps";
import { ROUTER_MODEL, isAskConfigured, structured, type AskUsage } from "./ask";

/**
 * Ask on a tournament's page, for a question about the tournament that
 * isn't one of the usual ones (lib/ask/tournament.ts tournamentReply
 * answers those without a model): the live score answers' model
 * (lib/ai/liveAnswer.ts: the same client, model, call and token count)
 * phrases an answer from the facts lib/ask/tournament.ts worked out, and
 * only from them. Its reply is shown only when it passes the guard
 * (tournamentReplyOk: no number, name, result or forecast the facts don't
 * have, never "book") and names no booking app; otherwise, and without
 * the model, the player gets the code-built answer (tournamentFallback: a
 * named player's or team's own lines, else "I can't tell that from this
 * tournament's scorecards").
 *
 * The prompt is two cached system blocks, as an article's answer is
 * (lib/ai/blogAnswer.ts): the instructions, then the tournament's digest
 * (facts.lines, capped by lib/ask/tournament.ts DIGEST_MAX_CHARS and free
 * of clocks, so it is the same text until the tournament or a live score
 * changes). A second question about the same tournament reads both from
 * the cache. Nothing is stored for learning; relative imports only, so
 * npm run test:ask runs it with a stand-in for the model.
 */

const TournamentReply = z.object({
  /** One to three short sentences. */
  reply: z.string(),
});

export const TOURNAMENT_SYSTEM = `You answer one message from a player on a TapTurf tournament page. TapTurf is an Indian directory of turfs, courts and pickup games; an organiser runs the tournament on this page and its matches are scored on a phone. The FACTS after these instructions are everything this page shows about the tournament, worked out by TapTurf: the table, every match in one line, the scorecards of the matches scored ball by ball, and the players' numbers. Reply only with the JSON object.

- Use only the FACTS. Every number, name, team, player, score, margin, date and result you write must be in the FACTS, written the same way, and must be about the same team, player or match as in the FACTS. Never work out a new number (no sums, differences, averages, strike rates or projections), and never rank or compare beyond what the FACTS already rank.
- Never say what will happen: no predictions, no "should win", "likely" or "favourites", no who will qualify. Say how it stands.
- A match marked "Typed result" has a score and a margin and nothing else: no batters, bowlers or ball by ball. Asked about players in such a match, say its result was typed in, so there is no scorecard to read. Player numbers come only from matches with a scorecard.
- When the FACTS don't answer the question (a fielder, a toss, the weather, a captain, why something happened, anything the FACTS say was left out), say exactly "I can't tell that from this tournament's scorecards." and then, in one sentence, the closest thing the FACTS do say.
- A message that isn't about this tournament (finding a turf, joining a game, anything else): one light line saying you can tell them about this tournament here, and that Ask TapTurf on any other page finds turfs and games. Never say a turf or venue can be reserved here or online.
- A greeting: greet back and say you can tell them who is ahead, a result, the next match, or a player's numbers where matches were scored ball by ball.
- One to three short sentences, Indian English, plain words, the way a friend at the ground would say it. Start a sentence with a plain word or with a name from the FACTS. Players write in English, Hinglish, Hindi or Marathi: reply in the mix they used, in Latin script, keeping names and numbers as the FACTS write them.
- No emoji, no exclamation marks, no markdown, no lists, no links, phone numbers or emails. Never use the word "book". Never name a turf-booking app or booking website.`;

/** What the model is sent: the instructions, the digest, and the message with the last two turns. */
export type TournamentAsk = { system: string; facts: string; message: string };
/** The model's reply text, or null when it gave none. */
export type Phrase = (ask: TournamentAsk, usage: AskUsage, deadline: number) => Promise<string | null>;

const claude: Phrase = async (ask, usage, deadline) => {
  const out = await structured(
    TournamentReply,
    {
      model: ROUTER_MODEL,
      max_tokens: 400,
      system: [
        { type: "text", text: ask.system, cache_control: { type: "ephemeral" } },
        { type: "text", text: ask.facts, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: ask.message }],
    },
    "tournament-answer",
    usage,
    undefined,
    { deadline, maxRetries: 0 },
  );
  return out?.reply ?? null;
};

/** The request for one question: the digest is a block of its own, the same text for every question about this tournament as it stands. */
export function tournamentAsk(question: string, facts: TournamentFacts, history: { user: string; reply: string }[]): TournamentAsk {
  const before = history
    .slice(-2)
    .map((h) => `Player: ${h.user}\nTapTurf: ${h.reply}`)
    .join("\n");
  return { system: TOURNAMENT_SYSTEM, facts: `FACTS\n${facts.lines.join("\n")}`, message: `${before ? `EARLIER IN THE CHAT\n${before}\n\n` : ""}MESSAGE\n${question}` };
}

/**
 * The model's answer to `question` from the facts, or the fallback. via
 * says which: "claude" for a reply that passed the checks, "keywords" for
 * the fallback; refused: why a reply was not used. phrase: the model call
 * (the tests' and the eval's stand-in); left out, the real one, and the
 * fallback when Ask has no key.
 */
export async function answerTournament(
  question: string,
  facts: TournamentFacts,
  history: { user: string; reply: string }[],
  usage: AskUsage,
  deadline: number,
  phrase?: Phrase,
): Promise<{ reply: string; via: "claude" | "keywords"; refused?: Exclude<ReplyCheck, { ok: true }>["why"] | "app" }> {
  const fallback = { reply: tournamentFallback(facts, question), via: "keywords" as const };
  if (!phrase && !isAskConfigured()) return fallback;
  try {
    const out = await (phrase ?? claude)(tournamentAsk(question, facts, history), usage, deadline);
    const reply = out?.replace(/\s+/g, " ").trim() ?? "";
    if (!reply) return fallback;
    const check = tournamentReplyOk(reply, facts, question);
    const why = !check.ok ? check.why : mentionsBookingApp(reply) ? ("app" as const) : null;
    if (why) {
      // What failed and the reply's start; the question is kept only where Ask keeps every question.
      console.warn("ask tournament: reply failed the checks", { why, reply: reply.slice(0, 200) });
      return { ...fallback, refused: why };
    }
    return { reply: reply.slice(0, 600), via: "claude" };
  } catch (e) {
    console.error("ask tournament: the model failed", e);
    return fallback;
  }
}
