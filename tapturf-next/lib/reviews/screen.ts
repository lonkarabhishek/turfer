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

const PHONE = /(^|[^0-9])(\+?91[ -]?|0)?[6-9]([ -]?[0-9]){9}([^0-9]|$)/;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/i;
const LINK = /(https?:\/\/|www\.)/i;
const SHORT = /(^|[^a-z0-9@.])(wa\.me|t\.me|bit\.ly)([^a-z0-9]|$)/i;
const DOMAIN = /(^|[^a-z0-9@.])[a-z0-9][a-z0-9-]*\.(com|org|io|app|xyz|ly|gl|site|online|shop|store|info|biz|co\.in|net\.in|org\.in)([^a-z0-9]|$)/i;
const PATH = /(^|[^a-z0-9@.])[a-z0-9][a-z0-9-]*\.[a-z]{2,}\/[^ ]/i;

/**
 * "contact_info" when the text has an Indian mobile number (10 digits from
 * 6 to 9, with or without +91 or 0, spaces or dashes), an email, a link or
 * a bare domain. Prices (₹1,200), times (7-9pm) and scores (120/3) pass.
 */
export function contactProblem(s: string | null | undefined): "contact_info" | null {
  if (!s) return null;
  return [PHONE, EMAIL, LINK, SHORT, DOMAIN, PATH].some((re) => re.test(s)) ? "contact_info" : null;
}
