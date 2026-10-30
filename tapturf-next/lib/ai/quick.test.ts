import { test } from "node:test";
import assert from "node:assert/strict";
import { quickAnswer, type QuickContext } from "./quick";
import { askChips } from "../ask/chips";
import { AskFiltersV10, EXTRA_KEYS, NO_EXTRAS, type AskFilters, type AskReading } from "./ask";
import type { Turf } from "../../types/turf";

// Areas and venue names as areasFromTurfs() and the turfs table give them (October 2026).
const areas: Record<string, string[]> = {
  gurgaon: ["Gurgaon", "Gurugram", "Sector 24"],
  hyderabad: ["Gachibowli", "Kondapur", "Madhapur", "Nagole"],
  mumbai: ["Andheri West", "Powai", "Thane"],
  nagpur: ["Gandhi Nagar", "Pardi", "Wanadongri"],
  nashik: ["College Road", "Gangapur Road", "Nashik Road", "Pathardi Phata"],
  pune: ["Baner", "Hinjewadi", "Kothrud", "Nanded", "Viman Nagar", "Wakad"],
  surat: ["Gandhi Nagar", "Vesu"],
  thiruvananthapuram: ["Kazhakkoottam", "Nemom"],
};
const rows: [string, string, number][] = [
  ["Hindu Gymkhana Ground", "nashik", 500],
  ["Vedant Sports Academy", "nashik", 80],
  ["Champions Zone Box Cricket", "hyderabad", 900],
  ["Hotfut Kharadi", "pune", 300],
  ["Kanade Sports Club", "pune", 120],
  ["Pune Football Club", "pune", 40],
  ["Mumbai Football Arena", "mumbai", 60],
];
const turfs = rows.map(([name, city, total_reviews], i) => ({ id: `t${i}`, name, city, total_reviews, area: null, address: "", sports: [] }) as unknown as Turf);
const data = { areas, turfs };
const ask = (q: string, ctx: QuickContext = {}) => quickAnswer(q, data, ctx);

