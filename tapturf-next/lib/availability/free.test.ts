import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_FILTER_HINT,
  FREE_FILTER_LABEL,
  FREE_KEYS_MAX,
  FREE_REQUEST,
  FREE_SLOTS_HASH,
  FREE_WINDOW_HOURS,
  OWNER_NUDGE,
  dayWord,
  freeCardOf,
  freeCards,
  freeHref,
  freeLine,
  keyLabel,
  markedLine,
  noFreeTitle,
  pageHasNumber,
  parseFreeAnswer,
  parseFreeCard,
  type FreeRow,
} from "./free";
import { freeDays, slotDays, type SlotHours } from "./slots";
import { FACET_LABELS } from "../turfList/facts";

/** An India wall-clock time as an instant: ist("2026-11-10 16:30"). */
const ist = (s: string) => Date.parse(`${s.replace(" ", "T")}:00+05:30`);
const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3_600_000;
const H = (o: Partial<SlotHours>): SlotHours => ({ opening_hours: null, start_time: null, end_time: null, is_24x7: null, closed_days: null, ...o });
const NOW = ist("2026-11-10 16:30"); // a Tuesday
const ID = (i: number) => `dddddddd-0000-4000-8000-${String(i).padStart(12, "0")}`;
const row = (o: Partial<FreeRow> = {}): FreeRow => ({
  id: ID(1),
  slug: "dribble-standin-bangalore",
  name: "Dribble Standin",
  area: "Made-up Layout",
  city: "bangalore",
  lat: 12.91,
  lng: 77.61,
  updatedAt: iso(NOW - 2 * HOUR),
  requests: false,
  booked: [],
  bookedUntil: NOW + FREE_WINDOW_HOURS * HOUR,
  hours: H({ start_time: "06:00:00", end_time: "02:00:00" }),
  ...o,
});

test("the words: the filter, its hint, the request line, the owners' nudge, the empty list", () => {
  assert.equal(FREE_FILTER_LABEL, "Free hours marked");
  assert.equal(FACET_LABELS.free, FREE_FILTER_LABEL, "the pill and the sheet say the same");
  assert.equal(FREE_FILTER_HINT, "Hours the turf's owner marked free on TapTurf");
  assert.equal(FREE_REQUEST, "Request a free hour");
  assert.deepEqual(OWNER_NUDGE, { lead: "Own a turf?", link: "Mark your free hours on myTapturf", href: "/my" });
  assert.equal(noFreeTitle("Pune", false), "No turf in Pune has marked free hours yet.");
  assert.equal(noFreeTitle(null, false), "No turf has marked free hours yet.");
  assert.equal(noFreeTitle("Pune", true), "No turf in Pune with these filters has marked free hours yet.");
  assert.equal(noFreeTitle("Bangalore", false, "court"), "No court in Bangalore has marked free hours yet.");
  // A city+sport page names its sport; a sport chip or a search is one more filter.
  assert.equal(noFreeTitle("Bangalore", false, "turf", "Football"), "No football turf in Bangalore has marked free hours yet.");
  assert.equal(noFreeTitle("Bangalore", false, "court", "Badminton"), "No badminton court in Bangalore has marked free hours yet.");
  assert.equal(noFreeTitle("Bangalore", true, "turf", "Box Cricket"), "No box cricket turf in Bangalore with these filters has marked free hours yet.");
  assert.equal(freeHref("/turf/dribble-standin-bangalore"), "/turf/dribble-standin-bangalore#free-slots");
  assert.equal(FREE_SLOTS_HASH, "#free-slots");
  for (const s of [FREE_FILTER_LABEL, FREE_FILTER_HINT, FREE_REQUEST, OWNER_NUDGE.lead, OWNER_NUDGE.link, noFreeTitle("Pune", true), markedLine(iso(NOW - HOUR), NOW)])
    assert.doesNotMatch(s, /\bbook|instant|guarantee|for sure|available/i, s);
});

