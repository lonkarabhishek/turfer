import { bookingLine } from "../turfPage/noContact";
import { gamePath } from "../utils/gamePath";

// Relative imports only, so node --test runs this (lib/my/claimNotice.test.ts, npm run test:my).

/**
 * What a claimant is told when TapTurf decides their claim: one in-app
 * notification (public.notifications, made by admin_answer_owner_claim in
 * 20261106_owner_claims_clarity.sql, shown in the Me tab's Alerts and, where
 * they turned it on, as a push to their phone). Never an email or an SMS.
 * The admin route builds the words here; the database adds the type and
 * the turf's id and slug, which the Alerts list links to.
 */

export const CLAIM_APPROVED = "owner_claim_approved";
export const CLAIM_REJECTED = "owner_claim_rejected";

/** The admin's own kind line on a rejection: one line of plain text, this long at most. */
export const KIND_LINE_MAX = 200;

/** The admin's line as it goes out: whitespace folded to single spaces, cut to KIND_LINE_MAX; null when empty. */
export function kindLine(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > KIND_LINE_MAX ? `${s.slice(0, KIND_LINE_MAX - 1).trimEnd()}…` : s;
}

// The database keeps a title to 120 characters and a message to 400 (as private.game_notify does).
const TITLE_MAX = 120;
const MESSAGE_MAX = 400;
const NAME_MAX = 60;

/** A turf's name for a notification: trimmed, never empty, cut so the message fits. */
function nameOf(turfName: string | null | undefined): string {
  const s = (turfName ?? "").replace(/\s+/g, " ").trim() || "this turf";
  return s.length > NAME_MAX ? `${s.slice(0, NAME_MAX - 1).trimEnd()}…` : s;
}

/**
 * The notification for a decision: approved (active), or rejected with the
 * admin's optional kind line. Null for any other status (revoking or
 * restoring tells nobody anything). A rejection ends with "Want to play
 * there?" and the site owner's line only where the turf's page shows it
 * (a number to contact, not a members' club: bookingLine); `page` unknown
 * keeps it.
 */
export function claimDecisionNotice(
  status: string,
  turfName: string | null | undefined,
  extra?: unknown,
  page: { hasNumber: boolean; membersOnly: boolean } = { hasNumber: true, membersOnly: false },
): { type: string; title: string; message: string } | null {
  const name = nameOf(turfName);
  if (status === "active") {
    return {
      type: CLAIM_APPROVED,
      title: "Your turf is on myTapturf now",
      message: `TapTurf confirmed that you run ${name}. Open myTapturf to keep its prices, hours and numbers right, and see who finds it.`.slice(0, MESSAGE_MAX),
    };
  }
  if (status === "rejected") {
    const line = kindLine(extra);
    const play = bookingLine(page.membersOnly, page.hasNumber);
    const message = [`TapTurf could not confirm that you run ${name}.`, line, play && `Want to play there? ${play}`].filter(Boolean).join(" ");
    return { type: CLAIM_REJECTED, title: "We couldn't confirm your claim".slice(0, TITLE_MAX), message: message.slice(0, MESSAGE_MAX) };
  }
  return null;
}

/**
 * Booking requests' notifications (20261106_booking_requests.sql): to the
 * turf's owners and managers a new request and a player's cancel, to the
 * player a confirm, a decline and the turf's cancel.
 */
export const BOOKING_TO_OWNER = ["booking_request", "booking_cancelled_by_player"] as const;
export const BOOKING_TO_PLAYER = ["booking_confirmed", "booking_declined", "booking_cancelled"] as const;

/** A tagged player is asked, once a game is over, whether they played (lib/games/played.ts). */
export const TAG_PLAYED_ASK = "game_tag_played_ask";

/**
 * An organiser is told once that their name now shows on the tournaments they started
 * (20261123_tournament_host.sql: only organisers with a public profile, from before that file).
 */
export const TOURNAMENT_HOST_SHOWN = "tournament_host_shown";

/**
 * An organiser is told once that their tournament now shows on the page of the turf they picked as its venue
 * (20261128_turf_events_notice.sql; metadata {code}: the tournament, whose Manage has the venue).
 */
export const TOURNAMENT_ON_TURF_PAGE = "tournament_on_turf_page";

/**
 * An account that had no username was given one and told once (20261128_usernames_assigned.sql;
 * lib/account/assigned.ts ASSIGNED_NOTICE has the words, and its test holds this type to it).
 */
export const USERNAME_ASSIGNED = "username_assigned";

/** Where tapping a notification goes, and what its small link says: a game (by its id: the page 308s to its readable URL, lib/utils/gamePath.ts), a claim decision's turf, or a booking request. Null: nowhere (it marks read). */
export function notificationLink(type: string, metadata: unknown): { href: string; label: string | null } | null {
  const m = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const id = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : null);
  const slug = typeof m.slug === "string" && /^[a-z0-9-]{1,120}$/.test(m.slug) ? m.slug : null;
  const turf = id(m.turfId);
  if (type === CLAIM_APPROVED && turf) return { href: `/my/turf/${turf}`, label: "Open myTapturf" };
  if (type === CLAIM_REJECTED && (slug || turf)) return { href: `/turf/${slug ?? turf}`, label: "Open the turf's page" };
  if ((BOOKING_TO_OWNER as readonly string[]).includes(type) && turf) return { href: `/my/turf/${turf}#requests`, label: "Open myTapturf" };
  if ((BOOKING_TO_PLAYER as readonly string[]).includes(type)) return { href: "/dashboard?tab=requests", label: "Your requests" };
  // "Were you at Football on Sat? Confirm it for your Passport" (20261118_game_tags_shown.sql): the card is on the Passport tab.
  if (type === TAG_PLAYED_ASK) return { href: "/dashboard?tab=passport", label: "Open your Passport" };
  // The card with Keep it and Change is at the top of the Profile section.
  if (type === USERNAME_ASSIGNED) return { href: "/dashboard?tab=profile#username", label: "Open Profile" };
  // The way to hide the name is the profile's own switch.
  if (type === TOURNAMENT_HOST_SHOWN) return { href: "/dashboard?tab=profile#find-and-tag", label: "Open that switch" };
  // The way to take it off the turf's page is the tournament's own venue, under Manage on its page.
  if (type === TOURNAMENT_ON_TURF_PAGE) return typeof m.code === "string" && /^[a-z0-9]{12}$/.test(m.code) ? { href: `/tournament/${m.code}`, label: "Open the tournament" } : null;
  // Older rows stored either { gameId } or { game_id }.
  const game = typeof m.gameId === "string" ? m.gameId : typeof m.game_id === "string" ? m.game_id : null;
  return game ? { href: gamePath({ id: game }), label: null } : null;
}
