/**
 * Text rules for a report's tip and private note, the same as the
 * database's (private.review_clean_text and private.review_text_problem in
 * supabase/migrations/20261027_game_reports.sql, and the tip's own
 * private.review_tip_problem in 20261102_reviews_trust.sql), so the sheet
 * can say so as the player types, the route refuses what the database
 * would, and the database has the last word. The rules are one list
 * (CONTACT_RULES, TIP_RULES), written the way both JavaScript and Postgres
 * read them: npm run test:reviews checks the SQL says the same, and
 * screen.cases.json runs through both (scripts/sql-tests/reviews_trust.check.mjs). Pure.
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

/**
 * One rule of the screen: a pattern as both JavaScript and Postgres read it
 * (no lookbehind, no \d, no flags inside), whether case is ignored (~* in
 * SQL), and what it reads: the text as typed, or its digits as they would
 * be dialled (dialDigits).
 */
export type ScreenRule = { on: "text" | "dialled"; i: boolean; re: string };

/**
 * The note's rules, and the tip's first ones: private.review_text_problem,
 * rule for rule and in order. An Indian mobile number (10 digits from 6 to
 * 9, with or without 91 or 0 in front, however it is spaced, dotted,
 * dashed, bracketed or in whichever script's digits), an email, a link, a
 * short link, a bare domain, the short endings (only in lower case after a
 * 3-letter name, so "here.In the evening" passes) and a path.
 */
export const CONTACT_RULES: readonly ScreenRule[] = [
  { on: "dialled", i: false, re: String.raw`(^|[^0-9])(\+?91|0)?[6-9][0-9]{9}([^0-9]|$)` },
  { on: "text", i: true, re: String.raw`[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}` },
  { on: "text", i: true, re: String.raw`(https?://|www\.)` },
  { on: "text", i: true, re: String.raw`(^|[^a-z0-9@.])(wa\.me|t\.me|bit\.ly)([^a-z0-9]|$)` },
  { on: "text", i: true, re: String.raw`(^|[^a-z0-9@.])[a-z0-9][a-z0-9-]*\.(com|org|io|app|xyz|ly|gl|site|online|shop|store|info|biz|co\.in|net\.in|org\.in)([^a-z0-9]|$)` },
  { on: "text", i: false, re: String.raw`(^|[^A-Za-z0-9@.])[A-Za-z0-9][A-Za-z0-9-]{2,}\.(in|co|me|net)([^A-Za-z0-9]|$)` },
  { on: "text", i: true, re: String.raw`(^|[^a-z0-9@.])[a-z0-9][a-z0-9-]*\.[a-z]{2,}/[^ ]` },
];

/**
 * The tip's own, on top of those: an @handle to message someone on
 * (WhatsApp, Instagram, Telegram). A letter or _ after the @, so "@7pm" and
 * "@ 800" pass; never inside a word, so an address is the email rule's.
 * The private note keeps CONTACT_RULES only.
 */
export const TIP_RULES: readonly ScreenRule[] = [{ on: "text", i: true, re: String.raw`(^|[^a-z0-9._%+-])@[a-z_][a-z0-9._]{2,29}` }];

const compile = (rules: readonly ScreenRule[]) => rules.map((r) => ({ on: r.on, re: new RegExp(r.re, r.i ? "i" : "") }));
const CONTACT = compile(CONTACT_RULES);
const TIP = [...CONTACT, ...compile(TIP_RULES)];

function breaks(rules: ReturnType<typeof compile>, s: string): boolean {
  let dialled: string | null = null;
  return rules.some((r) => r.re.test(r.on === "dialled" ? (dialled ??= dialDigits(s)) : s));
}

/**
 * "contact_info" when the text has a phone number, an email, a link or a
 * bare domain (CONTACT_RULES): the private note's rule. Prices (₹1,200),
 * times (7-9pm) and scores (120/3) pass.
 */
export function contactProblem(s: string | null | undefined): "contact_info" | null {
  if (!s) return null;
  return breaks(CONTACT, s) ? "contact_info" : null;
}

/** The public tip's rule: contactProblem's, and an @handle too (TIP_RULES). */
export function tipProblem(s: string | null | undefined): "contact_info" | null {
  if (!s) return null;
  return breaks(TIP, s) ? "contact_info" : null;
}
