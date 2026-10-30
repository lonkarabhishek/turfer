import { test } from "node:test";
import assert from "node:assert/strict";
import { AskFilters, AskFiltersV10, EXTRA_KEYS, keywordExtras, NO_EXTRAS, ROUTER_VERSION, readingSchema, systemPrompt, turfExtrasAsked } from "./ask";
import { loggedShownIds, routerChoice, routerVersion, EVAL_HEADER } from "./routerVersion";
import { decodeWeek, encodeWeek, isOpenAt, istNow, normalOpenAt, onDay, openAtAny, openAtSlots, openAtWords, parseClock, weekOf } from "./openAt";
import { askTurfFacts, hoursCopyFrom, reportsCopyFrom, type HourRow } from "./askFacts";

// Router v10 (off by default): the switch, the reading's schema and prompt,
// and the data its new filters read. The filters themselves are in
// relax.test.ts, the keyword path in quick.test.ts.

test("v10 is on only by ASK_ROUTER_VERSION=10, or by x-ask-eval equal to ASK_EVAL_KEY", () => {
  assert.equal(EVAL_HEADER, "x-ask-eval");
  assert.equal(routerVersion({}, null), 9);
  assert.equal(routerVersion({ ASK_ROUTER_VERSION: "9" }, null), 9);
  assert.equal(routerVersion({ ASK_ROUTER_VERSION: "10" }, null), 10);
  assert.equal(routerVersion({ ASK_ROUTER_VERSION: " 10\n" }, null), 10);
  assert.equal(routerVersion({ ASK_ROUTER_VERSION: "11" }, null), 9);
  const key = "eval-6f1c2a9e";
  assert.equal(routerVersion({ ASK_EVAL_KEY: key }, key), 10);
  assert.equal(routerVersion({ ASK_EVAL_KEY: key }, `${key}x`), 9);
  assert.equal(routerVersion({ ASK_EVAL_KEY: key }, "e"), 9, "a shorter header is compared without throwing (both are hashed first)");
  assert.equal(routerVersion({ ASK_EVAL_KEY: key }, null), 9);
  assert.equal(routerVersion({ ASK_EVAL_KEY: key }, ""), 9);
  // No key, or an empty one: the header does nothing, whatever it says.
  assert.equal(routerVersion({}, key), 9);
  assert.equal(routerVersion({ ASK_EVAL_KEY: "" }, ""), 9);
  assert.equal(routerVersion({ ASK_EVAL_KEY: "  " }, "  "), 9);
  assert.equal(routerVersion({ ASK_EVAL_KEY: "" }, "anything"), 9);
});

test("an eval ask is only one whose x-ask-eval is the key, and its log row shows no turf to the owners' count", () => {
  const key = "eval-6f1c2a9e";
  assert.deepEqual(routerChoice({ ASK_EVAL_KEY: key }, key), { version: 10, eval: true });
  assert.deepEqual(routerChoice({ ASK_EVAL_KEY: key, ASK_ROUTER_VERSION: "10" }, key), { version: 10, eval: true }, "v10 for everyone: still an eval ask");
  assert.deepEqual(routerChoice({ ASK_ROUTER_VERSION: "10" }, null), { version: 10, eval: false }, "v10 for everyone: real traffic");
  assert.deepEqual(routerChoice({ ASK_ROUTER_VERSION: "10" }, key), { version: 10, eval: false }, "no key set: the header is nothing");
  assert.deepEqual(routerChoice({ ASK_EVAL_KEY: key }, "wrong"), { version: 9, eval: false });
  assert.deepEqual(routerChoice({}, null), { version: 9, eval: false });
  // owner_dashboard counts shown_ids for myTapturf's "Shown in Ask TapTurf": an eval ask logs none.
  const shown = ["turf-a", "turf-b"];
  assert.deepEqual(loggedShownIds(shown, routerChoice({ ASK_EVAL_KEY: key }, key)), []);
  assert.deepEqual(loggedShownIds(shown, routerChoice({ ASK_EVAL_KEY: key }, null)), shown);
  assert.deepEqual(loggedShownIds(shown, routerChoice({ ASK_ROUTER_VERSION: "10" }, null)), shown);
  assert.notEqual(loggedShownIds(shown, { eval: false }), shown, "a copy, never the caller's array");
});

const V9_FIELDS = [
  "intent", "tool", "city", "sport", "areas", "turf_names", "question", "max_price_per_hour", "min_rating", "time", "when", "skill",
  "open_24x7", "wants_nearby", "players", "needs", "sort", "free_text", "summary", "reply", "followups",
];

