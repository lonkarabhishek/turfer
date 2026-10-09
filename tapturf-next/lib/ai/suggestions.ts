import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { normalizeIndianPhone } from "@/lib/utils/phone";
import { parseHoursString } from "@/lib/utils/hours";
import { getAnthropic, ROUTER_MODEL } from "./ask";

/**
 * Suggestion checker. A player (or owner) has suggested a phone,
 * prices, hours, sports, facilities or a note for a turf. Haiku reads
 * the suggestion next to what the listing says today and proposes
 * exactly which columns to change, with a verdict the admin can act
 * on in one click. Nothing is written until the admin approves.
 */

export type PendingSuggestion = {
  id: string;
  turf_id: string;
  turf_name: string;
  turf_city: string | null;
  submitter_name: string | null;
  relationship: string;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  price_min: number | null;
  price_max: number | null;
  price_notes: string | null;
  opening_hours: string | null;
  sports: string[];
  amenities: string[];
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  edit_count: number;
  ai_review: SuggestionReview | null;
  reviewed_at: string | null;
  /** What the listing says now. */
  current: {
    owner_phone: string | null;
    whatsapp_phone: string | null;
    landline_phone: string | null;
    morning_price: number | null;
    afternoon_price: number | null;
    evening_price: number | null;
    weekend_evening_price: number | null;
    opening_hours: unknown;
    start_time: string | null;
    end_time: string | null;
    is_24x7: boolean | null;
    sports: string[];
    amenities: string[];
  };
};

export const Proposed = z.object({
  owner_phone: z.string().nullable(),
  whatsapp_phone: z.string().nullable(),
  morning_price: z.number().nullable(),
  afternoon_price: z.number().nullable(),
  evening_price: z.number().nullable(),
  weekend_evening_price: z.number().nullable(),
  /** One line like "06:00 – 23:00" or "Open 24 hours", or null to leave hours alone. */
  opening_hours_daily: z.string().nullable(),
  sports_add: z.array(z.string()),
  amenities_add: z.array(z.string()),
});
export type Proposed = z.infer<typeof Proposed>;

export const SuggestionReview = z.object({
  verdict: z.enum(["apply", "check", "reject"]),
  /** 0 to 1. */
  confidence: z.number(),
  /** At most 25 words for the admin. */
  summary: z.string(),
  issues: z.array(z.string()),
  spam: z.boolean(),
  proposed: Proposed,
});
export type SuggestionReview = z.infer<typeof SuggestionReview>;

const SYSTEM = `You check player-submitted corrections for TapTurf, an Indian sports venue directory, before an admin applies them. Reply only with the JSON object.

You get the suggestion and what the listing says today. Decide what should change.

Rules:
- proposed holds only values that should be written. Anything that should stay as it is: null (or an empty list). Never copy the current value into proposed.
- Phones: Indian numbers only. Return 10 digits, no country code, no spaces. A number that is not 10 digits after stripping +91 and spaces is an issue, not a proposal. Mobile numbers start with 6, 7, 8 or 9. Landlines are not owner_phone.
- Prices are per hour in rupees. price_min is the off-peak (morning/afternoon) rate, price_max the peak (evening/weekend evening) rate. A single price fills morning, afternoon and evening. Outside ₹200 to ₹5,000 an hour is an issue. A change of more than 2x from the current listed rate is "check", not "apply".
- Hours: normalise to "HH:MM – HH:MM" in 24-hour time, or "Open 24 hours". Unparseable text is an issue.
- sports_add: only real sports from this list, spelt exactly: Football, Box Cricket, Cricket, Cricket Nets, Badminton, Pickleball, Volleyball, Basketball, Tennis, Table Tennis, Swimming, Padel. Skip ones already listed.
- amenities_add: short nouns (Parking, Washroom, Changing room, Floodlights, Cafeteria, Drinking water, Seating, Covered). Skip ones already listed.
- notes and price_notes may contain the real information ("new number is 98xxx", "₹900 after 6pm"). Read them.
- spam: true for abuse, advertising another venue, nonsense, or a phone number pushed by a "player" with nothing else that checks out. Spam is always "reject".
- verdict: "apply" when every proposed value is well-formed and plausible and from an owner or staff, or from a player with a modest change; "check" when something is plausible but conflicts with the current listing or comes from a player with a big change; "reject" for spam or nothing usable.
- summary: at most 25 words, plain, for the admin: what the submitter claims and what you propose. issues: one short line each.`;

function phone10(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = normalizeIndianPhone(raw);
  return n && n.type === "mobile" ? n.local : null;
}

