import { z } from "zod";
import { loadTurfPage } from "@/lib/queries/turfPage";
import { scrubBookingApps } from "@/lib/utils/bookingApps";
import type { Turf } from "@/types/turf";
import { ROUTER_MODEL, structured, type AskUsage } from "./ask";
import { ANSWER_SYSTEM, COMPARE_SYSTEM } from "./answerRules";
import { buildFacts, type TurfFacts } from "./facts";

/**
 * Compare and question answering. Both run on a fact sheet built from
 * the turf's page data (lib/ai/facts.ts), and both prompts
 * (lib/ai/answerRules.ts) forbid anything that isn't in the sheet: a
 * missing field is "not listed", never a guess. Both run on Haiku 5.5.
 */

// Haiku for both: the comparison is a rewrite of the fact sheet, not
// reasoning, and credits are shared with other projects.
export const COMPARE_MODEL = ROUTER_MODEL;

export type { TurfFacts };

/**
 * The venue and its fact sheet from one turf_page call, the read the turf
 * page makes: the row, its live reviews (players' own first), and the
 * TapTurf report stats, scorecard counts and play-again answers. Null when
 * the read fails (logged) or the turf is gone, so that venue is skipped
 * rather than failing the whole comparison.
 */
export async function loadFacts(id: string): Promise<{ turf: Turf; facts: TurfFacts } | null> {
  const page = await loadTurfPage(id).catch((e) => {
    console.warn("compare: turf read failed", id, e);
    return null;
  });
  if (!page) return null;
  return {
    turf: page.turf,
    facts: buildFacts(page.turf, { reviews: page.reviews, stats: page.reviewStats, aspects: page.reviewAspects, playAgain: page.playAgain }),
  };
}

/**
 * The model's words only. The table under them (prices, ratings, hours,
 * facilities) is built from the rows (lib/ask/cards.ts compareTable), so
 * it never says a number the model wrote.
 */
export const CompareOut = z.object({
  /** One or two sentences: which suits whom. */
  verdict: z.string(),
  /** One short phrase per venue, same order as the input. */
  best_for: z.array(z.string()),
  caveats: z.string().nullable(),
});
export type CompareOut = z.infer<typeof CompareOut>;

export async function compareTurfs(sheets: TurfFacts[], usage?: AskUsage): Promise<CompareOut | null> {
  const out = await structured(
    CompareOut,
    {
      model: COMPARE_MODEL,
      max_tokens: 600,
      system: [{ type: "text", text: COMPARE_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Fact sheets, in order:\n${JSON.stringify(sheets)}` }],
    },
    "compare",
    usage,
  );
  if (!out) return null;
  // The sheets name no booking app; nor does what is shown, whatever the model wrote.
  const verdict = scrubBookingApps(out.verdict);
  if (!verdict) return null;
  return {
    verdict,
    best_for: out.best_for.map((b) => scrubBookingApps(b) ?? ""),
    caveats: scrubBookingApps(out.caveats),
  };
}

export const AnswerOut = z.object({
  /** At most two sentences (three about what people say). */
  answer: z.string(),
  /** True when the fact sheet actually covers the question. */
  covered: z.boolean(),
});
export type AnswerOut = z.infer<typeof AnswerOut>;

/** opts.deadline (ms since 1970): every try ends by it (structured), for a question with a plain answer to fall back on. */
export async function answerQuestion(question: string, sheet: TurfFacts, usage?: AskUsage, opts?: { deadline?: number }): Promise<AnswerOut | null> {
  const out = await structured(
    AnswerOut,
    {
      model: ROUTER_MODEL,
      max_tokens: 300,
      system: [{ type: "text", text: ANSWER_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `Question: ${question}\n\nFact sheet:\n${JSON.stringify(sheet)}` }],
    },
    "answer",
    usage,
    undefined,
    opts?.deadline ? { deadline: opts.deadline } : undefined,
  );
  // A question that names an app ("is it on Playo?") must not get it named back.
  const answer = out ? scrubBookingApps(out.answer) : null;
  return out && answer ? { ...out, answer } : null;
}
