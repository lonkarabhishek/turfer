/**
 * The optional email phone accounts can add ("turf deals and game
 * invites"). cleanEmail is private.clean_email's rule exactly
 * (20261025_contact_email.sql; scripts/sql-tests/contact_email.check.mjs
 * compares the two). The database still decides. Relative imports only
 * (npm run test:account).
 */

const EMAIL_RE = /^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** The address as it will be kept (trimmed, lowercase), or null when it is not one we accept. */
export function cleanEmail(typed: string): string | null {
  const v = typed.trim().toLowerCase();
  if (v.length < 6 || v.length > 254) return null;
  const local = v.split("@")[0];
  if (local.length < 1 || local.length > 64) return null;
  return EMAIL_RE.test(v) ? v : null;
}

// Slips people make on a phone keyboard, by domain.
const DOMAIN_FIX: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "gmail.in": "gmail.com",
  "gmail.co.in": "gmail.com",
  "gmail": "gmail.com",
  "gmailcom": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "rediffmail.co": "rediffmail.com",
  "redifmail.com": "rediffmail.com",
  "icloud.co": "icloud.com",
};

/** "Did you mean …?": the address with a common domain slip fixed, or null. */
export function emailTypo(typed: string): string | null {
  const v = typed.trim().toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 1) return null;
  const fix = DOMAIN_FIX[v.slice(at + 1)];
  return fix ? `${v.slice(0, at)}@${fix}` : null;
}

/** What to tell someone about what they typed, or null when it is fine (an empty field is fine: it is optional). */
export function emailProblem(typed: string): string | null {
  const v = typed.trim();
  if (!v) return null;
  if (!v.includes("@")) return "Add the part after @, like name@gmail.com.";
  return cleanEmail(v) ? null : "That email doesn't look right. Fix it or leave it empty.";
}
