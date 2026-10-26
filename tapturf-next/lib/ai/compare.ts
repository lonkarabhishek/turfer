import { z } from "zod";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { getTurfById } from "@/lib/queries/turfs";
import { areaFor } from "@/lib/utils/area";
import { labelFor } from "@/lib/city";
import { getPhone, getWhatsAppPhone } from "@/lib/utils/seo";
import { normaliseOpeningHours, formatSpan } from "@/lib/utils/hours";
import { priceUnitSuffix } from "@/lib/utils/prices";
import { priceFigures, publicLink, scrubBookingApps } from "@/lib/utils/bookingApps";
import type { Turf } from "@/types/turf";
import { ROUTER_MODEL, structured, type AskUsage } from "./ask";

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
  // The row and its reviews in parallel: both only need the id.
  const [turf, { data }] = await Promise.all([
    // A failed read skips this turf (logged), rather than failing the whole comparison.
    getTurfById(id).catch((e) => {
      console.warn("compare: turf read failed", id, e);
      return null;
    }),
    createReadOnlyClient()
      .from("reviews")
      .select("rating, comment, source, author_name")
      .eq("turf_id", id)
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (!turf) return null;
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

  // Reported prices as numbers only: a note's words said where it came
  // from ("booking-app listing: …"), and the sheet names no booking app.
  // priceFigures reads ₹-marked amounts and bare ones said as a price
  // ("Rates are 1000 per hour", "800/-"), as most Google quotes are.
  const reported = [...new Set((t.price_mentions ?? []).flatMap((m) => (m.price_inr ? [`₹${m.price_inr}`] : priceFigures(m.text))))].slice(0, 4);

  // Every free-text field without booking apps (lib/utils/bookingApps.ts):
  // the model repeats what the sheet says.
  const facts: TurfFacts = {
    name: t.name,
    area: areaFor(t),
    city: t.city ? labelFor(t.city as never) : null,
    address: scrubBookingApps(t.address),
    sports: t.sports,
    google_rating: t.total_reviews > 0 ? `${t.rating} from ${t.total_reviews} Google reviews` : null,
    rates: Object.keys(rates).length ? rates : null,
    reported_prices_unverified: reported.length ? reported : null,
    hours,
    floodlights: t.has_floodlights === true ? "yes" : null,
    covered: t.is_covered === true ? "yes" : null,
    surface: t.surface_type,
    equipment_provided: t.equipment_provided === true ? "yes" : null,
    size: t.length_feet && t.width_feet ? `${t.length_feet} ft x ${t.width_feet} ft${t.height_feet ? `, ${t.height_feet} ft high` : ""}` : null,
    grounds: t.number_of_grounds && t.number_of_grounds > 1 ? `${t.number_of_grounds} grounds` : null,
    formats: t.formats?.length ? t.formats : t.ground_format ? [t.ground_format] : null,
    // has_nets means boundary nets or a net cage (the column's own
    // definition), not practice nets; the page shows it as "Boundary nets".
    nets: t.has_nets
      ? t.net_condition
        ? `boundary nets, ${t.net_condition.toLowerCase()} condition`
        : "boundary nets"
      : t.net_condition
        ? `nets, ${t.net_condition.toLowerCase()} condition`
        : null,
    listed_prices_per_hour: bandSummary(t.pricing_bands),
    good_to_know: scrubBookingApps(t.good_to_know),
    parking: t.parking_available === true ? "yes" : null,
    washroom: t.washroom_available === true ? "yes" : null,
    changing_room: t.changing_room_available === true ? "yes" : null,
    cafeteria: t.has_cafeteria === true ? "yes" : null,
    sitting_area: t.sitting_area_available === true ? "yes" : null,
    amenities: t.amenities?.length ? t.amenities : null,
    members_only: t.membership_required ? "yes" : null,
    access_notes: scrubBookingApps(t.access_notes),
    phone_listed: getPhone(t) ? "yes, on the TapTurf page" : getWhatsAppPhone(t) ? "WhatsApp only, on the TapTurf page" : "no",
    // The page shows no booking app's page as the venue's website.
    website: publicLink(t.website_url) ? "yes" : null,
    // Without "bookable on Playo" lines: players book by call or WhatsApp.
    description: scrubBookingApps(t.description)?.slice(0, 500) ?? null,
    recent_reviews: reviews
      .map((r) => ({ ...r, comment: scrubBookingApps(r.comment) }))
      .filter((r) => r.comment && r.comment.length > 10)
      .slice(0, 8)
      .map((r) => ({ stars: r.rating, text: r.comment!.slice(0, 240), from: r.source === "google" ? "Google" : "TapTurf" })),
  };
  for (const k of Object.keys(facts)) if (facts[k] == null || (Array.isArray(facts[k]) && (facts[k] as unknown[]).length === 0)) delete facts[k];
  return facts;
}

/** Listed per-hour prices by format: { "6-a-side": "₹800 to ₹1100, weekday mornings cheapest" }. */
function bandSummary(bands: Turf["pricing_bands"]): Record<string, string> | null {
  if (!bands?.length) return null;
  const by = new Map<string, number[]>();
  for (const b of bands) {
    const k = b.format ?? "standard";
    by.set(k, [...(by.get(k) ?? []), b.price_per_hour]);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of [...by].slice(0, 6)) {
    const lo = Math.min(...v), hi = Math.max(...v);
    out[k] = lo === hi ? `₹${lo}` : `₹${lo} to ₹${hi}`;
  }
  return out;
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
- Never name, recommend or point to a turf-booking app or booking website (Playo, Hudle, KheloMore, Playspots, Turf Town, District, Kixar, BookMyShow and the like), and never say a venue is booked online or through an app.
- Currency is ₹. Spell Indian place names as given. No hedging language and no marketing adjectives.`;

export async function compareTurfs(sheets: TurfFacts[], usage?: AskUsage): Promise<CompareOut | null> {
  const out = await structured(
    CompareOut,
    {
      model: COMPARE_MODEL,
      max_tokens: 1200,
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
    rows: out.rows.map((r) => ({ label: r.label, values: r.values.map((v) => scrubBookingApps(v) ?? "Not listed") })),
    best_for: out.best_for.map((b) => scrubBookingApps(b) ?? ""),
    caveats: scrubBookingApps(out.caveats),
  };
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
- Never use the words "sheet", "fact sheet", "data" or "the information given", and never add a sentence about what more detail is or is not available. Speak as TapTurf: "TapTurf lists...", "reviewers mention...". Example: "Yes, TapTurf lists floodlights at Hindu Gymkhana Kothrud."
- Reviews are opinions: attribute them ("reviewers mention..."). Reported prices are unverified: say so. good_to_know is a note from public reviews: attribute it the same way.
- listed_prices_per_hour are the rates TapTurf lists per hour by format: say "listed at". For a budget question, compare the budget with those prices (or rates) and say plainly which formats fit.
- Size: use size, formats and grounds when present ("TapTurf lists it as a 6-a-side ground, 2 grounds").
- Never name, recommend or point to a turf-booking app or booking website (Playo, Hudle, KheloMore, Playspots, Turf Town, District, Kixar, BookMyShow and the like), and never say the venue is booked online or through an app.
- No preamble, no restating the question.`;

export async function answerQuestion(question: string, sheet: TurfFacts, usage?: AskUsage): Promise<AnswerOut | null> {
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
  );
  // A question that names an app ("is it on Playo?") must not get it named back.
  const answer = out ? scrubBookingApps(out.answer) : null;
  return out && answer ? { ...out, answer } : null;
}