test("v9's reading is as it was; v10's adds its fields before summary, reply and follow-ups", () => {
  assert.equal(ROUTER_VERSION, 9);
  assert.deepEqual(Object.keys(AskFilters.shape), V9_FIELDS);
  assert.equal(readingSchema(9), AskFilters);
  const v10 = Object.keys(AskFiltersV10.shape);
  assert.deepEqual(v10, [...V9_FIELDS.slice(0, -3), ...EXTRA_KEYS, "summary", "reply", "followups"]);
  assert.deepEqual(Object.keys(NO_EXTRAS), [...EXTRA_KEYS]);
  // A v9 reading in the cache is no v10 reading (parseCache asks again), and a v10 one still reads as v9's.
  const v9Reading = { ...Object.fromEntries(V9_FIELDS.map((k) => [k, null])), intent: "find_turf", areas: [], turf_names: [], needs: [], followups: [], open_24x7: false, wants_nearby: false, sort: "rating", summary: "s", reply: "r" };
  assert.ok(AskFilters.safeParse(v9Reading).success);
  assert.ok(!AskFiltersV10.safeParse(v9Reading).success);
  assert.ok(AskFiltersV10.safeParse({ ...v9Reading, ...NO_EXTRAS }).success);
  assert.deepEqual(turfExtrasAsked({ ...(v9Reading as unknown as AskFilters), claimed: true, open_at: "now", free_to_join: true }), ["claimed", "open_at"]);
});

