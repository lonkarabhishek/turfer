import { ASPECT_ORDER, pitchLabel, type AspectId, type PlayedWhen } from "./catalog";
import type { Aspects, RateHint } from "./types";

/**
 * The words and numbers the report sheet works out as the player taps:
 * the rate card's title, the tip's placeholder, the price chips. Pure.
 */

const IST = "Asia/Kolkata";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: IST });

/** "today", "yesterday", "Saturday" (this week), or "12 Oct". long: Saturday, else Sat. */
export function dayWords(at: string, now: Date, long: boolean): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(d))) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days > 1 && days < 7) return d.toLocaleDateString("en-IN", { weekday: long ? "long" : "short", timeZone: IST });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });
}

/**
 * The rate card's title for this viewer. A TapTurf game here, else a call
 * or WhatsApp tap from this sign-in (review_mine works out which); the
 * plain "How was your game here?" for everyone else.
 */
export function rateTitle(turfName: string, hint: RateHint | null, now: Date): string {
  if (!hint) return "How was your game here?";
  if (hint.kind === "game") {
    const w = dayWords(hint.at, now, true);
    return w === "today" || w === "yesterday" ? `How was ${w}'s game at ${turfName}?` : /^\d/.test(w) ? `How was your ${w} game at ${turfName}?` : `How was ${w}'s game at ${turfName}?`;
  }
  const w = dayWords(hint.at, now, false);
  const on = w === "today" || w === "yesterday" ? w : `on ${w}`;
  return `You ${hint.kind === "call" ? "called" : "messaged"} ${turfName} ${on}. Played there?`;
}

/** How a flagged part is named in the tip's placeholder: "You flagged the lights." */
function flagName(a: AspectId, sport: string | null, turfSports: readonly string[]): string {
  if (a === "pitch") return pitchLabel(sport, turfSports).toLowerCase();
  if (a === "staff") return "staff";
  if (a === "washroom") return "washroom";
  if (a === "value") return "price";
  return a;
}

/** The tip's placeholder, from what the player tapped. */
export function tipPlaceholder(aspects: Aspects, sport: string | null, turfSports: readonly string[] = []): string {
  const rated = ASPECT_ORDER.filter((a) => aspects[a]);
  const flagged = rated.find((a) => aspects[a]?.score === -1);
  if (flagged) return `You flagged the ${flagName(flagged, sport, turfSports)}. What should the next team know?`;
  if (rated.length && rated.every((a) => aspects[a]?.score === 1)) return "What made it great? Best slot, parking, what to carry.";
  return "Anything the next team should know?";
}

/** Ask what they paid only while the turf has fewer than this many player prices. */
export const PRICE_ASK_BELOW = 3;

const round50 = (n: number) => Math.round(n / 50) * 50;
const inRange = (n: number) => n >= 100 && n <= 20_000;

export type PriceChip = { amount: number; listed?: boolean };

/** The turf's listed weekday hourly rates, and its lowest (a turf that lists per hour). */
export type ListedPrices = { morning: number | null; afternoon: number | null; evening: number | null; min: number | null };

/** The listed rate for the time of day they played: an evening or night game is the evening rate. */
export function listedFor(p: ListedPrices | null | undefined, when: PlayedWhen | null): number | null {
  if (!p) return null;
  const at = when === "evening" || when === "night" ? p.evening : when === "afternoon" ? p.afternoon : when === "morning" ? p.morning : null;
  return at && at > 0 ? at : p.min && p.min > 0 ? p.min : null;
}

/**
 * The amounts offered for "What did you pay for an hour?": the listed
 * hourly rate (rounded to ₹50, marked listed) with ₹200 either side; else
 * the lowest, middle and highest players shared; else ₹600, ₹1,000, ₹1,500.
 * "Other" comes after these in the sheet.
 */
export function priceChips(listed: number | null | undefined, players: { min: number; max: number } | null | undefined): PriceChip[] {
  const uniq = (xs: PriceChip[]) => xs.filter((x, i) => inRange(x.amount) && xs.findIndex((y) => y.amount === x.amount) === i);
  if (listed && listed > 0) {
    const l = round50(listed);
    return uniq([{ amount: l, listed: true }, { amount: l - 200 }, { amount: l + 200 }]);
  }
  if (players && players.min > 0 && players.max > 0) {
    const lo = round50(Math.min(players.min, players.max));
    const hi = round50(Math.max(players.min, players.max));
    return uniq([{ amount: lo }, { amount: round50((lo + hi) / 2) }, { amount: hi }]);
  }
  return [{ amount: 600 }, { amount: 1000 }, { amount: 1500 }];
}

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** The text "Send to your team" shares. */
export function shareText(turfName: string, slug: string): { text: string; url: string } {
  const url = `https://tapturf.in/turf/${slug}?rate=1`;
  return { text: `We played at ${turfName}. Rate your game too, it takes 20 seconds: ${url}`, url };
}
