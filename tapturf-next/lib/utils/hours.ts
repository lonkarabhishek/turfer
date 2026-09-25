import type { OpeningHours } from "@/types/turf";

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export type DayName = (typeof DAYS)[number];

export interface HourSpan {
  opens: string; // "HH:MM"
  closes: string; // "HH:MM"
}

export interface DayHours {
  day: DayName;
  raw: string;
  closed: boolean;
  spans: HourSpan[]; // empty when we couldn't parse
}

/**
 * Best-effort parser for the strings we see in opening_hours:
 *   "6 AM–1 AM"        → [{opens:"06:00", closes:"01:00"}]  (crosses midnight)
 *   "Open 24 hours"    → [{opens:"00:00", closes:"23:59"}]
 *   "Closed"           → []
 *   "6:30 AM – 11 PM"  → [{opens:"06:30", closes:"23:00"}]
 *   "3–10 PM"          → [{opens:"15:00", closes:"22:00"}]  (shared meridiem)
 *   "6–8 AM 4 PM–12 AM"→ [{opens:"06:00", closes:"08:00"}, {opens:"16:00", closes:"00:00"}]
 *
 * When a value doesn't parse, we return an empty spans array so the UI
 * can fall back to the raw string.
 */
export function parseHoursString(input: string): { closed: boolean; spans: HourSpan[] } {
  const s = (input ?? "").trim();
  if (!s) return { closed: false, spans: [] };
  if (/^closed$/i.test(s)) return { closed: true, spans: [] };
  if (/24\s*hours|open\s*24/i.test(s)) return { closed: false, spans: [{ opens: "00:00", closes: "23:59" }] };

  // Normalise dashes to a single form so all range regexes work.
  const n = s.replace(/[–—]/g, "-");

  // Extract every "H[:MM] am/pm - H[:MM] am/pm" range. Also handles
  // the shared-meridiem form ("3-10 PM") by copying the trailing
  // meridiem onto the start side when the start doesn't carry one.
  const rangeRe =
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
  const spans: HourSpan[] = [];
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(n)) !== null) {
    let [, h1, min1, mer1, h2, min2, mer2] = m;
    // Shared meridiem: "3-10 PM" → start also PM
    if (!mer1 && mer2) mer1 = mer2;
    // No meridiem at all — assume 24-hour clock as-is.
    const opens = to24h(h1, min1, mer1);
    const closes = to24h(h2, min2, mer2);
    if (opens != null && closes != null) spans.push({ opens, closes });
  }
  return { closed: false, spans };
}

function to24h(hStr: string, minStr: string | undefined, mer: string | undefined): string | null {
  let h = parseInt(hStr, 10);
  const min = minStr ? parseInt(minStr, 10) : 0;
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  if (mer) {
    const m = mer.toLowerCase();
    if (m === "pm" && h < 12) h += 12;
    if (m === "am" && h === 12) h = 0;
  }
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  return `${String(h % 24).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Turn the DB opening_hours jsonb into a per-day list (Mon…Sun).
 * When the value is `{daily: "..."}` every day gets the same parse.
 * When it's per-day, days missing from the object are marked closed
 * only if EVERY listed day is present — otherwise we treat missing
 * days as "unknown" and skip them from the render, since the brief
 * says every listed day is intentional but omitted days aren't.
 */
export function normaliseOpeningHours(
  oh: OpeningHours | null | undefined,
  fallback?: { start_time: string | null; end_time: string | null },
): DayHours[] {
  const rows: DayHours[] = [];

  if (oh && typeof oh === "object" && "daily" in oh && typeof (oh as { daily?: unknown }).daily === "string") {
    const raw = (oh as { daily: string }).daily;
    const parsed = parseHoursString(raw);
    for (const day of DAYS) rows.push({ day, raw, closed: parsed.closed, spans: parsed.spans });
    return rows;
  }

  if (oh && typeof oh === "object") {
    const perDay = oh as Partial<Record<DayName, string>>;
    for (const day of DAYS) {
      const raw = perDay[day];
      if (typeof raw !== "string") continue;
      const parsed = parseHoursString(raw);
      rows.push({ day, raw, closed: parsed.closed, spans: parsed.spans });
    }
    if (rows.length) return rows;
  }

  if (fallback?.start_time && fallback?.end_time) {
    const raw = `${trimSeconds(fallback.start_time)} – ${trimSeconds(fallback.end_time)}`;
    const parsed = parseHoursString(raw);
    for (const day of DAYS)
      rows.push({
        day,
        raw,
        closed: false,
        spans: parsed.spans.length
          ? parsed.spans
          : [{ opens: trimSeconds(fallback.start_time), closes: trimSeconds(fallback.end_time) }],
      });
    return rows;
  }

  return rows;
}

function trimSeconds(t: string): string {
  // "06:00:00" → "06:00", already-short strings pass through.
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(t) ? t.slice(0, 5) : t;
}

/**
 * schema.org OpeningHoursSpecification array. Skips closed days and
 * days we couldn't parse. Returns null when we have nothing to emit.
 */
export function openingHoursJsonLd(
  oh: OpeningHours | null | undefined,
  fallback?: { start_time: string | null; end_time: string | null },
) {
  const rows = normaliseOpeningHours(oh, fallback);
  const specs: Array<{
    "@type": "OpeningHoursSpecification";
    dayOfWeek: DayName;
    opens: string;
    closes: string;
  }> = [];
  for (const row of rows) {
    if (row.closed) continue;
    for (const span of row.spans) {
      specs.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: row.day,
        opens: span.opens,
        closes: span.closes,
      });
    }
  }
  return specs.length ? specs : null;
}

/**
 * Which day-of-week is "today" in IST — the site's operating region.
 * Uses Intl.DateTimeFormat so DST edge cases are handled by the runtime
 * rather than a hand-rolled offset (India doesn't observe DST, but the
 * server may be in any timezone).
 */
export function istWeekdayName(now: Date = new Date()): DayName {
  const nameByShort: Record<string, DayName> = {
    Mon: "Monday",
    Tue: "Tuesday",
    Wed: "Wednesday",
    Thu: "Thursday",
    Fri: "Friday",
    Sat: "Saturday",
    Sun: "Sunday",
  };
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
  }).format(now);
  return nameByShort[short] ?? "Monday";
}

/**
 * Format "HH:MM" as "6:00 AM" for the visible hours table.
 */
export function formatClock(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const meridiem = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${meridiem}`;
}
