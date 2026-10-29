/**
 * When the privacy policy last changed (app/privacy/page.tsx, the
 * sitemap). A change to what we collect or share also bumps
 * PRIVACY_NOTICE, which signed-in people see once (PolicyNotice): a new
 * id, named for that change's date, or nobody who dismissed the last one
 * is told. A later change that needs no notice moves only this date.
 */
export const PRIVACY_UPDATED = "2026-10-29";

/** The latest change that needs a notice on the site, as the policy promises. */
export const PRIVACY_NOTICE = {
  id: "2026-10-28-managed-by",
  text: "If you run a turf on myTapturf, its page now says “Managed by @your-username” (with your tick, if you have one) when you have a username and “Let others find and tag me” is on. Your name, number and email never show there; turn that switch off to hide it.",
  anchor: "owners",
  // The notice this one replaced (it already carried the 2026-10-27 game reports notice and the verified tick):
  // said too, after this one, to anyone who never dismissed it.
  earlier: {
    id: "2026-10-27-tools",
    text: "Rating a turf is now a quick game report: your stars and the parts you tap are public, a private note to the owner never is. People who confirm both their phone and email now get a tick next to their name; we never show either one. And when you use our free tools signed in, we now note which tool you used, and what for, with your account. Only TapTurf's team sees that.",
  },
} as const;

/** What the notice says on a device whose last dismissed notice is `seen` (null: none). */
export function privacyNoticeText(seen: string | null): string {
  return seen === PRIVACY_NOTICE.earlier.id ? PRIVACY_NOTICE.text : `${PRIVACY_NOTICE.text} ${PRIVACY_NOTICE.earlier.text}`;
}
