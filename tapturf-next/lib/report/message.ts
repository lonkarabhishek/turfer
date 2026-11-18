/**
 * The WhatsApp message the team sends a turf's owner from the admin's
 * Owner outreach section, prefilled and plain, for the sender to edit in
 * WhatsApp. Its numbers are the last 30 days', the ones the report page
 * shows (taps30 and views30 of admin_owner_outreach), so the message and
 * the report never disagree. Honest words: players "tapped Call or
 * WhatsApp" (a tap is counted, not a call, a chat or a booking), and a
 * count is of taps or of times the page was opened, never of people. Where
 * players used "Ask for a slot" on the page in those 30 days
 * (lib/slotAsk/; `asks`, admin_slot_asks' asks30), the message leads with
 * that: "players asked for a slot at <turf> 14 times", a count of asks
 * (each one WhatsApp opened with the question written), never of people
 * or of slots given. Pure, no imports (npm run test:outreach).
 */

export const REPORT_DAYS = 30;

/** "1 time", "12 times", "1,240 times". */
export function timesText(n: number): string {
  return n === 1 ? "1 time" : `${n.toLocaleString("en-IN")} times`;
}

const count = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function outreachMessage(t: { name: string; taps: number; views: number; reportUrl: string; claimed?: boolean; asks?: number }): string {
  const name = t.name.replace(/\s+/g, " ").trim() || "your turf";
  const taps = count(t.taps);
  const views = count(t.views);
  const asks = count(t.asks);
  const what =
    asks > 0
      ? // Each ask is a WhatsApp tap too: the taps are said "in all", and only when there were more of them.
        `In the last ${REPORT_DAYS} days, players asked for a slot at ${name} ${timesText(asks)} from its page on TapTurf${taps > asks ? `, and tapped Call or WhatsApp ${timesText(taps)} in all` : ""}.`
      : taps > 0
      ? `In the last ${REPORT_DAYS} days, players tapped Call or WhatsApp ${timesText(taps)} on ${name}'s page on TapTurf.`
      : views > 0
        ? `In the last ${REPORT_DAYS} days, ${name}'s page on TapTurf was opened ${timesText(views)}.`
        : `${name} has a page on TapTurf.`;
  const last = t.claimed
    ? "You can see these numbers any time on myTapturf."
    : "You can claim your page for free to keep your prices, hours and photos right.";
  return `Hi, this is TapTurf (tapturf.in). ${what}\n\nYour free report: ${t.reportUrl}\n\n${last}`;
}