test("v9's prompt has none of v10's words; v10's is v9's with them added, and says what claimed and verified mean", () => {
  const areas = { pune: ["Baner", "Kothrud"], nashik: ["College Road"] };
  const v9 = systemPrompt(areas);
  assert.equal(systemPrompt(areas, 9), v9);
  for (const w of ["claimed", "owner_prices", "with_photos", "player_reviews", "open_at", "free_to_join", "turf_booked", "TapTurf verified", "blue tick"]) assert.ok(!v9.includes(w), `v9 says ${w}`);
  const v10 = systemPrompt(areas, 10);
  let at = 0;
  for (const line of v9.split("\n")) {
    const i = v10.indexOf(line, at);
    assert.ok(i >= 0, `v10 lost v9's line: ${line.slice(0, 60)}`);
    at = i + line.length;
  }
  for (const k of EXTRA_KEYS) assert.match(v10, new RegExp(`^- ${k}: `, "m"), `v10 has no rule for ${k}`);
  assert.match(v10, /"verified", "TapTurf verified", "claimed", "owner managed"/);
  assert.match(v10, /never that the venue is better, and nothing is booked through TapTurf: players call or WhatsApp the turf/);
  assert.match(v10, /blue tick next to a person's name is something else/);
  assert.match(v10, /Never say how many venues or games match/);
  // A weekday is open_at's own; the venue filters are for find_turf, and a game search asking one hears so.
  assert.match(v10, /"open at 5am on Sunday" is "sun 05:00"/);
  assert.match(v10, /^- claimed, owner_prices, with_photos, player_reviews and open_at filter venues, for find_turf only/m);
  assert.match(v10, /rating the best stars from TapTurf players first/);
});

test("clock times as players and the model write them", () => {
  assert.equal(parseClock("06:00"), 360);
  assert.equal(parseClock("6am"), 360);
  assert.equal(parseClock("6 AM"), 360);
  assert.equal(parseClock("6:30 pm"), 1110);
  assert.equal(parseClock("9.30pm"), 1290);
  assert.equal(parseClock("12 am"), 0);
  assert.equal(parseClock("12 pm"), 720);
  assert.equal(parseClock("18:30"), 1110);
  assert.equal(parseClock("6"), null, "a bare hour is no time");
  assert.equal(parseClock("13 pm"), null);
  assert.equal(parseClock("25:00"), null);
  assert.equal(normalOpenAt("6am"), "06:00");
  assert.equal(normalOpenAt(" NOW "), "now");
  assert.equal(normalOpenAt("tonight"), null);
  assert.equal(openAtWords("now"), "open now");
  assert.equal(openAtWords("06:00"), "open at 6:00 AM");
  assert.equal(openAtWords("21:30", "tomorrow"), "open at 9:30 PM tomorrow");
  assert.equal(openAtWords(null), null);
  // A weekday named goes first: that day's hours ("open at 5am on Sunday").
  assert.equal(normalOpenAt("sun 05:00"), "sun 05:00");
  assert.equal(normalOpenAt("Sunday 5am"), "sun 05:00");
  assert.equal(normalOpenAt("tues 6:30 pm"), "tue 18:30");
  assert.equal(normalOpenAt("Thursday 21:00"), "thu 21:00");
  assert.equal(normalOpenAt("funday 5am"), null, "no weekday: no time we read");
  assert.equal(normalOpenAt("sun 5"), null);
  assert.equal(openAtWords("sun 05:00"), "open at 5:00 AM on Sunday");
  assert.equal(openAtWords("sat 21:30", "weekend"), "open at 9:30 PM on Saturday", "the day named, not when's");
  assert.equal(onDay("05:00", 6), "sun 05:00");
  assert.equal(onDay("05:00", null), "05:00");
  assert.equal(onDay("now", 6), "now", "now is now, whatever day is named");
  assert.equal(onDay(null, 6), null);
});

test("a turf's week from its page's hours: per day, past midnight, closed, 24 hours, unknown", () => {
  // Lower-case day keys, as 3,289 turfs store them (26 Oct).
  const w = weekOf({ opening_hours: { monday: "6 AM–2 AM", tuesday: "Closed", sunday: "Open 24 hours", friday: "Mon–Fri: 5 AM–11 PM" } as never, start_time: null, end_time: null })!;
  assert.deepEqual(w[0], [[360, 1560]]);
  assert.deepEqual(w[1], []);
  assert.equal(w[2], null);
  assert.equal(w[4], null, "a whole-week line under one day claims no hours");
  assert.deepEqual(w[6], [[0, 1440]]);
  assert.deepEqual(decodeWeek(encodeWeek(w)), w);
  // Sunday 1 AM: its whole day. Monday 1 AM: Sunday's day ended at midnight and Monday opens at 6.
  // Tuesday 1:30 AM: Monday's 6 AM–2 AM runs into it.
  assert.equal(isOpenAt(w, 6, 60), true);
  assert.equal(isOpenAt(w, 0, 60), false);
  assert.equal(isOpenAt(w, 1, 90), true);
  assert.equal(isOpenAt(w, 1, 120), false, "closes at 2 AM");
  assert.equal(isOpenAt(w, 1, 600), false, "closed on Tuesday");
  assert.equal(isOpenAt(w, 3, 600), null, "Thursday isn't listed, nor Wednesday");
  // The row's own start and end when there are no per-day hours, but not the 00:00 to 23:59 default.
  assert.deepEqual(weekOf({ opening_hours: null, start_time: "05:00:00", end_time: "23:30:00" })![3], [[300, 1410]]);
  assert.equal(weekOf({ opening_hours: null, start_time: "00:00:00", end_time: "23:59:00" }), null);
  assert.deepEqual(weekOf({ opening_hours: null, start_time: null, end_time: null, is_24x7: true })![5], [[0, 1440]]);
  assert.equal(openAtAny(null, [{ day: 0, minute: 60 }]), false, "no hours: never open for sure");
  assert.equal(openAtAny(null, [{ day: 0, minute: 60 }], true), true, "open all day by its row");
});

test("open now is India's time; a time asked is on the day asked", () => {
  // 30 Oct 2026 01:00 UTC is Friday 6:30 AM in India.
  const now = new Date("2026-10-30T01:00:00Z");
  assert.deepEqual(istNow(now), { day: 4, minute: 390 });
  assert.deepEqual(openAtSlots("now", "tomorrow", now), [{ day: 4, minute: 390 }]);
  assert.deepEqual(openAtSlots("06:00", null, now), [{ day: 4, minute: 360 }]);
  assert.deepEqual(openAtSlots("06:00", "tomorrow", now), [{ day: 5, minute: 360 }]);
  assert.deepEqual(openAtSlots("06:00", "weekend", now), [{ day: 5, minute: 360 }, { day: 6, minute: 360 }]);
  assert.equal(openAtSlots("06:00", "this_week", now)!.length, 7);
  assert.equal(openAtSlots("soon", null, now), null);
  assert.equal(openAtSlots(null, null, now), null);
  // A weekday named: that day only, never either day of the weekend.
  assert.deepEqual(openAtSlots("sun 05:00", "weekend", now), [{ day: 6, minute: 300 }]);
  assert.deepEqual(openAtSlots("mon 19:00", null, now), [{ day: 0, minute: 1140 }]);
  assert.equal(openAtSlots("someday 05:00", null, now), null);
});

test("the cached data keeps ids, weeks and counts only, each week once, each report once", () => {
  const row = (id: string, over: Partial<HourRow> = {}): HourRow => ({ id, opening_hours: { daily: "6 AM–10 PM" }, start_time: null, end_time: null, is_24x7: null, price_owner_confirmed: null, ...over });
  const copy = hoursCopyFrom([row("a"), row("b"), row("c", { opening_hours: null, is_24x7: true, price_owner_confirmed: true }), row("d", { opening_hours: null })]);
  assert.equal(copy.weeks.length, 2);
  assert.equal(copy.turfs.a, copy.turfs.b);
  assert.ok(!("d" in copy.turfs), "no hours: no week");
  assert.deepEqual(copy.owner, ["c"]);
  assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(copy))).sort(), ["owner", "turfs", "weeks"]);
  const reports = reportsCopyFrom([
    { id: "r1", turf_id: "a", rating: 5 },
    { id: "r2", turf_id: "a", rating: 4 },
    { id: "r2", turf_id: "a", rating: 4 },
    { id: "r3", turf_id: "b", rating: null },
    { id: "r4", turf_id: null, rating: 5 },
    { id: "r5", turf_id: "c", rating: 9 },
  ]);
  assert.deepEqual(reports, { a: { n: 2, sum: 9, rated: 2 }, b: { n: 1, sum: 0, rated: 0 }, c: { n: 1, sum: 0, rated: 0 } });
  const facts = askTurfFacts(copy, reports);
  assert.deepEqual(facts.hours!.get("a")![0], [[360, 1320]]);
  assert.deepEqual(facts.hours!.get("c")![0], [[0, 1440]]);
  assert.ok(facts.ownerPrices!.has("c") && !facts.ownerPrices!.has("a"));
  assert.equal(facts.reports!.get("a"), 2);
  assert.equal(facts.reports!.get("b"), 1);
  // The players' stars: the average of the rated reports; a report with no stars (or none we read) counts, but rates nothing.
  assert.equal(facts.stars!.get("a"), 4.5);
  assert.ok(!facts.stars!.has("b") && !facts.stars!.has("c"));
  assert.equal(askTurfFacts(copy, reports).hours, facts.hours, "built once per copy");
  // A part whose read failed is null, never an empty set that would say "none".
  assert.deepEqual(askTurfFacts(null, null), { hours: null, ownerPrices: null, reports: null, stars: null });
  assert.equal(askTurfFacts(copy, null).reports, null);
  assert.equal(askTurfFacts(copy, null).stars, null);
});

