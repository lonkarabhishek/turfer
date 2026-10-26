/**
 * Turf descriptions from the research pass (6 to 26 Oct) often say the
 * venue can be booked on another app: "It is publicly bookable on
 * Playo." (717 active turfs on 26 Oct), "It is listed on Playo for
 * bookings enquiry." (409), "…and is bookable on Playo, KheloMore and
 * Hudle, with slots…". TapTurf links to none of them (players call or
 * WhatsApp the turf from the page), so on our pages that line promises a
 * booking route the page doesn't have. The stored text stays as it is
 * (the data team rewrites it; owners edit their own on myTapturf); this
 * drops those sentences and clauses wherever a description is shown:
 * the turf page, its JSON-LD and Ask's fact sheet.
 *
 * Only booking claims go. "Playo lists parking and washrooms" and
 * "listed on Playo as Fitbox Kompally" (another name for the venue)
 * stay, and so does an intro sentence that merely ends ", listed on
 * Playo." (the clause goes, the sentence stays).
 */

// Booking apps and sites the research notes name.
const APP = String.raw`(?:playo|hudle|khelo\s?more|play\s?spots|turf\s?town|district|book\s?my\s?show|both\s+apps|(?:the\s+)?[\w'’-]+\s+(?:site|website|app))`;
const APPS = String.raw`${APP}(?:\s*,\s*(?:and\s+)?${APP}|\s+and\s+${APP})*`;

/** "It is publicly bookable on Playo." / "It is listed on Hudle for box cricket." / "Courts are publicly bookable on both apps." */
const CLAIM_SENTENCE = new RegExp(
  String.raw`^(?:it|the\s+(?:venue|turf|ground|club|courts?)|courts?|turfs?|its\s+[\w\s-]{1,40}?)\s+(?:is|are)\s+(?:also\s+)?(?:publicly\s+)?(?:bookable|listed)\s+(?:on|via|through)\s+${APPS}\b`,
  "i",
);
/** "…chain and is bookable on Playo, KheloMore and Hudle, with slots…" → "…chain, with slots…" */
const BOOKABLE_CLAUSE = new RegExp(
  String.raw`(?:\s*,\s*|\s+)(?:and\s+)?(?:(?:the\s+venue|it)\s+)?(?:(?:is|are)\s+)?(?:also\s+)?(?:publicly\s+)?bookable\s+(?:on|via|through)\s+${APPS}\b`,
  "gi",
);
/** "…in the MIDC area, listed on Playo." and "…, and the venue is also listed on KheloMore." at a sentence's end. */
const LISTED_CLAUSE = new RegExp(
  String.raw`(?:\s*,\s*|\s+)(?:and\s+)?(?:(?:the\s+venue|it)\s+)?(?:(?:is|are)\s+)?(?:also\s+)?listed\s+on\s+${APPS}(?:\s+for\s+[^.!?;]*?bookings?(?:\s+enquir(?:y|ies))?)?(?=\s*[.!?]?\s*$)`,
  "i",
);

function cleanSentence(sentence: string): string | null {
  const s = sentence.trim();
  if (CLAIM_SENTENCE.test(s)) return null;
  const out = s
    .replace(BOOKABLE_CLAUSE, "")
    .replace(LISTED_CLAUSE, "")
    .replace(/\s+([,.!?;])/g, "$1")
    .replace(/,([.!?])/g, "$1")
    .trim();
  return /[\p{L}\p{N}]/u.test(out) ? out : null;
}

/** The description without claims that the venue is bookable on another app; null when nothing is left. */
export function stripBookingClaims(text: string | null | undefined): string | null {
  if (!text || typeof text !== "string") return null;
  // Sentences and the whitespace after each, so paragraph breaks survive.
  const parts = text.split(/(?<=[.!?])(\s+)/);
  let out = "";
  let gap = "";
  for (let i = 0; i < parts.length; i += 2) {
    const after = parts[i + 1] ?? "";
    const kept = cleanSentence(parts[i]);
    if (kept) {
      out += (out ? gap : "") + kept;
      gap = after;
    } else if (countBreaks(after) > countBreaks(gap)) {
      // A dropped sentence that ended a paragraph keeps the break.
      gap = after;
    }
  }
  return out.trim() || null;
}

function countBreaks(s: string): number {
  return (s.match(/\n/g) ?? []).length;
}