test("a turf's free hours: the turf page's own (slotDays, freeDays) in the window, booked hours out, by business day", () => {
  const r = row({ booked: ["2026-11-10T18:00", "2026-11-10T20:00", "2026-11-11T01:00"] });
  const card = freeCardOf(r, NOW, NOW + FREE_WINDOW_HOURS * HOUR)!;
  assert.ok(card);
  assert.equal(card.updatedAt, r.updatedAt);
  assert.equal(card.requests, false);
  // Today (Tue) from 5 PM: 6 PM and 8 PM booked; after midnight 12 AM, (1 AM booked); then Wednesday until 4:30 AM Thursday.
  assert.deepEqual(card.days[0], { date: "2026-11-10", keys: ["2026-11-10T17:00", "2026-11-10T19:00", "2026-11-10T21:00", "2026-11-10T22:00", "2026-11-10T23:00", "2026-11-11T00:00"] });
  assert.equal(card.days[1].date, "2026-11-11");
  assert.equal(card.days[1].keys[0], "2026-11-11T06:00");
  // The same as the turf page's card shows for those days.
  const page = freeDays(slotDays(r.hours, NOW), new Set(r.booked));
  assert.deepEqual(card.days[0].keys, page[0].free.map((s) => s.key));
  // Every key in the window, none past it.
  const all = card.days.flatMap((d) => d.keys);
  assert.ok(all.length <= FREE_KEYS_MAX);
  assert.ok(all.every((k) => Date.parse(`${k}:00+05:30`) > NOW && Date.parse(`${k}:00+05:30`) < NOW + FREE_WINDOW_HOURS * HOUR));
});

test("at most FREE_KEYS_MAX times; a window that starts later (fromMs) keeps only those", () => {
  const card = freeCardOf(row({ hours: H({ is_24x7: true }) }), NOW, NOW + 36 * HOUR)!;
  assert.equal(card.days.flatMap((d) => d.keys).length, FREE_KEYS_MAX);
  const tomorrowEvening = freeCardOf(row(), NOW, ist("2026-11-11 22:00"), ist("2026-11-11 17:00"))!;
  assert.deepEqual(tomorrowEvening.days, [{ date: "2026-11-11", keys: ["2026-11-11T17:00", "2026-11-11T18:00", "2026-11-11T19:00", "2026-11-11T20:00", "2026-11-11T21:00"] }]);
  assert.equal(freeCardOf(row(), NOW, NOW), null, "an empty window");
  assert.equal(freeCardOf(row(), NOW, NOW + HOUR, NOW + 2 * HOUR), null, "a window that ends before it starts");
});

test("not fresh, no hours, every hour booked: no card", () => {
  assert.equal(freeCardOf(row({ updatedAt: iso(NOW - 25 * HOUR) }), NOW, NOW + 36 * HOUR), null, "marks over 24 h old");
  assert.equal(freeCardOf(row({ hours: H({}) }), NOW, NOW + 36 * HOUR), null, "no hours we can read");
  const all = freeDays(slotDays(row().hours, NOW), new Set()).flatMap((d) => d.free.map((s) => s.key));
  assert.equal(freeCardOf(row({ booked: all }), NOW, NOW + 36 * HOUR), null, "every hour booked");
  // A closed day has no hours.
  const closedWed = freeCardOf(row({ hours: H({ start_time: "06:00:00", end_time: "23:00:00", closed_days: "Wednesday" }) }), ist("2026-11-10 23:30"), ist("2026-11-12 04:00"));
  assert.equal(closedWed, null, "Tuesday is over and Wednesday is closed");
});

test("freeCards: each turf with a free hour, by id, in the read's order", () => {
  const rows = [row({ id: ID(2), updatedAt: iso(NOW - HOUR) }), row(), row({ id: ID(3), updatedAt: iso(NOW - 30 * HOUR) })];
  assert.deepEqual([...freeCards(rows, NOW).keys()], [ID(2), ID(1)]);
});

