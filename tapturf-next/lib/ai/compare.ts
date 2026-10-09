import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { getTurfById } from "@/lib/queries/turfs";
import { areaFor } from "@/lib/utils/area";
import { labelFor } from "@/lib/city";
import { getPhone } from "@/lib/utils/seo";
import { normaliseOpeningHours, formatSpan } from "@/lib/utils/hours";
import { priceUnitSuffix } from "@/lib/utils/prices";
import type { Turf } from "@/types/turf";
import { getAnthropic, ROUTER_MODEL } from "./ask";

/**
 * Compare and question answering. Both run on a fact sheet built from
 * the turf row and a handful of its reviews, and both prompts forbid
 * anything that isn't in the sheet: a missing field is "not listed",
 * never a guess. Both run on Haiku 5.5.
 */

// Haiku for both: the comparison is a rewrite of the fact sheet, not
// reasoning, and credits are shared with other projects.
export const COMPARE_MODEL = ROUTER_MODEL;

type ReviewRow = { rating: number; comment: string | null; source: string | null; author_name: string | null };

/** Everything the model may say about a venue. */
export type TurfFacts = Record<string, unknown>;

export async function loadFacts(id: string): Promise<{ turf: Turf; facts: TurfFacts } | null> {
  const turf = await getTurfById(id);
  if (!turf) return null;
  const supabase = createReadOnlyClient();
  const { data } = await supabase
    .from("reviews")
    .select("rating, comment, source, author_name")
    .eq("turf_id", id)
    .not("comment", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  return { turf, facts: buildFacts(turf, (data ?? []) as ReviewRow[]) };
}

export function buildFacts(t: Turf, reviews: ReviewRow[]): TurfFacts {
  const unit = priceUnitSuffix(t, { short: true });
  const rates: Record<string, string> = {};
  const add = (k: string, v: number | null) => {
    if (v != null && v > 0) rates[k] = `₹${v}${unit}`;
  };
  add("weekday_morning", t.morning_price);
  add("weekday_afternoon", t.afternoon_price);
  add("weekday_evening", t.evening_price);
  add("weekend_morning", t.weekend_morning_price);
  add("weekend_afternoon", t.weekend_afternoon_price);
  add("weekend_evening", t.weekend_evening_price);

  const hoursRows = normaliseOpeningHours(t.opening_hours, { start_time: t.start_time, end_time: t.end_time, is_24x7: t.is_24x7 });
  const hours = t.is_24x7
    ? "Open 24 hours"
    : hoursRows.length
      ? [...new Set(hoursRows.map((r) => (r.closed ? "closed" : r.spans.map(formatSpan).join(", "))))].join(" / ")
      : null;

  const facts: TurfFacts = {
    name: t.name,
    area: areaFor(t),
    city: t.city ? labelFor(t.city as never) : null,
    address: t.address,
    sports: t.sports,
    google_rating: t.total_reviews > 0 ? `${t.rating} from ${t.total_reviews} Google reviews` : null,
    rates: Object.keys(rates).length ? rates : null,
    reported_prices_unverified: t.price_mentions?.map((m) => m.price_inr ? `₹${m.price_inr}` : m.text).filter(Boolean).slice(0, 4) ?? null,
    hours,
    floodlights: t.has_floodlights === true ? "yes" : null,
    covered: t.is_covered === true ? "yes" : null,
    surface: t.surface_type,
    parking: t.parking_available === true ? "yes" : null,
    washroom: t.washroom_available === true ? "yes" : null,
    changing_room: t.changing_room_available === true ? "yes" : null,
    cafeteria: t.has_cafeteria === true ? "yes" : null,
    sitting_area: t.sitting_area_available === true ? "yes" : null,
    amenities: t.amenities?.length ? t.amenities : null,
    members_only: t.membership_required ? "yes" : null,
    access_notes: t.access_notes,
    phone_listed: getPhone(t) ? "yes, on the TapTurf page" : "no",
    website: t.website_url ? "yes" : null,
    description: t.description ? t.description.slice(0, 500) : null,
    recent_reviews: reviews
      .filter((r) => r.comment && r.comment.trim().length > 10)
      .slice(0, 8)
      .map((r) => ({ stars: r.rating, text: r.comment!.trim().slice(0, 240), from: r.source === "google" ? "Google" : "TapTurf" })),
  };
  for (const k of Object.keys(facts)) if (facts[k] == null || (Array.isArray(facts[k]) && (facts[k] as unknown[]).length === 0)) delete facts[k];
  return facts;
}

export const CompareOut = z.object({
  /** One or two sentences: which suits whom. */
  verdict: z.string(),
  rows: z.array(z.object({ label: z.string(), values: z.array(z.string()) })),
  /** One short phrase per venue, same order as the input. */
  best_for: z.array(z.string()),
  caveats: z.string().nullable(),
});
export type CompareOut = z.infer<typeof CompareOut>;

const COMPARE_SYSTEM = `You compare sports venues for TapTurf, an Indian turf directory, using only the fact sheets you are given. Reply only with the JSON object.

Rules:
- Use nothing beyond the fact sheets. A field that is absent is "Not listed". Never guess a rate, an opening time or a facility. Never mention "fact sheet" in the output; say "not listed on TapTurf".
- rows: 6 to 9 rows, in this order where data exists: Rating, Rate, Hours, Lights, Surface and cover, Facilities, Location, What reviewers say, Access. One value per venue, in the same order as the sheets, each under 14 words. Rates: give the weekday evening rate when there is one and the range otherwise. "What reviewers say": a 5 to 12 word gist of the recent reviews, no quotes, or "No written reviews yet".
- verdict: at most 40 words, plain and specific, naming the venues. Say which suits which kind of player and why, from the data. Do not pick a winner when the data does not support one.
- best_for: one phrase of at most 6 words per venue, same order as the sheets.
- caveats: at most 25 words on what the sheets do not cover (missing rates, hours), or null.
- Currency is ₹. Spell Indian place names as given. No hedging language and no marketing adjectives.`;

export async function compareTurfs(sheets: TurfFacts[]): Promise<CompareOut | null> {
  const response = await getAnthropic().messages.parse({
    model: COMPARE_MODEL,
    max_tokens: 1200,
    output_config: { effort: "low", format: zodOutputFormat(CompareOut) },
    system: [{ type: "text", text: COMPARE_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Fact sheets, in order:\n${JSON.stringify(sheets)}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return response.parsed_output;
}

export const AnswerOut = z.object({
  /** At most two sentences. */
  answer: z.string(),
  /** True when the fact sheet actually covers the question. */
  covered: z.boolean(),
});
export type AnswerOut = z.infer<typeof AnswerOut>;

const ANSWER_SYSTEM = `You answer one question about a sports venue for TapTurf, an Indian turf directory, using only the fact sheet given. Reply only with the JSON object.

Rules:
- answer: at most two short sentences, plain words, currency ₹. Answer from the sheet only.
- If the sheet does not cover the question, set covered to false and answer like "TapTurf doesn't list parking for CC Turf Pardi yet. The venue can confirm on the phone." Do not include a number. Do not guess.
- Never mention "fact sheet", "data" or "the information given". Speak as TapTurf: "TapTurf lists...", "reviewers mention...".
- Reviews are opinions: attribute them ("reviewers mention..."). Reported prices are unverified: say so.
- No preamble, no restating the question.`;

export async function answerQuestion(question: string, sheet: TurfFacts): Promise<AnswerOut | null> {
  const response = await getAnthropic().messages.parse({
    model: ROUTER_MODEL,
    max_tokens: 300,
    output_config: { effort: "low", format: zodOutputFormat(AnswerOut) },
    system: [{ type: "text", text: ANSWER_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Question: ${question}\n\nFact sheet:\n${JSON.stringify(sheet)}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return response.parsed_output;
}
