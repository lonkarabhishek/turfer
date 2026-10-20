import { test } from "node:test";
import assert from "node:assert/strict";
import { quickAnswer, type QuickContext } from "./quick";
import { askChips } from "../ask/chips";
import type { AskFilters } from "./ask";
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

  f = hit("Cricket nets nearby");
  assert.deepEqual([f.sport, f.wants_nearby], ["cricket", true]);

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

test("hostile input stays fast", () => {
  const t0 = performance.now();
  for (const q of [`host a game ${"11 ".repeat(48)}x`, `${"box cricket ".repeat(13)}x`, `${"a vs ".repeat(30)}b`, `compare ${"a and ".repeat(25)}b`]) ask(q.slice(0, 160));
  assert.ok(performance.now() - t0 < 200, "matching should take milliseconds");
});