/** Run Haiku, then re-validate every proposed value in code. */
export async function reviewSuggestion(s: PendingSuggestion): Promise<SuggestionReview | null> {
  const input = {
    suggestion: {
      relationship: s.relationship,
      submitter_name: s.submitter_name,
      contact_phone: s.contact_phone,
      whatsapp_phone: s.whatsapp_phone,
      price_min: s.price_min,
      price_max: s.price_max,
      price_notes: s.price_notes,
      opening_hours: s.opening_hours,
      sports: s.sports,
      amenities: s.amenities,
      notes: s.notes,
      edited_times: s.edit_count,
    },
    listing_today: {
      name: s.turf_name,
      city: s.turf_city,
      owner_phone: s.current.owner_phone ? "listed" : null,
      whatsapp_phone: s.current.whatsapp_phone ? "listed" : null,
      landline_phone: s.current.landline_phone ? "listed" : null,
      morning_price: s.current.morning_price,
      afternoon_price: s.current.afternoon_price,
      evening_price: s.current.evening_price,
      weekend_evening_price: s.current.weekend_evening_price,
      hours: s.current.is_24x7 ? "Open 24 hours" : s.current.opening_hours ?? (s.current.start_time && s.current.end_time ? `${s.current.start_time} – ${s.current.end_time}` : null),
      sports: s.current.sports,
      amenities: s.current.amenities,
    },
  };
  const response = await getAnthropic().messages.parse({
    model: ROUTER_MODEL,
    max_tokens: 700,
    output_config: { effort: "low", format: zodOutputFormat(SuggestionReview) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return sanitise(response.parsed_output, s);
}

/** Code is the last word: phones must normalise, prices must be sane, hours must parse. */
function sanitise(r: SuggestionReview, s: PendingSuggestion): SuggestionReview {
  const issues = [...r.issues];
  const p: Proposed = { ...r.proposed };
  const SPORTS = new Set(["Football", "Box Cricket", "Cricket", "Cricket Nets", "Badminton", "Pickleball", "Volleyball", "Basketball", "Tennis", "Table Tennis", "Swimming", "Padel"]);

  for (const k of ["owner_phone", "whatsapp_phone"] as const) {
    if (p[k]) {
      const ok = phone10(p[k]);
      if (!ok) {
        issues.push(`${k.replace("_", " ")} is not a valid Indian mobile`);
        p[k] = null;
      } else p[k] = ok;
    }
  }
  for (const k of ["morning_price", "afternoon_price", "evening_price", "weekend_evening_price"] as const) {
    const v = p[k];
    if (v != null && (!Number.isFinite(v) || v < 200 || v > 5000)) {
      issues.push(`${k.replace(/_/g, " ")} ₹${v} is outside the sane range`);
      p[k] = null;
    } else if (v != null) p[k] = Math.round(v);
  }
  if (p.opening_hours_daily) {
    const parsed = parseHoursString(p.opening_hours_daily);
    if (!parsed.closed && parsed.spans.length === 0) {
      issues.push(`hours "${p.opening_hours_daily}" could not be parsed`);
      p.opening_hours_daily = null;
    }
  }
  const have = new Set(s.current.sports.map((x) => x.toLowerCase()));
  p.sports_add = p.sports_add.filter((x) => SPORTS.has(x) && !have.has(x.toLowerCase()));
  const haveA = new Set(s.current.amenities.map((x) => x.toLowerCase()));
  p.amenities_add = p.amenities_add.map((x) => x.trim()).filter((x) => x && x.length <= 30 && !haveA.has(x.toLowerCase())).slice(0, 8);

  const anything =
    p.owner_phone || p.whatsapp_phone || p.morning_price != null || p.afternoon_price != null || p.evening_price != null || p.weekend_evening_price != null || p.opening_hours_daily || p.sports_add.length || p.amenities_add.length;
  let verdict = r.verdict;
  if (r.spam) verdict = "reject";
  else if (!anything && verdict === "apply") verdict = "check";
  return { ...r, verdict, issues, proposed: p, confidence: Math.max(0, Math.min(1, r.confidence)) };
}

/** Turn a reviewed proposal into the column map the DB function applies. */
export function applyMap(p: Proposed): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.owner_phone) out.owner_phone = p.owner_phone;
  if (p.whatsapp_phone) out.whatsapp_phone = p.whatsapp_phone;
  for (const k of ["morning_price", "afternoon_price", "evening_price", "weekend_evening_price"] as const) if (p[k] != null) out[k] = p[k];
  if (p.opening_hours_daily) out.opening_hours = { daily: p.opening_hours_daily };
  if (p.sports_add.length) out.sports_add = p.sports_add;
  if (p.amenities_add.length) out.amenities_add = p.amenities_add;
  return out;
}
