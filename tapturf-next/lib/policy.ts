/**
 * When the privacy policy last changed (app/privacy/page.tsx, the
 * sitemap). A change to what we collect or share also bumps
 * PRIVACY_NOTICE, which signed-in people see once (PolicyNotice): a new
 * id, named for that change's date, or nobody who dismissed the last one
 * is told. A later change that needs no notice moves only this date.
 */
export const PRIVACY_UPDATED = "2026-11-06";

/** The latest change that needs a notice on the site, as the policy promises. */
export const PRIVACY_NOTICE = {
  id: "2026-11-02-map",
  text: "When you use the map signed in, we now note which account used it, on which days and when (the first and last time each day), with how many times it opened the map and its turf and game cards. Only TapTurf's team sees that. We also count how the map is used each day; never where you looked on it or your location.",
  anchor: "map",
  // The notice this one replaced (review photos and reporting), with the one before it (played with, which
  // already carried the profile photos notice, Managed by, game reports, the verified tick and free tool use):
  // said too, after this one, to anyone who never dismissed it.
  earlier: {
    id: "2026-11-01-review-photos",
    text: "You can now add up to three photos from your game to a turf report. They are public with your report. Your phone and our server leave out the details your camera adds, such as where a photo was taken, and Anthropic's AI checks each one before it is kept. To take one off, edit your report, or remove the report. A report from someone who played a TapTurf game at that turf now says “Played here (verified)”, never which game. And if you report someone else's review, we keep who reported it and why; only TapTurf's team sees that. Your public profile now shows your TapTurf numbers: how many games, turfs, cities and sports, your best weekly streak, your medals and the turfs you reviewed. Only counts, never where or when you played. Your Me tab lists the people you played games with; only you see it. Your WhatsApp number shows there to them only if you turn on “Let players I've played with see my WhatsApp”. It is off until you do. You can now add a profile photo or pick a sports avatar on the Me tab. Your picture is public: it shows on your profile and your games. Photos you upload are checked automatically before they show, and you can remove yours any time. If you run a turf on myTapturf, its page now says “Managed by @your-username” (with your tick, if you have one) when you have a username and “Let others find and tag me” is on. Your name, number and email never show there; turn that switch off to hide it. Rating a turf is now a quick game report: your stars and the parts you tap are public, a private note to the owner never is. People who confirm both their phone and email now get a tick next to their name; we never show either one. And when you use our free tools signed in, we now note which tool you used, and what for, with your account. Only TapTurf's team sees that.",
  },
} as const;

/** What the notice says on a device whose last dismissed notice is `seen` (null: none). */
export function privacyNoticeText(seen: string | null): string {
  return seen === PRIVACY_NOTICE.earlier.id ? PRIVACY_NOTICE.text : `${PRIVACY_NOTICE.text} ${PRIVACY_NOTICE.earlier.text}`;
}