test("the card's line: the first day with an hour to come, at most four times and +N; hours that start drop off", () => {
  const card = freeCardOf(row({ booked: ["2026-11-10T18:00"] }), NOW, NOW + 36 * HOUR)!;
  let l = freeLine(card, NOW)!;
  assert.equal(l.text, "Free today: 5 PM, 7 PM, 8 PM, 9 PM +4");
  assert.deepEqual([l.lead, l.times, l.more, l.requests], ["Free today", ["5 PM", "7 PM", "8 PM", "9 PM"], 4, false]);
  assert.equal(l.marked, "Marked free by the owner 2 h ago");
  // At 8:10 PM the 5 PM and 7 PM hours have started.
  l = freeLine(card, ist("2026-11-10 20:10"))!;
  assert.equal(l.text, "Free today: 9 PM, 10 PM, 11 PM, 12 AM +1");
  // At 1:10 AM, last night's after-midnight hour is "tonight".
  const late = freeCardOf(row({ updatedAt: iso(ist("2026-11-11 00:30")) }), ist("2026-11-11 00:30"), ist("2026-11-12 00:00"))!;
  assert.equal(freeLine(late, ist("2026-11-11 00:40"))!.text, "Free tonight: 1 AM");
  // Once tonight's are gone, Wednesday's (today now).
  assert.equal(freeLine(late, ist("2026-11-11 01:10"))!.text, "Free today: 6 AM, 7 AM, 8 AM, 9 AM +14");
  // Tomorrow, and a later weekday.
  const tmrw = { updatedAt: iso(NOW), requests: true, days: [{ date: "2026-11-11", keys: ["2026-11-11T07:00", "2026-11-11T08:00"] }] };
  l = freeLine(tmrw, NOW)!;
  assert.equal(l.text, "Free tomorrow: 7 AM, 8 AM");
  assert.equal(l.requests, true);
  assert.equal(dayWord("2026-11-13T19:00", NOW), "Fri");
  // By the hour itself: tonight's after-midnight hours are "tonight", whichever business day holds them.
  assert.equal(dayWord("2026-11-11T00:00", ist("2026-11-10 23:30")), "tonight");
  assert.equal(dayWord("2026-11-11T07:00", ist("2026-11-10 23:30")), "tomorrow");
  assert.equal(dayWord("2026-11-11T02:00", ist("2026-11-11 01:10")), "tonight");
  assert.equal(dayWord("2026-11-11T06:00", ist("2026-11-11 01:10")), "today");
  assert.equal(dayWord("2026-11-12T01:00", NOW), "Thu", "two nights on: its weekday");
  // An overnight turf and a 24-hour turf at 11:30 PM say the same of 12 AM.
  const at = ist("2026-11-10 23:30");
  const overnight = freeCardOf(row({ updatedAt: iso(at) }), at, at + 36 * HOUR)!;
  const round = freeCardOf(row({ updatedAt: iso(at), hours: H({ is_24x7: true }) }), at, at + 36 * HOUR)!;
  assert.equal(freeLine(overnight, at)!.text, "Free tonight: 12 AM, 1 AM");
  assert.equal(freeLine(round, at)!.text, "Free tonight: 12 AM, 1 AM, 2 AM, 3 AM +20");
  // Stale, or every hour started: no line.
  assert.equal(freeLine(card, NOW + 25 * HOUR), null);
  assert.equal(freeLine({ updatedAt: iso(NOW), requests: false, days: [{ date: "2026-11-10", keys: ["2026-11-10T15:00"] }] }, NOW), null);
  assert.equal(freeLine(null, NOW), null);
  assert.equal(keyLabel("2026-11-10T06:30"), "6:30 AM");
  // A 24-hour turf at 10:45 PM: its 11 PM and the hours after midnight (the next business day) read as one run.
  const allNight = freeCardOf(row({ hours: H({ is_24x7: true }), booked: ["2026-11-11T02:00"] }), ist("2026-11-10 22:45"), ist("2026-11-11 22:45"))!;
  assert.deepEqual(allNight.days.map((d) => d.date), ["2026-11-10", "2026-11-11"]);
  assert.equal(freeLine(allNight, ist("2026-11-10 22:45"))!.text, "Free today: 11 PM, 12 AM, 1 AM", "the run stops at the booked 2 AM");
  // Not a run (a gap at midnight): the first day alone.
  const gap = { updatedAt: iso(NOW), requests: false, days: [{ date: "2026-11-10", keys: ["2026-11-10T22:00"] }, { date: "2026-11-11", keys: ["2026-11-11T06:00"] }] };
  assert.equal(freeLine(gap, NOW)!.text, "Free today: 10 PM");
});

