/**
 * Phone number normalization for India (+91).
 *
 * Real-world input comes in every shape: "+91 8446611191",
 * "918446611191", "8446611191", "91 84466-11191", "091 8446611191".
 * The old codepath was normalising for wa.me (which starts "91…")
 * but then blindly prepending "+91" for tel:, producing
 * "tel:+91918446611191" — Android/iOS dialers silently dial
 * garbage. One helper, both link builders, canonical output.
 *
 * Cases handled (verify manually — no test runner in this repo):
 *   "+91 8446611191"  → local 8446611191, digits 918446611191, e164 +918446611191
 *   "918446611191"    → local 8446611191, digits 918446611191, e164 +918446611191
 *   "8446611191"      → local 8446611191, digits 918446611191, e164 +918446611191
 *   "091 8446611191"  → local 8446611191, digits 918446611191, e164 +918446611191
 *   "+91-84466-11191" → local 8446611191, digits 918446611191, e164 +918446611191
 *   "  "              → null
 *   "12345"           → null (too short to be a real Indian mobile)
 *   "44 20 7946 0958" → null (foreign — we don't try to guess)
 *   "0253 235 0977"   → landline 2532350977, e164 +912532350977
 *   "+91 22 2437 9284"→ landline 2224379284, e164 +912224379284
 */

export interface NormalizedIndianPhone {
  /** Mobiles can take WhatsApp; landlines (STD code + number) are call only. */
  type: "mobile" | "landline";
  /** 10-digit national number, e.g. "8446611191" or "2532350977" */
  local: string;
  /** wa.me-friendly digits with country code, no plus, e.g. "918446611191" */
  digits: string;
  /** E.164, e.g. "+918446611191" (tel: friendly) */
  e164: string;
}

export function normalizeIndianPhone(
  raw: string | null | undefined,
): NormalizedIndianPhone | null {
  if (!raw || typeof raw !== "string") return null;
  // Strip everything that isn't a digit.
  let d = raw.replace(/\D/g, "");
  if (!d) return null;

  // Trunk-prefix "0" from Indian STD dialling and its variants:
  //   "0091..."          → "91..."   (00 international prefix)
  //   "091<10-digit>"    → "91..."   (single-0 before 91)
  //   "0<10-digit>"      → "<10>"   (single-0 before a mobile number)
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 13 && d.startsWith("091")) d = d.slice(1);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);

  // Peel the country code if present.
  if (d.length === 12 && d.startsWith("91")) {
    d = d.slice(2);
  }

  // What's left must be 10 digits: a mobile (6-9) or a landline with
  // its STD code (2-5), e.g. "0253 235 0977" -> 2532350977 (Nashik).
  if (d.length !== 10) return null;
  const type = /^[6-9]\d{9}$/.test(d) ? "mobile" : /^[2-5]\d{9}$/.test(d) ? "landline" : null;
  if (!type) return null;

  return {
    type,
    local: d,
    digits: `91${d}`,
    e164: `+91${d}`,
  };
}

/** Mobile numbers only (for WhatsApp); null for landlines and junk. */
export function normalizeIndianMobile(raw: string | null | undefined): NormalizedIndianPhone | null {
  const n = normalizeIndianPhone(raw);
  return n?.type === "mobile" ? n : null;
}

/** Build a tel: href, or null when the input can't be normalised. */
export function telHref(raw: string | null | undefined): string | null {
  const n = normalizeIndianPhone(raw);
  return n ? `tel:${n.e164}` : null;
}
