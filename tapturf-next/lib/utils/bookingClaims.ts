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
 * The same goes for "Playo sells box cricket slots", "The 5-a-side turf
 * can be booked … on Playo" and "takes bookings through its Kixar
 * listing" (10 more active turfs); when such a sentence also says what
 * the app lists, that part stays ("Playo lists drinking water.").
 *
 * Only booking claims go. "Playo lists parking and washrooms" and
 * "listed on Playo as Fitbox Kompally" (another name for the venue)
 * stay, and so does an intro sentence that merely ends ", listed on
 * Playo." (the clause goes, the sentence stays).
 */

// Booking apps and sites the research notes name.
const APP = String.raw`(?:playo|hudle|khelo\s?more|play\s?spots|turf\s?town|district|book\s?my\s?show|both\s+apps|(?:the\s+)?[\w'’-]+\s+(?:site|website|app))`;
// "Playo, KheloMore and Hudle", "the ClayGrounds website and on District".
const APPS = String.raw`${APP}(?:\s*,\s*(?:and\s+)?(?:on\s+)?${APP}|\s+and\s+(?:on\s+)?${APP})*`;

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

/** "The 5-a-side turf can be booked for football and box cricket on Playo." / "It can be booked on the ClayGrounds website and on District." */
const CAN_BE_BOOKED_SENTENCE = new RegExp(
  String.raw`^(?:it|the\s+[\w\s-]{1,40}?|courts?|turfs?|its\s+[\w\s-]{1,40}?)\s+can\s+(?:also\s+)?be\s+booked\b[^.!?;,]*?\s+(?:on|via|through)\s+${APPS}\b`,
  "i",
);
/** "…for football, and it can be booked on Playo." at a sentence's end. */
const CAN_BE_BOOKED_CLAUSE = new RegExp(
  String.raw`(?:\s*,\s*|\s+)(?:and\s+)?(?:it\s+)?can\s+(?:also\s+)?be\s+booked\b[^.!?;,]*?\s+(?:on|via|through)\s+${APPS}(?=\s*[.!?]?\s*$)`,
  "i",
);
/** "Its Playo listing offers 5-, 6- and 7-a-side pitch configurations bookable from early morning…" */
const LISTING_BOOKABLE_SENTENCE = new RegExp(String.raw`^its\s+${APPS}\s+listings?\b[^.!?;]*\bbookable\b`, "i");

// Selling is said only of the booking apps by name: "the district sells…" is not a claim.
const SELLER = String.raw`(?:playo|hudle|khelo\s?more|play\s?spots|turf\s?town)`;
const SELLERS = String.raw`${SELLER}(?:\s*,\s*(?:and\s+)?${SELLER}|\s+and\s+${SELLER})*`;
/** "Playo sells box cricket slots and lists drinking water." → "Playo lists drinking water." */
const SELLS_THEN_LISTS = new RegExp(String.raw`^(${SELLERS})\s+(?:also\s+)?sells?\s+[^.!?;]*?\s+and\s+(lists?\b[^.!?;]*[.!?]?)$`, "i");
/** "Playo sells box cricket and bowling-machine sessions of 12 overs per 60 minutes." */
const SELLS_SENTENCE = new RegExp(String.raw`^${SELLERS}\s+(?:also\s+)?sells?\b`, "i");
/** "…for children, and Playo and KheloMore sell evening slots on the pitch." / "…, and Playo also sells box cricket here." */
const SELLS_CLAUSE = new RegExp(String.raw`(?:\s*,\s*|\s+)and\s+${SELLERS}\s+(?:also\s+)?sells?\s+[^.!?;]*(?=[.!?]?\s*$)`, "i");

/** "The venue takes bookings through its Kixar listing, which names cricket…" → "Its Kixar listing names cricket…" */
const TAKES_BOOKINGS = /^(?:it|the\s+(?:venue|turf|ground|club))\s+takes\s+bookings\s+(?:on|via|through)\s+its\s+([\w-]+)\s+listing\b(?:\s*,\s*which\s+([^.!?;]*[.!?]?))?/i;

function cleanSentence(sentence: string): string | null {
  const s = sentence.trim();
  if (CLAIM_SENTENCE.test(s) || CAN_BE_BOOKED_SENTENCE.test(s) || LISTING_BOOKABLE_SENTENCE.test(s)) return null;
  const takes = TAKES_BOOKINGS.exec(s);
  if (takes) return takes[2] ? `Its ${takes[1]} listing ${takes[2]}` : null;
  const listsOnly = SELLS_THEN_LISTS.exec(s);
  if (listsOnly) return `${listsOnly[1]} ${listsOnly[2]}`;
  if (SELLS_SENTENCE.test(s)) return null;
  const out = s
    .replace(BOOKABLE_CLAUSE, "")
    .replace(LISTED_CLAUSE, "")
    .replace(CAN_BE_BOOKED_CLAUSE, "")
    .replace(SELLS_CLAUSE, "")
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
