import { BOOKINGS_LINE } from "../turfPage/claimPrompts";

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
 * restoring tells nobody anything).
 */
export function claimDecisionNotice(status: string, turfName: string | null | undefined, extra?: unknown): { type: string; title: string; message: string } | null {
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
    const message = [`TapTurf could not confirm that you run ${name}.`, line, `Want to play there? ${BOOKINGS_LINE}`].filter(Boolean).join(" ");
    return { type: CLAIM_REJECTED, title: "We couldn't confirm your claim".slice(0, TITLE_MAX), message: message.slice(0, MESSAGE_MAX) };
  }
  return null;
}

/** Where tapping a notification goes, and what its small link says: a game, or a claim decision's turf. Null: nowhere (it marks read). */
export function notificationLink(type: string, metadata: unknown): { href: string; label: string | null } | null {
  const m = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : {};
  const id = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : null);
  const slug = typeof m.slug === "string" && /^[a-z0-9-]{1,120}$/.test(m.slug) ? m.slug : null;
  const turf = id(m.turfId);
  if (type === CLAIM_APPROVED && turf) return { href: `/my/turf/${turf}`, label: "Open myTapturf" };
  if (type === CLAIM_REJECTED && (slug || turf)) return { href: `/turf/${slug ?? turf}`, label: "Open the turf's page" };
  // Older rows stored either { gameId } or { game_id }.
  const game = typeof m.gameId === "string" ? m.gameId : typeof m.game_id === "string" ? m.game_id : null;
  return game ? { href: `/game/${game}`, label: null } : null;
}
