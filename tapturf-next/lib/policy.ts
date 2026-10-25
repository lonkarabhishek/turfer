/**
 * When the privacy policy last changed (app/privacy/page.tsx, the
 * sitemap). A change to what we collect or share also bumps
 * PRIVACY_NOTICE, which signed-in people see once (PolicyNotice).
 */
export const PRIVACY_UPDATED = "2026-10-25";

/** The latest change that needs a notice on the site, as the policy promises. */
export const PRIVACY_NOTICE = { id: "2026-10-25-email", text: "You can now add an email to your TapTurf account for turf deals and game invites.", anchor: "email" } as const;
