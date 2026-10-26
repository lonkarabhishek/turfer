/**
 * When the privacy policy last changed (app/privacy/page.tsx, the
 * sitemap). A change to what we collect or share also bumps
 * PRIVACY_NOTICE, which signed-in people see once (PolicyNotice).
 */
export const PRIVACY_UPDATED = "2026-10-27";

/** The latest change that needs a notice on the site, as the policy promises. */
export const PRIVACY_NOTICE = {
  id: "2026-10-27-tools",
  // Also carries the same day's game reports notice (2026-10-27-reports), which it replaced, and the verified tick.
  text: "Rating a turf is now a quick game report: your stars and the parts you tap are public, a private note to the owner never is. People who confirm both their phone and email now get a tick next to their name; we never show either one. And when you use our free tools signed in, we now note which tool you used, and what for, with your account. Only TapTurf's team sees that.",
  anchor: "tools",
} as const;