test("v10's keyword reading, when the model is unavailable", () => {
  assert.equal(keywordExtras("show me verified turfs in Pune", "find_turf").claimed, true);
  assert.equal(keywordExtras("turfs run by the owner", "find_turf").claimed, true);
  assert.equal(keywordExtras("turfs with photos", "find_turf").with_photos, true);
  assert.equal(keywordExtras("turfs reviewed by players", "find_turf").player_reviews, true);
  assert.equal(keywordExtras("most reviewed turfs", "find_turf").player_reviews, false);
  assert.equal(keywordExtras("turfs with owner prices", "find_turf").owner_prices, true);
  assert.equal(keywordExtras("turf open now", "find_turf").open_at, "now");
  assert.equal(keywordExtras("turf open at 6am", "find_turf").open_at, "06:00");
  assert.equal(keywordExtras("turf open at 9:30 pm", "find_turf").open_at, "21:30");
  assert.equal(keywordExtras("which turfs are open at 5am on sunday in pune", "find_turf").open_at, "sun 05:00");
  assert.equal(keywordExtras("turf open at 7 pm on Wednesday", "find_turf").open_at, "wed 19:00");
  assert.equal(keywordExtras("turf open at 6am on saturday or sunday", "find_turf").open_at, "06:00", "two days: the weekend's either");
  assert.equal(keywordExtras("free football games", "find_game").free_to_join, true);
  assert.equal(keywordExtras("games where the turf is booked", "find_game").turf_booked, true);
  // Turf words are no game's, game words no turf's; free parking is no free game.
  assert.deepEqual(keywordExtras("free parking turf near me", "find_turf"), NO_EXTRAS);
  assert.equal(keywordExtras("verified games", "find_game").claimed, false);
  assert.deepEqual(keywordExtras("box cricket in kothrud", "find_turf"), NO_EXTRAS);
});