test("the database's answer, checked: bad rows left out, booked keys kept only when they are keys", () => {
  const good = {
    id: ID(1), slug: "s", name: "N", area: null, city: "bangalore", lat: 12.9, lng: 77.6, updated_at: iso(NOW), requests: true,
    booked: ["2026-11-10T19:00", "nope", 3], hours: { opening_hours: null, start_time: "06:00:00", end_time: "23:00:00", is_24x7: false, closed_days: null },
  };
  const a = parseFreeAnswer({ now: iso(NOW), turfs: [good, { ...good, id: "x" }, { ...good, updated_at: "never" }, { ...good, hours: null }, null] })!;
  assert.equal(a.rows.length, 1);
  assert.deepEqual(a.rows[0].booked, ["2026-11-10T19:00"]);
  assert.equal(a.rows[0].updatedAt, iso(NOW));
  assert.equal(a.rows[0].requests, true);
  assert.equal(parseFreeAnswer({ turfs: [] }), null);
  assert.equal(parseFreeAnswer({ now: "x", turfs: [] }), null);
  assert.equal(parseFreeAnswer([]), null);
  // A saved or sent card, checked.
  assert.deepEqual(parseFreeCard({ updatedAt: iso(NOW), requests: 1, days: [{ date: "2026-11-10", keys: ["2026-11-10T19:00", "x"] }, { date: "bad", keys: [] }] }), {
    updatedAt: iso(NOW), requests: false, days: [{ date: "2026-11-10", keys: ["2026-11-10T19:00"] }],
  });
  assert.equal(parseFreeCard(null), null);
});

test("the read's horizon: no hour past it is called free, however much later the app's clock is (a copy kept a minute)", () => {
  // Read at 4:59:30 PM for 36 hours: its Booked marks stop at 4:59:30 AM on the 12th. A 24-hour turf with every
  // hour to then Booked.
  const readAt = ist("2026-11-10 16:59") + 30_000;
  const keys: string[] = [];
  for (let ms = ist("2026-11-10 17:00"); ms < readAt + FREE_WINDOW_HOURS * HOUR; ms += HOUR) keys.push(new Date(ms + 330 * 60_000).toISOString().slice(0, 16));
  assert.equal(keys.at(-1), "2026-11-12T04:00");
  const t = { id: ID(1), slug: "s", name: "Dribble Standin", area: null, city: "bangalore", lat: null, lng: null, updated_at: iso(readAt - HOUR), requests: false, booked: keys, hours: { is_24x7: true } };
  const a = parseFreeAnswer({ now: iso(readAt), turfs: [t] }, FREE_WINDOW_HOURS)!;
  assert.equal(a.rows[0].bookedUntil, readAt + FREE_WINDOW_HOURS * HOUR);
  // 10 s later: nothing free. 45 s later the window reaches 5 AM on the 12th, which the read has no mark for: still nothing.
  for (const later of [10_000, 45_000, 59_000]) {
    assert.equal(freeCardOf(a.rows[0], readAt + later, readAt + later + FREE_WINDOW_HOURS * HOUR), null, `${later / 1000} s later`);
    assert.equal(freeCards(a.rows, readAt + later).size, 0, `${later / 1000} s later`);
  }
  // Without the horizon (a read that knew every mark), 5 AM would be the one free hour: the clip is what stops it.
  assert.deepEqual(freeCardOf({ ...a.rows[0], bookedUntil: Infinity }, readAt + 45_000, readAt + 45_000 + FREE_WINDOW_HOURS * HOUR)?.days, [{ date: "2026-11-12", keys: ["2026-11-12T05:00"] }]);
  // The window asked of the database, held to 1 to 192 hours as it holds p_hours.
  assert.equal(parseFreeAnswer({ now: iso(readAt), turfs: [t] }, 192)!.rows[0].bookedUntil, readAt + 192 * HOUR);
  assert.equal(parseFreeAnswer({ now: iso(readAt), turfs: [t] }, 900)!.rows[0].bookedUntil, readAt + 192 * HOUR);
  assert.equal(parseFreeAnswer({ now: iso(readAt), turfs: [t] })!.rows[0].bookedUntil, readAt + 36 * HOUR, "the lists' 36 hours by default");
});

test("a page with a number: the turf page's own rule (Call or WhatsApp)", () => {
  assert.equal(pageHasNumber({ owner_phone: "+91 98000 00001" }), true);
  assert.equal(pageHasNumber({ landline_phone: "0253 235 0977" }), true, "a landline: Call");
  assert.equal(pageHasNumber({ whatsapp_phone: "9000000101" }), true, "WhatsApp alone");
  assert.equal(pageHasNumber({ contact_info: '{"phone":"9000000101"}' }), true, "contact_info as text");
  assert.equal(pageHasNumber({ owner_phone: "12345" }), false, "junk");
  assert.equal(pageHasNumber({}), false);
});
