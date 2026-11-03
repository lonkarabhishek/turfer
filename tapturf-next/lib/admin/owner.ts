/**
 * Who the site owner is, for the checks that need it without a request's
 * cookies: lib/admin/auth.ts (the admin pages) and the traffic counter,
 * which leaves the owner's own signed-in views out (lib/traffic/route.ts).
 * The database's own check is public._is_site_owner. Pure, no imports
 * (npm run test:traffic compiles it on its own).
 */

// The site owner. Signing in via EITHER of these paths unlocks /admin:
//   - Google OAuth with this email
//   - Phone OTP with this Indian number (the 10 digits after +91)
export const ADMIN_EMAILS = ["lonkarabhishek00@gmail.com"];
export const ADMIN_PHONES = ["9403612979"];

/**
 * The 10 digits of a verified Indian number, or "". Only "+91" and exactly
 * 10 digits count: matching the last 10 digits of any number would let a
 * foreign number that ends the same way (+1 940 ...) pass as the owner.
 */
export function indianPhone10(raw: string | null | undefined): string {
  const m = /^\+91(\d{10})$/.exec(raw ?? "");
  return m ? m[1] : "";
}

/**
 * Whether a verified sign-in (lib/account/identity.ts identify) is the
 * site owner's: the owner's number from a phone sign-in, or the owner's
 * email from a Google one. Only ever asked of an identity the server
 * checked itself.
 */
export function isOwnerIdentity(id: { kind: "phone"; phone: string } | { kind: "google"; email: string | null }): boolean {
  if (id.kind === "phone") {
    const phone = indianPhone10(id.phone);
    return !!phone && ADMIN_PHONES.includes(phone);
  }
  const email = id.email?.toLowerCase().trim();
  return !!email && ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);
}
