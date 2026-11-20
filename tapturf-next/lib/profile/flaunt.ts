/**
 * "Flaunt my medals" (components/profile/FlauntMedals.tsx, FlauntSheet.tsx):
 * the words, who can have a story picture, and which way of posting it
 * the sheet leads with. The picture is GET /api/og/medals/<username>
 * (lib/og/medalStory.ts), served only for a public profile. Pure;
 * relative imports only (npm run test:profile).
 *
 * The web has no link that opens Instagram's story editor with a picture
 * in it: the sheet hands the file to the phone's own share sheet, where
 * the player picks Instagram, then Story. It never says more than that.
 */

export const FLAUNT_COPY = {
  button: "Flaunt my medals",
  title: "Flaunt your medals",
  lead: "A picture of your medals, sized for an Instagram story.",
  alt: "Your story picture: your top medal, your numbers, your other medals and your profile's address.",
  making: "Making your picture…",
  share: "Share to my story",
  shareHint: "Your phone's share sheet opens. Pick Instagram, then Story.",
  save: "Save image",
  saveHint: "Save the picture, then add it to your story from the Instagram app.",
  hold: "Or press and hold the picture to save it.",
  copy: "Copy my profile link",
  copied: "Link copied",
  copyHint: "A story can't be tapped, so the picture carries your profile's address. To make it one tap, add Instagram's Link sticker and paste your link.",
  copyFailed: "Couldn't copy. Your link:",
  shareFailed: "The share sheet didn't open. Save the image instead.",
  failed: "Couldn't make your picture. Check your connection and try again.",
  retry: "Try again",
  close: "Close",
  hiddenTitle: "Your profile is hidden",
  hidden: "The picture is made from your public profile, and yours is off. Turn on “Let others find and tag me” in your profile settings, then come back.",
  hiddenLink: "Open profile settings",
  usernameTitle: "Pick a username first",
  username: "The picture carries your profile's address, tapturf.in/u/your-username. Pick a username and it is ready.",
  usernameLink: "Pick a username",
  gone: "There is no public profile with medals for you right now. If you turned off “Let others find and tag me”, turn it back on in your profile settings.",
} as const;

/** Where "Let others find and tag me" is, and the username box. */
export const FLAUNT_LINKS = { hidden: "/dashboard?tab=profile#find-and-tag", username: "/dashboard?tab=profile#username" } as const;

/** ok: a picture can be made; username: none picked yet; hidden: "Let others find and tag me" is off (taggable is true unless the account says false). */
export type FlauntState = "ok" | "username" | "hidden";

export function flauntState(user: { username?: string | null; taggable?: boolean } | null | undefined): FlauntState {
  if (!user?.username) return "username";
  return user.taggable === false ? "hidden" : "ok";
}

/**
 * Whether the sheet leads with the share sheet: only where the browser
 * can share a file (canShare said so for this very file) and the device
 * is a phone or a tablet (a coarse pointer). A desktop browser that can
 * share files has no Instagram to hand them to, so it leads with Save.
 */
export function leadsWithShare(o: { canShareFile: boolean; coarsePointer: boolean }): boolean {
  return o.canShareFile && o.coarsePointer;
}

/** The profile's address as a link to paste: https://www.tapturf.in/u/asha (the page's origin while testing elsewhere). */
export function flauntLink(origin: string, username: string): string {
  return `${origin.replace(/\/+$/, "")}/u/${username.toLowerCase()}`;
}