/** Every answer must be a complete AskFilters in the house voice. */
function wellFormed(q: string, f: AskFilters) {
  for (const s of [f.reply, f.summary, ...f.followups]) {
    assert.ok(s && s.trim() === s, `${q}: empty or padded text`);
    assert.ok(!/[–—]/.test(s), `${q}: dash in "${s}"`);
    assert.ok(!/!!|\bI'm an AI\b/.test(s), `${q}: voice in "${s}"`);
  }
  assert.ok(f.summary.split(" ").length <= 12, `${q}: summary too long`);
  assert.ok(f.followups.length <= 3);
  assert.ok(f.followups.every((x) => x.split(" ").length <= 6), `${q}: long follow-up`);
  assert.ok(!f.followups.some((x) => x.toLowerCase() === q.toLowerCase()), `${q}: follow-up repeats the question`);
  for (const k of ["intent", "tool", "city", "sport", "areas", "turf_names", "question", "max_price_per_hour", "min_rating", "time", "when", "skill", "open_24x7", "wants_nearby", "players", "needs", "sort", "free_text"] as const) {
    assert.ok(k in f, `${q}: missing ${k}`);
  }
}

function hit(q: string, ctx: QuickContext = {}): AskFilters {
  const f = ask(q, ctx);
  assert.ok(f, `expected a ready answer for "${q}"`);
  wellFormed(q, f);
  return f;
}

test("every chip we generate has a ready answer, for several cities", () => {
  const cities = [
    { label: "Pune", area: "Kothrud", boxCricket: true, pair: ["Hotfut Kharadi", "Kanade Sports Club"] as [string, string] },
    { label: "Hyderabad", area: "Gachibowli", boxCricket: true, pair: null },
    { label: "Nashik", area: null, boxCricket: false, pair: ["Hindu Gymkhana", "Vedant Sports Academy"] as [string, string] },
    { label: "Bengaluru", area: null, boxCricket: true, pair: null },
    // Curated on 26 Oct: its chips used to cost a Claude call each.
    { label: "Thiruvananthapuram", area: "Kazhakkoottam", boxCricket: true, pair: null },
  ];
  for (const c of cities) {
    for (const games of [0, 4]) {
      for (const chip of askChips(c, games)) hit(chip, { prefCity: c.label.toLowerCase() });
    }
  }
  for (const games of [0, 4]) for (const chip of askChips(null, games)) hit(chip);
});

test("city chips read as Claude read them", () => {
  let f = hit("Box cricket in Pune tonight");
  assert.deepEqual([f.intent, f.sport, f.city, f.time, f.when, f.sort], ["find_turf", "box-cricket", "pune", "evening", "today", "rating"]);
  assert.equal(f.reply, "Here are box cricket turfs in Pune for tonight, lit grounds first.");

  f = hit("Kothrud me sasta turf");
  assert.deepEqual([f.intent, f.city, f.areas, f.max_price_per_hour, f.sort], ["find_turf", "pune", ["Kothrud"], 800, "price_low"]);
  assert.equal(f.reply, "Kothrud me saste turf ye rahe, sabse kam daam wale pehle.");
  assert.equal(f.summary, "Cheap turfs in Kothrud under ₹800 an hour.");

  f = hit("Cheapest turf in Hyderabad");
  assert.deepEqual([f.city, f.max_price_per_hour, f.sort], ["hyderabad", null, "price_low"]);
  assert.equal(f.reply, "Here are turfs in Hyderabad, cheapest first.");

  f = hit("Open games in Nashik this weekend");
  assert.deepEqual([f.intent, f.city, f.when, f.sport], ["find_game", "nashik", "weekend", null]);
  assert.equal(f.reply, "Here are open games in Nashik this weekend, soonest first.");

  f = hit("Football turf in Pune with floodlights");
  assert.deepEqual([f.sport, f.city, f.needs], ["football", "pune", ["floodlights"]]);
  assert.equal(f.reply, "Here are football turfs with floodlights in Pune, best rated first.");

  f = hit("Hotfut Kharadi vs Kanade Sports Club", { prefCity: "pune" });
  assert.deepEqual([f.intent, f.turf_names, f.city], ["compare", ["Hotfut Kharadi", "Kanade Sports Club"], "pune"]);

  f = hit("Compare two turfs");
  assert.deepEqual([f.intent, f.turf_names], ["compare", []]);

  f = hit("Calculate our NRR");
  assert.deepEqual([f.intent, f.tool], ["tool", "cricket-nrr-calculator"]);

  f = hit("Host a game Saturday 7pm");
  assert.equal(f.intent, "create_game");
  assert.equal(f.summary, "Host a game Saturday 7pm");
});

test("cities curated on 26 Oct get a ready answer, by their old names too", () => {
  for (const [q, city] of [
    ["Box cricket in Trivandrum", "thiruvananthapuram"],
    ["box cricket in Thiruvananthapuram", "thiruvananthapuram"],
    ["Turfs in Vizag", "visakhapatnam"],
    ["turfs in Visakhapatnam", "visakhapatnam"],
    ["Football Calicut", "kozhikode"],
    ["Trichy turf", "tiruchirappalli"],
    ["Allahabad", "prayagraj"],
    ["turfs in Prayagraj", "prayagraj"],
    ["Gulbarga", "kalaburagi"],
    ["Shimoga", "shivamogga"],
    ["Banaras", "varanasi"],
    ["Box cricket in Kazhakkoottam", "thiruvananthapuram"],
  ]) {
    assert.equal(hit(q).city, city, q);
  }
  // The name as typed stays in the reply.
  assert.equal(hit("Box cricket in Trivandrum").summary, "Box cricket turfs in Trivandrum.");
  // Hanamkonda is part of Warangal, not all of it: Claude decides.
  assert.equal(ask("Turf in Hanamkonda"), null);
});

test("generic chips and the most asked questions", () => {
  let f = hit("Box cricket near me tonight");
  assert.deepEqual([f.sport, f.wants_nearby, f.sort, f.time, f.when, f.city], ["box-cricket", true, "nearby", "evening", "today", null]);
  assert.equal(f.reply, "Here are box cricket turfs close to you for tonight, nearest first.");

  f = hit("Cheapest football turf near me", { city: "pune" });
  assert.deepEqual([f.sport, f.wants_nearby, f.sort, f.max_price_per_hour, f.city], ["football", true, "price_low", null, "pune"]);

  f = hit("Football games near me this weekend");
  assert.deepEqual([f.intent, f.sport, f.wants_nearby, f.when, f.sort], ["find_game", "football", true, "weekend", "nearby"]);
  assert.equal(f.summary, "Football games near you this weekend.");

  f = hit("Open games this weekend");
  assert.deepEqual([f.intent, f.city, f.when], ["find_game", null, "weekend"]);

  f = hit("Box cricket in Kothrud under ₹1,000");
  assert.deepEqual([f.areas, f.city, f.max_price_per_hour, f.sort], [["Kothrud"], "pune", 1000, "price_low"]);
  assert.equal(f.summary, "Box cricket turfs in Kothrud under ₹1,000 an hour.");

  f = hit("24 hour cricket turf in Hyderabad");
  assert.deepEqual([f.sport, f.open_24x7, f.city], ["box-cricket", true, "hyderabad"]);

  f = hit("Which Nashik turf is open 24 hours?");
  assert.deepEqual([f.city, f.open_24x7, f.sport], ["nashik", true, null]);

  // Nets are the practice-nets page, not every cricket ground.
  f = hit("Cricket nets nearby");
  assert.deepEqual([f.sport, f.wants_nearby], ["cricket-nets", true]);
  assert.equal(f.reply, "Here are cricket practice nets close to you, nearest first.");
  f = hit("net practice in Pune");
  assert.deepEqual([f.sport, f.city], ["cricket-nets", "pune"]);
  f = hit("cricket ground in Pune");
  assert.deepEqual([f.sport, f.city], ["cricket", "pune"]);

  // "Me" is Hinglish filler, but not in these English phrases.
  for (const q of ["football turf near to me", "nearby me football turf", "football turf near by me", "football turf nearest to me"]) {
    f = hit(q);
    assert.deepEqual([f.sport, f.wants_nearby, f.sort], ["football", true, "nearby"], q);
    assert.equal(f.reply, "Here are football turfs close to you, nearest first.", q);
  }

  f = hit("TURFS IN PUNE");
  assert.equal(f.city, "pune");
  f = hit("Turf in Nagole");
  assert.deepEqual([f.areas, f.city], [["Nagole"], "hyderabad"]);
  assert.equal(f.reply, "Here are turfs in Nagole, best rated first.");
  f = hit("Gandhi Nagar turfs in Nagpur");
  assert.deepEqual([f.areas, f.city], [["Gandhi Nagar"], "nagpur"]);
  f = hit("football turfs in bengaluru");
  assert.equal(f.city, "bangalore");
  assert.match(f.reply, /in Bengaluru/);

  f = hit("Hindu Gymkhana vs Vedant Sports Academy");
  assert.deepEqual([f.intent, f.turf_names, f.city], ["compare", ["Hindu Gymkhana", "Vedant Sports Academy"], "nashik"]);
  assert.equal(f.reply, "Let me put those two side by side.");

  // An area named after its own city is the city; "book me" is English.
  f = hit("Turfs in Gurgaon");
  assert.deepEqual([f.city, f.areas], ["gurgaon", []]);
  f = hit("Book me a football turf in Pune");
  assert.equal(f.reply, "Here are football turfs in Pune, best rated first.");

  for (const q of ["hi", "Hello there", "hey how are you", "thanks", "ok"]) assert.equal(hit(q).intent, "other");
  assert.equal(hit("Host a game").intent, "create_game");
  assert.equal(hit("host a game on Saturday at 7:30 pm").intent, "create_game");
  assert.equal(hit("Divide players into teams").tool, "cricket-team-generator");
  assert.equal(hit("Toss").tool, "cricket-toss");
});

test("live scoring asks open the ball by ball scorer", () => {
  for (const q of ["live score", "Ball by ball scorer", "score our match", "Scoring app", "box cricket score counter", "live scoring"]) {
    const f = hit(q);
    assert.deepEqual([f.intent, f.tool], ["tool", "cricket-live-scorer"], q);
    assert.match(f.reply, /live scorer/);
  }
  // A finished match still goes to the result card, and "score" alone is not a ready answer.
  assert.equal(hit("make a scorecard").tool, "cricket-scorecard-maker");
  assert.equal(ask("live score of india match"), null);
  // Its follow-ups point at the other tools, never back at itself.
  assert.ok(!hit("live score").followups.includes("Score our match live"));
});

test("other sports open the live scoreboard, and the two scorers point at each other", () => {
  for (const q of ["football score", "Badminton score counter", "keep score of our game", "Basketball scoreboard", "table tennis score", "Keep score of any sport"]) {
    const f = hit(q);
    assert.deepEqual([f.intent, f.tool], ["tool", "live-scoreboard"], q);
    assert.match(f.reply, /live scoreboard/);
    assert.ok(!f.followups.includes("Keep score of any sport"), q);
  }
  // No sport named stays with the cricket scorer, which offers the scoreboard first.
  for (const q of ["live score", "score counter", "scoring app"]) assert.equal(hit(q).tool, "cricket-live-scorer", q);
  assert.equal(hit("live score").followups[0], "Keep score of any sport");
  assert.equal(hit("scorecard").tool, "cricket-scorecard-maker");
});

test("Hinglish variants answer in Hinglish", () => {
  let f = hit("kothrud me sasta box cricket hai kya");
  assert.deepEqual([f.sport, f.areas, f.max_price_per_hour], ["box-cricket", ["Kothrud"], 800]);
  assert.equal(f.reply, "Kothrud me saste box cricket turf ye rahe, sabse kam daam wale pehle.");

  f = hit("mein nagpur mein hoon thoda sasta box cricket dikhoa");
  assert.deepEqual([f.city, f.sport, f.max_price_per_hour, f.sort], ["nagpur", "box-cricket", 800, "price_low"]);
  assert.equal(f.reply, "Nagpur me saste box cricket turf ye rahe, sabse kam daam wale pehle.");

  f = hit("aaj raat football khelna hai");
  assert.deepEqual([f.sport, f.when, f.time], ["football", "today", "evening"]);
  assert.equal(f.reply, "Aaj raat ke liye football turf ye rahe, sabse achhi rating wale pehle.");

  f = hit("Baner me sabse sasta turf");
  assert.deepEqual([f.areas, f.max_price_per_hour, f.sort], [["Baner"], null, "price_low"]);

  f = hit("mere paas box cricket");
  assert.deepEqual([f.wants_nearby, f.sort], [true, "nearby"]);
  assert.equal(f.reply, "Aapke paas box cricket turf ye rahe, sabse paas wale pehle.");

  assert.equal(hit("toss karo yaar").tool, "cricket-toss");
  assert.equal(hit("team banao").tool, "cricket-team-generator");
});

test("the page's city fills in when none is typed, and a turf page changes the greeting", () => {
  assert.equal(hit("Box cricket tonight", { city: "nashik" }).city, "nashik");
  assert.equal(hit("Box cricket in Pune tonight", { city: "nashik" }).city, "pune");
  assert.equal(hit("Box cricket in Kothrud", { city: "pune" }).city, "pune");
  // An area we only list in another city: Claude sees the page and decides.
  assert.equal(ask("Box cricket in Kothrud", { city: "nashik" }), null);
  assert.equal(ask("Turf in Nagole", { city: "pune" }), null);
  assert.match(hit("hi", { turf: "Hindu Gymkhana Ground" }).reply, /this turf/);
  assert.doesNotMatch(hit("hi", { turf: "Hindu Gymkhana Ground" }).reply, /Hindu/);
});

test("on a turf page, what players say about it is a question about that turf", () => {
  const page = { turf: "Hindu Gymkhana Ground", city: "nashik" as const };
  for (const q of ["What do players say about it?", "reviews?", "Is it any good", "what do people think of this turf"]) {
    const f = hit(q, page);
    assert.equal(f.intent, "question", q);
    // No name: the route takes the page's venue by its row.
    assert.deepEqual(f.turf_names, [], q);
    assert.equal(f.question, q, q);
    assert.equal(f.city, "nashik", q);
  }
  // Off a turf page, or about another venue, or a search: as before.
  assert.notEqual(ask("What do players say about it?")?.intent, "question");
  assert.equal(ask("What do players say about Vedant Sports Academy", page), null);
  assert.notEqual(ask("best rated turfs in Nashik", page)?.intent, "question");
});

test("anything not fully understood goes to Claude", () => {
  for (const q of [
    "Cheaper ones",
    "Compare the top two",
    "Does CC Turf Pardi have parking?",
    "what is the capital of France",
    "In nashik bro not pune",
    "cheap box cricket in kothrud tonight for 12 people",
    "Pune vs Mumbai",
    "football vs cricket",
    "Thane turfs",
    "Gandhi Nagar turfs",
    "Gandhi Nagar turfs in Pune",
    "box cricket or football in pune",
    "cricket in pune",
    "host a game at Hindu Gymkhana, 10 players, 150 each",
    "how do we calculate NRR for our tri series",
    "कोथरुड में टर्फ",
    "Box cricket near Wai",
    "turfs",
    "under 400",
    "Hindu Gymkhana",
    "Kothrud near me",
    "Box cricket in Kothrud and Baner",
    "box cricket under 50",
    "football in pune and mumbai",
    "kothrud me parking wala turf hai kya",
    "beginner box cricket turf in pune",
    "football games in Kothrud",
    "Hindu Gymkhana vs Hindu Gymkhana",
    "Hindu Gymkhana vs Unknown Arena Xyz",
    "I'm an AI",
    "Nanded turfs",
    "Gurugram box cricket",
    "box in pune",
    "navi mumbai box cricket",
    "turfs in secunderabad",
    "football turfs in new delhi",
    "football turf near",
  ]) {
    assert.equal(ask(q), null, `"${q}" should go to Claude`);
  }
});

test("a venue named after its area stays a venue, and a compare can name a venue in another city", () => {
  const venuesData = {
    areas: { bangalore: ["Begur"], mumbai: ["Marol"], pune: ["Kothrud", "Mundhwa"] },
    turfs: [
      ["Begur Turf", "bangalore", "Begur"],
      ["Dribble Den", "bangalore", "Begur"],
      ["Mundhwa Turf Ground", "pune", "Mundhwa"],
      ["Kanade Sports Club", "pune", "Undri"],
      ["Prime Turf", "mumbai", "Marol"],
    ].map(([name, city, area], i) => ({ id: `v${i}`, name, city, area, address: "", total_reviews: 10, sports: [] }) as unknown as Turf),
  };
  const read = (q: string, ctx: QuickContext = {}) => {
    const f = quickAnswer(q, venuesData, ctx);
    assert.ok(f, `expected a ready answer for "${q}"`);
    wellFormed(q, f);
    return f;
  };
  // Asked from Pune: Begur is in Bangalore, and Begur Turf is the venue, not just the area's best rated.
  let f = read("Begur Turf", { prefCity: "pune" });
  assert.deepEqual([f.intent, f.city, f.areas, f.free_text], ["find_turf", "bangalore", ["Begur"], "Begur Turf"]);
  assert.equal(f.reply, "Here is Begur Turf in Begur, Bangalore.");
  assert.equal(read("Mundhwa turf", { prefCity: "pune" }).free_text, "Mundhwa turf");
  // No venue called that: the area search, as before.
  f = read("Kothrud turf", { prefCity: "pune" });
  assert.deepEqual([f.areas, f.free_text], [["Kothrud"], null]);
  // The whole name and then its area: Prime Turf in Marol, Mumbai, from Pune.
  f = read("Kanade Sports Club vs Prime Turf Marol", { prefCity: "pune" });
  assert.deepEqual([f.intent, f.turf_names, f.city], ["compare", ["Kanade Sports Club", "Prime Turf Marol"], null]);
});

test("hostile input stays fast", () => {
  const t0 = performance.now();
  for (const q of [`host a game ${"11 ".repeat(48)}x`, `${"box cricket ".repeat(13)}x`, `${"a vs ".repeat(30)}b`, `compare ${"a and ".repeat(25)}b`]) ask(q.slice(0, 160));
  assert.ok(performance.now() - t0 < 200, "matching should take milliseconds");
});

// ── Router v10 (lib/ai/routerVersion.ts): off unless switched on ──────

const ask10 = (q: string, ctx: QuickContext = {}) => quickAnswer(q, data, ctx, 10);

/** A v10 ready answer: well formed as any, and a whole AskFiltersV10. */
function hit10(q: string, ctx: QuickContext = {}): AskReading {
  const f = ask10(q, ctx);
  assert.ok(f, `expected a v10 ready answer for "${q}"`);
  wellFormed(q, f);
  const ok = AskFiltersV10.safeParse(f);
  assert.ok(ok.success, `${q}: not a v10 reading`);
  for (const s of [f.reply, f.summary, ...f.followups]) assert.ok(!/\bbook(?:ed|ing)? (?:on|through|via) tapturf|\bbook (?:it|now|online)\b/i.test(s), `${q}: booking claim in "${s}"`);
  return f;
}

// What players ask that v9's keyword path left to the model (the site owner's "verified or claimed turfs").
const V10_ASKS = [
  "show me verified turfs in Pune",
  "claimed turfs near me",
  "owner managed box cricket in Kothrud",
  "turfs with photos in Hyderabad",
  "which turfs have player reviews",
  "turfs open now in Pune",
  "box cricket open at 6am in Kothrud",
  "football turf open at 9:30 pm tomorrow in Pune",
  "turfs with owner prices in Bengaluru",
  "free football games this weekend",
  "games with spots left tomorrow",
  "turf booked games in Pune",
  "2 spots left football games",
  "what does verified mean",
  "what is the blue tick",
];

test("v10: claimed and TapTurf verified turfs are one filter, in a city, an area or near me", () => {
  let f = hit10("show me verified turfs in Pune");
  assert.deepEqual([f.intent, f.city, f.claimed, f.with_photos, f.player_reviews], ["find_turf", "pune", true, false, false]);
  assert.equal(f.reply, "Here are claimed turfs in Pune, best rated first.");
  assert.ok(f.followups.includes("What does verified mean"));
  f = hit10("claimed turfs near me");
  assert.deepEqual([f.claimed, f.wants_nearby, f.sort, f.city], [true, true, "nearby", null]);
  f = hit10("owner managed box cricket in Kothrud");
  assert.deepEqual([f.claimed, f.sport, f.areas, f.city], [true, "box-cricket", ["Kothrud"], "pune"]);
  // On a city page "claimed turfs" needs no place of its own.
  assert.equal(hit10("claimed turfs", { city: "nashik" }).city, "nashik");
  assert.equal(hit10("verified turfs").claimed, true);
});

test("v10: photos, players' reviews and the owner's prices", () => {
  let f = hit10("turfs with photos in Hyderabad");
  assert.deepEqual([f.with_photos, f.city, f.claimed], [true, "hyderabad", false]);
  assert.equal(f.reply, "Here are turfs with photos in Hyderabad, best rated first.");
  f = hit10("which turfs have player reviews");
  assert.deepEqual([f.player_reviews, f.sort], [true, "reviews"]);
  assert.equal(f.reply, "Here are turfs with player reviews, most player reviews first.");
  f = hit10("football turfs reviewed by players in pune");
  assert.deepEqual([f.player_reviews, f.sport, f.city], [true, "football", "pune"]);
  // Google's "most reviewed" stays Google's.
  f = hit10("most reviewed turfs in pune");
  assert.deepEqual([f.player_reviews, f.sort], [false, "reviews"]);
  f = hit10("turfs with owner prices in Bengaluru");
  assert.deepEqual([f.owner_prices, f.city], [true, "bangalore"]);
});

test("v10: open now and open at a time, on the day asked; 24x7 as before", () => {
  let f = hit10("turfs open now in Pune");
  assert.deepEqual([f.open_at, f.city, f.open_24x7], ["now", "pune", false]);
  assert.equal(f.reply, "Here are turfs open now in Pune, best rated first.");
  f = hit10("box cricket open at 6am in Kothrud");
  assert.deepEqual([f.open_at, f.sport, f.areas], ["06:00", "box-cricket", ["Kothrud"]]);
  f = hit10("football turf open at 9:30 pm tomorrow in Pune");
  assert.deepEqual([f.open_at, f.when], ["21:30", "tomorrow"]);
  assert.match(f.reply, /open at 9:30 PM in Pune for tomorrow/);
  assert.equal(hit10("turfs opens at 18 30 in pune").open_at, "18:30");
  // A bare hour is no time: left to the model.
  assert.equal(ask10("turfs open at 6 in pune"), null);
  f = hit10("24x7 turfs in pune");
  assert.deepEqual([f.open_24x7, f.open_at], [true, null]);
});

test("v10: free games, spots left and the turf booked; skill as before", () => {
  let f = hit10("free football games this weekend");
  assert.deepEqual([f.intent, f.free_to_join, f.sport, f.when], ["find_game", true, "football", "weekend"]);
  assert.equal(f.reply, "Here are free football games this weekend, soonest first.");
  f = hit10("games with spots left tomorrow");
  assert.deepEqual([f.intent, f.players, f.when], ["find_game", 1, "tomorrow"]);
  assert.equal(f.reply, "Here are open games with a spot left tomorrow, soonest first.");
  f = hit10("2 spots left football games");
  assert.deepEqual([f.players, f.sport], [2, "football"]);
  f = hit10("turf booked games in Pune");
  assert.deepEqual([f.turf_booked, f.city], [true, "pune"]);
  assert.equal(f.reply, "Here are open games with the turf booked in Pune, soonest first.");
  f = hit10("beginner badminton games");
  assert.deepEqual([f.skill, f.sport, f.free_to_join, f.players], ["beginner", "badminton", false, null]);
  // Game words without a game, and turf words with one: the model decides.
  assert.equal(ask10("free parking turfs in pune"), null);
  assert.equal(ask10("spots left in pune"), null);
  assert.equal(ask10("claimed football games"), null);
});

test("v10: what the marks mean, in the page's own words", () => {
  const f = hit10("what does verified mean");
  assert.equal(f.intent, "other");
  assert.match(f.reply, /owner runs its TapTurf page/);
  assert.match(f.reply, /isn't a rating/);
  assert.match(f.reply, /call or WhatsApp the turf/);
  assert.equal(hit10("What is a claimed turf?").reply, f.reply);
  assert.match(hit10("what is the blue tick").reply, /phone number and an email/);
});

test("v10 is off by default: v9 reads none of its words, and every question v9 reads is read the same", () => {
  for (const q of V10_ASKS) assert.equal(ask(q), null, `v9 must leave "${q}" to the model, as it did`);
  const cities = [
    { label: "Pune", area: "Kothrud", boxCricket: true, pair: ["Hotfut Kharadi", "Kanade Sports Club"] as [string, string] },
    { label: "Nashik", area: null, boxCricket: false, pair: ["Hindu Gymkhana", "Vedant Sports Academy"] as [string, string] },
    { label: "Hyderabad", area: "Gachibowli", boxCricket: true, pair: null },
  ];
  const asks = [
    ...cities.flatMap((c) => [0, 4].flatMap((g) => askChips(c, g))),
    ...askChips(null, 4),
    "box cricket near me", "cheap football turf in Kothrud", "turfs open late in pune", "turfs open 24 hours in pune", "football turfs with lights in pune",
    "open turfs in pune", "covered badminton courts in Hyderabad", "box cricket under 1000 in Kothrud", "football games this weekend", "beginner games near me",
    "most reviewed turfs in Pune", "best rated turfs in nashik", "hi", "thanks", "toss karo", "Hindu Gymkhana vs Vedant Sports Academy", "host a game saturday 7pm",
    "sasta box cricket kothrud me", "aaj raat football", "turfs with parking and washroom in pune", "turfs at midnight in pune", "turfs open at midnight in pune",
  ];
  let read = 0;
  for (const q of asks) {
    for (const ctx of [{}, { prefCity: "pune" as const }, { city: "nashik" as const }]) {
      const v9 = ask(q, ctx);
      const v10 = ask10(q, ctx);
      if (!v9) continue;
      read++;
      assert.ok(v10, `v10 must still read "${q}"`);
      const rest = Object.fromEntries(Object.entries(v10).filter(([k]) => !(EXTRA_KEYS as readonly string[]).includes(k)));
      assert.deepEqual(rest, v9, `"${q}" read differently under v10`);
      assert.deepEqual(Object.fromEntries(EXTRA_KEYS.map((k) => [k, v10[k]])), NO_EXTRAS, `"${q}" gained a v10 filter`);
    }
  }
  assert.ok(read > 60, `only ${read} readings compared`);
});
