import { MEDALS, type MedalDef } from "./medals";

/**
 * The medals on the Me card (the site owner, 23 Nov 2026: "Put top 4-6
 * medals in the whitespace above next to the user name and profile pics"):
 * the player's best earned medals, six at most, set in an arc over their
 * photo on the card's green band, the best nearest the top and the rest
 * out to either side, so one medal sits centred and any number is even on
 * both sides. Which medals and where each goes; the drawing is
 * components/dashboard/MedalCrown.tsx. Pure, relative imports only
 * (npm run test:profile).
 */

export const CROWN_MAX = 6;
/** Degrees between neighbours on the arc. */
export const CROWN_STEP = 30;

const BY_ID = new Map(MEDALS.map((m) => [m.id, m]));

/** The medals to show, from the earned ids best first (PlayedResponse.medals): the first six this build knows. */
export function crownMedals(earned: readonly string[]): MedalDef[] {
  const out: MedalDef[] = [];
  for (const id of earned) {
    const m = BY_ID.get(id);
    if (m && !out.includes(m)) out.push(m);
    if (out.length >= CROWN_MAX) break;
  }
  return out;
}

/**
 * Where each of n medals sits, best first: degrees from straight up
 * (negative: to the left). One is at the top; two are either side of it;
 * each next pair goes one step further out, the better one on the left.
 */
export function crownAngles(n: number): number[] {
  const count = Math.max(0, Math.min(CROWN_MAX, Math.floor(n)));
  const slots = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * CROWN_STEP);
  return slots.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
}

/** A medal's centre from the photo's centre, in px, on an arc of `radius`: x to the right, y upward. */
export function crownPoint(angle: number, radius: number): { x: number; y: number } {
  const t = (angle * Math.PI) / 180;
  return { x: Math.round(radius * Math.sin(t) * 10) / 10, y: Math.round(radius * Math.cos(t) * 10) / 10 };
}

/** What the arc says to a screen reader, and as its tooltip: "Your top medals: Turf Veteran, Regular, Explorer. Open your medals". */
export function crownLabel(medals: readonly Pick<MedalDef, "name">[]): string {
  const names = medals.map((m) => m.name).join(", ");
  return `${medals.length === 1 ? "Your medal" : "Your top medals"}: ${names}. Open your medals`;
}
