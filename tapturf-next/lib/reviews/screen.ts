/**
 * Text rules for a report's tip and private note, the same as the
 * database's (private.review_clean_text and private.review_text_problem in
 * supabase/migrations/20261027_game_reports.sql), so the sheet can say so
 * as the player types instead of after a round trip. Pure.
 */

export const TIP_MAX = 500;
export const NOTE_MAX = 400;
/** The counter under the tip shows from here. */
export const TIP_COUNTER_FROM = 400;

/**
 * As stored: control characters out (NUL too: the database can't hold
 * it), runs of spaces and blank lines collapsed, line breaks kept, trimmed.
 * Empty is null.
 */
export function cleanText(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const v = s
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x09\x0b-\x1f\x7f]/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \n]+|[ \n]+$/g, "");
  return v || null;
}

/** The zero of each run of decimal digits read as 0-9: Arabic-Indic, Extended Arabic-Indic, Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam, full-width. */
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0xff10];
const OTHER_DIGIT = new RegExp(`[${DIGIT_ZEROS.map((z) => `${String.fromCharCode(z)}-${String.fromCharCode(z + 9)}`).join("")}]`, "g");

/**
 * A text as a number in it would be dialled: every script's digits as 0-9,
 * and spaces, dots, dashes, slashes and brackets between digits taken out.
 */
export function dialDigits(s: string): string {
  return s
    .replace(OTHER_DIGIT, (c) => {
      const cp = c.codePointAt(0) ?? 0;
      const z = DIGIT_ZEROS.find((x) => cp >= x && cp <= x + 9) ?? cp;
      return String(cp - z);
    })
    .replace(/([0-9])[\s.()/-]+(?=[0-9])/g, "$1");
}

const PHONE = /(^|[^0-9])(\+?91|0)?[6-9][0-9]{9}([^0-9]|$)/;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const LINK = /(https?:\/\/|www\.)/i;
const SHORT = /(^|[^a-z0-9@.])(wa\.me|t\.me|bit\.ly)([^a-z0-9]|$)/i;
const DOMAIN = /(^|[^a-z0-9@.])[a-z0-9][a-z0-9-]*\.(com|org|io|app|xyz|ly|gl|site|online|shop|store|info|biz|co\.in|net\.in|org\.in)([^a-z0-9]|$)/i;
/** The short endings only in lower case after a 3-letter name, so "here.In the evening" passes. */
const SHORT_TLD = /(^|[^A-Za-z0-9@.])[A-Za-z0-9][A-Za-z0-9-]{2,}\.(in|co|me|net)([^A-Za-z0-9]|$)/;
const PATH = /(^|[^a-z0-9@.])[a-z0-9][a-z0-9-]*\.[a-z]{2,}\/[^ ]/i;

/**
 * "contact_info" when the text has an Indian mobile number (10 digits from
 * 6 to 9, with or without 91 or 0 in front, however it is spaced, dotted,
 * dashed, bracketed or in whichever script's digits), an email, a link or a
 * bare domain. Prices (₹1,200), times (7-9pm) and scores (120/3) pass.
 */
export function contactProblem(s: string | null | undefined): "contact_info" | null {
  if (!s) return null;
  if (PHONE.test(dialDigits(s))) return "contact_info";
  return [EMAIL, LINK, SHORT, DOMAIN, SHORT_TLD, PATH].some((re) => re.test(s)) ? "contact_info" : null;
}
