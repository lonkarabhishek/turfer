/**
 * When the privacy policy last changed (app/privacy/page.tsx, the
 * sitemap). A change to what we collect or share also bumps
 * PRIVACY_NOTICE, which signed-in people see once (PolicyNotice).
 */
export const PRIVACY_UPDATED = "2026-10-27";

/** The latest change that needs a notice on the site, as the policy promises. */
export const PRIVACY_NOTICE = {
  id: "2026-10-27-tools",
  text: "When you use our free tools signed in, we now note which tool you used, and what for, with your account. Only TapTurf's team sees it.",
  anchor: "tools",
} as const;
