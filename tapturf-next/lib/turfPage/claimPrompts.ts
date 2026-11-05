import { BOOKING_LINE, bookingLine } from "./noContact";

// Relative imports only, so node --test runs this (lib/turfPage/claimPrompts.test.ts, npm run test:turf).

/**
 * Which claim prompts an unclaimed turf's page shows, and their words.
 *
 * Players were claiming turfs to book them (5 Nov 2026): 5 of the 11 real
 * claims came from pages with no number, all after the hint above the
 * photos arrived (29 Oct), and none of them led to owner work. On those
 * pages the claim links were the only actions about the turf. Owners do
 * come through claims on pages with a number, so the prompts stay there,
 * fewer and naming the role:
 *
 * - hint: the quiet line under the sport chips, only on a page with a
 *   usable number (lib/utils/contact.ts hasUsableContact).
 * - pricingLine: one small text line in an empty Pricing section ("Turf
 *   owner? Add your prices on myTapturf"), only where the hint is not
 *   shown, so a phone never shows more than two (the hint or this line,
 *   and the invite). Players' "Played here? Share the rate" is that
 *   section's main button either way.
 * - invite: the owner's way in, after the reviews, on every unclaimed page.
 * - sidebar: the desktop sidebar's line (1024px and up only), with a number only.
 *
 * A claimed turf shows none of them (its owner has myTapturf).
 */
export type ClaimPrompts = { hint: boolean; pricingLine: boolean; invite: boolean; sidebar: boolean };

export function claimPrompts({ claimed, hasNumber, noPrices }: { claimed: boolean; hasNumber: boolean; noPrices: boolean }): ClaimPrompts {
  if (claimed) return { hint: false, pricingLine: false, invite: false, sidebar: false };
  return { hint: hasNumber, pricingLine: noPrices && !hasNumber, invite: true, sidebar: hasNumber };
}

/** How many claim prompts a phone shows (the sidebar is desktop only). */
export function phoneClaimPromptCount(p: ClaimPrompts): number {
  return [p.hint, p.pricingLine, p.invite].filter(Boolean).length;
}

/** The site owner's line for players (5 Nov 2026), word for word: one source, the turf page's (lib/turfPage/noContact.ts). */
export const BOOKINGS_LINE = BOOKING_LINE;

/** The words of each prompt, kept here so the tests read them. Never a bare "Claim it free": it reads like a free offer. */
export const CLAIM_COPY = {
  hint: { ask: "Own or manage this turf?", link: "Manage this page, free" },
  pricingLine: { ask: "Turf owner?", link: "Add your prices on myTapturf" },
  sidebar: { ask: "Own or manage this turf?", link: "Manage this page, free" },
  invite: {
    label: "For the turf's owner or manager",
    title: "Is this your turf?",
    lead: "If you own or manage it, claim this page on myTapturf, free. Players then see it's a claimed turf, and you see how they find you.",
    button: "Claim this turf",
    withNumber: "Have the phone with the number on this page? A code to it gets you in at once. If not, our team checks by hand.",
    noNumber: "This page has no number yet, so our team checks your claim by hand: you give us the turf's number and we call it, usually within a day.",
    // The page's only number is a landline: no code can go to it.
    landline: "This page's number is a landline, so our team checks your claim by hand: you give us a mobile at the turf and we call it, usually within a day.",
    players: "Here to play?",
    // A page with no number: no call, book or reserve (there is none to contact); its bar and sidebar card have the button.
    playersNoNumber: "If you know the turf's number, tap I know the number.",
  },
} as const;

/**
 * The invite's last line, for a player who came to book: the site owner's
 * line only where the page has a number to contact and isn't a members'
 * club (bookingLine, the phone bar's own rule); with no number, how to tell
 * us one; a members' club with a number, none (the page says how to ask
 * about guest access).
 */
export function invitePlayersLine({ hasNumber, membersOnly }: { hasNumber: boolean; membersOnly: boolean }): { lead: string; line: string } | null {
  const booking = bookingLine(membersOnly, hasNumber);
  if (booking) return { lead: CLAIM_COPY.invite.players, line: booking };
  return hasNumber ? null : { lead: CLAIM_COPY.invite.players, line: CLAIM_COPY.invite.playersNoNumber };
}

/**
 * Copy a person sees about claims must not read like a booking or a
 * promise: no "Book now", "Reserve", urgency, a bare "Claim it free", or
 * the phrasings the site owner ruled out ("TapTurf doesn't take bookings").
 * The one place "book" may appear is BOOKINGS_LINE itself. Returns the
 * first problem found, or null.
 */
export function claimCopyProblem(s: string): string | null {
  const rest = s.split(BOOKINGS_LINE).join(" ");
  const rules: [RegExp, string][] = [
    [/\bclaim it free\b/i, "bare claim it free"],
    [/\b(?:doesn'?t|does not|don'?t|do not|won'?t)\s+take\s+bookings?\b|\btakes?\s+no\s+bookings?\b/i, "ruled-out booking phrasing"],
    [/\bbook(?:ing|ings|ed|s)?\b/i, "booking word outside the site owner's line"],
    [/\breserv(?:e|ed|ation|ations)\b/i, "reserve"],
    [/\b(?:hurry|filling fast|limited|today only|last chance)\b/i, "urgency"],
  ];
  for (const [re, why] of rules) if (re.test(rest)) return why;
  return null;
}
