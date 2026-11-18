import { test } from "node:test";
import assert from "node:assert/strict";
import { ASK_UTM, MESSAGE_MAX, NAME_MAX, askLink, messageName, rangeText, slotAskMessage, whenText, type MessageAsk } from "./message";
import { ASK_COPY } from "./copy";
import { bannedCopy } from "../seo/defaults";
import { utmSource } from "../traffic/traffic";

// The message "Ask for a slot" opens WhatsApp with. Turf names and addresses as production lists them (public pages); no number anywhere.

const TODAY = "2026-11-18"; // a Wednesday
const base: MessageAsk = { turfName: "Kings Turf Arena", pageUrl: "https://www.tapturf.in/turf/kings-turf-arena", date: "2026-11-21", hour: 19, minute: 0, minutes: 60, sport: "football", players: 10, today: TODAY };
const msg = (o: Partial<MessageAsk> = {}) => slotAskMessage({ ...base, ...o });

test("the message: the site owner's example, word for word", () => {
  assert.equal(msg(), "Hi! Is Kings Turf Arena free on Sat 21 Nov, 7 PM to 8 PM for football (about 10 players)? Found you on TapTurf: https://www.tapturf.in/turf/kings-turf-arena?utm_source=whatsapp-ask");
});

test("three turfs as production lists them", () => {
  assert.equal(
    slotAskMessage({ turfName: "Springs", pageUrl: "https://www.tapturf.in/turf/springs-hitec-city", date: TODAY, hour: 21, minute: 0, minutes: 60, sport: "box cricket", players: 12, today: TODAY }),
    "Hi! Is Springs free today (Wed 18 Nov), 9 PM to 10 PM for box cricket (about 12 players)? Found you on TapTurf: https://www.tapturf.in/turf/springs-hitec-city?utm_source=whatsapp-ask",
  );
  assert.equal(
    slotAskMessage({ turfName: "Forza Football", pageUrl: "https://www.tapturf.in/turf/forza-football-pune", date: "2026-11-19", hour: 6, minute: 0, minutes: 90, sport: "football", players: null, today: TODAY }),
    "Hi! Is Forza Football free tomorrow (Thu 19 Nov), 6 AM to 7:30 AM for football? Found you on TapTurf: https://www.tapturf.in/turf/forza-football-pune?utm_source=whatsapp-ask",
  );
  const long = slotAskMessage({
    turfName: "Kshetram Sports Academy: Fitness Club, Football , Cricket, Bowling machine, Turf & Kids Activities",
    pageUrl: "https://www.tapturf.in/turf/kshetram-sports-academy-fitness-club-football-cricket-bowling-machine-turf-kids-",
    date: "2026-11-22", hour: 20, minute: 0, minutes: 120, sport: "cricket nets", players: 8, today: TODAY,
  });
  assert.equal(long, "Hi! Is Kshetram Sports Academy: Fitness Club, Football , Cricket… free on Sun 22 Nov, 8 PM to 10 PM for cricket nets (about 8 players)? Found you on TapTurf: https://www.tapturf.in/turf/kshetram-sports-academy-fitness-club-football-cricket-bowling-machine-turf-kids-?utm_source=whatsapp-ask");
  assert.ok(long.length <= MESSAGE_MAX, `the longest name and address on the site still fit (${long.length})`);
});

test("when: today, tomorrow, a date; a start after midnight names its night", () => {
  const w = (o: Partial<MessageAsk>) => whenText({ ...base, ...o });
  assert.equal(w({ date: TODAY }), "today (Wed 18 Nov), 7 PM to 8 PM");
  assert.equal(w({ date: "2026-11-19" }), "tomorrow (Thu 19 Nov), 7 PM to 8 PM");
  assert.equal(w({ date: "2026-11-24" }), "on Tue 24 Nov, 7 PM to 8 PM");
  assert.equal(w({ date: "2026-11-19", hour: 0, afterMidnight: true }), "on Thu 19 Nov, 12 AM to 1 AM (late Wednesday night)", "tonight's midnight hour is tomorrow's date, said with its night");
  assert.equal(w({ date: "2026-12-01", hour: 1, afterMidnight: true, minutes: 120 }), "on Tue 1 Dec, 1 AM to 3 AM (late Monday night)");
  assert.equal(w({ date: TODAY, hour: 0 }), "today (Wed 18 Nov), 12 AM to 1 AM", "a 24 hour turf's midnight is its own day's");
  // A month and a year turning.
  assert.equal(whenText({ date: "2027-01-01", hour: 18, minute: 0, minutes: 60, today: "2026-12-31" }), "tomorrow (Fri 1 Jan), 6 PM to 7 PM");
});

test("the range: every length offered, half hours, across noon and midnight", () => {
  assert.deepEqual([60, 90, 120, 180].map((m) => rangeText(19, 0, m)), ["7 PM to 8 PM", "7 PM to 8:30 PM", "7 PM to 9 PM", "7 PM to 10 PM"]);
  assert.equal(rangeText(6, 30, 90), "6:30 AM to 8 AM");
  assert.equal(rangeText(11, 0, 60), "11 AM to 12 PM");
  assert.equal(rangeText(23, 0, 120), "11 PM to 1 AM");
  assert.equal(rangeText(0, 0, 60), "12 AM to 1 AM");
});

test("sport and group size are said only when there are any", () => {
  assert.equal(msg({ sport: null, players: null }), "Hi! Is Kings Turf Arena free on Sat 21 Nov, 7 PM to 8 PM? Found you on TapTurf: https://www.tapturf.in/turf/kings-turf-arena?utm_source=whatsapp-ask");
  assert.match(msg({ players: null }), /8 PM for football\? Found/);
  assert.match(msg({ sport: null }), /8 PM \(about 10 players\)\? Found/);
  assert.match(msg({ players: 1 }), /\(1 player\)\?/);
  assert.match(msg({ players: 0 }), /for football\? Found/);
});

test("plain text WhatsApp reads as written: one line, no formatting marks, no emoji", () => {
  assert.equal(messageName("  *Kick_Off*  ~Arena~ `5`\n Turf "), "Kick Off Arena 5 Turf");
  assert.equal(messageName(" \n "), "your turf");
  const m = msg({ turfName: "*Bold* _Turf_\nLine two" });
  assert.ok(!/[*~`\n]/.test(m) && !/_/.test(m.split("Found you on TapTurf:")[0]), m);
  assert.ok(/^[\x20-\x7E…]+$/.test(msg()), "ascii only (and the ellipsis a cut name gets)");
  assert.ok(messageName("x".repeat(200)).length === NAME_MAX && messageName("x".repeat(200)).endsWith("…"));
  assert.equal(messageName("Kings Turf & Sports Arena, Gachibowli - Hyderabad", 28), "Kings Turf & Sports Arena…", "a cut name never ends on a comma or a dash");
});

test("never over 300 characters: the link loses its utm_source first, then the name is cut", () => {
  // The worst a live turf can be: the longest name (98 characters), the longest address (an 80 character slug), the longest sport label (21), a half-hour start after midnight, 30 players.
  const worst = (slug: number) => msg({ pageUrl: `https://www.tapturf.in/turf/${"a".repeat(slug)}`, turfName: "N".repeat(98), date: "2026-11-26", hour: 23, minute: 30, minutes: 180, afterMidnight: true, sport: "s".repeat(21), players: 30 });
  const live = worst(80);
  assert.ok(live.length <= MESSAGE_MAX, String(live.length));
  assert.ok(live.includes("N…") && !live.includes("N".repeat(60)), "the name is cut, to 60 at the most");
  for (let slug = 1; slug <= 110; slug++) assert.ok(worst(slug).length <= MESSAGE_MAX, `a ${slug} character slug: ${worst(slug).length}`);
  // The order: the whole link while it fits, then the plain link, then a shorter name; the link itself is never cut.
  assert.ok(worst(40).endsWith("?utm_source=whatsapp-ask") && worst(40).includes("N".repeat(59)));
  const plain = worst(60);
  assert.ok(plain.endsWith(`/turf/${"a".repeat(60)}`) && !plain.includes("utm_source") && plain.includes("N".repeat(59)), "the plain link, the name as it was");
  const cut = worst(100);
  assert.ok(cut.endsWith(`/turf/${"a".repeat(100)}`) && !cut.includes("N".repeat(40)) && cut.includes("N".repeat(20)), "then the name gives way, down to 20");
  assert.ok(msg().length < 200, "an ordinary turf is far under");
});

test("it asks, and promises nothing: no banned word, nothing about a confirmed slot or money", () => {
  for (const m of [msg(), msg({ date: TODAY }), msg({ sport: null, players: null }), msg({ hour: 0, afterMidnight: true })]) {
    assert.equal(bannedCopy(m.replace(/https:\S+/, "")), null, m);
    assert.doesNotMatch(m, /confirm|reserve|pay|₹|price|guarantee|instant/i);
    assert.match(m, /^Hi! Is .+ free .+\? Found you on TapTurf: https:\/\/www\.tapturf\.in\/turf\/\S+$/);
  }
});

test("the link: the turf's own page, with a utm_source the traffic counter reads as WhatsApp", () => {
  assert.equal(askLink("https://www.tapturf.in/turf/x"), "https://www.tapturf.in/turf/x?utm_source=whatsapp-ask");
  assert.equal(askLink("https://www.tapturf.in/turf/x?a=1"), "https://www.tapturf.in/turf/x?a=1&utm_source=whatsapp-ask");
  assert.equal(utmSource(new URLSearchParams(ASK_UTM).get("utm_source")), "whatsapp");
});

test("the words a player reads on TapTurf: none is banned copy", () => {
  const lines = Object.values(ASK_COPY).map((v) => (typeof v === "function" ? (v as (x: never) => string)(("Monday" as unknown) as never) : v));
  for (const l of [...lines, ASK_COPY.hours(60), ASK_COPY.hours(90), ASK_COPY.hours(120), ASK_COPY.hours(180)]) assert.equal(bannedCopy(String(l)), null, String(l));
  assert.deepEqual([60, 90, 120, 180].map(ASK_COPY.hours), ["1 h", "1.5 h", "2 h", "3 h"]);
  assert.equal(ASK_COPY.entry, "Ask for a slot");
  assert.equal(ASK_COPY.send, "Send on WhatsApp");
  assert.equal(ASK_COPY.justMessage, "Just message them");
  assert.match(ASK_COPY.freeLegend, /marked by the owner/);
  assert.match(ASK_COPY.freeRequest, /marked by the owner/);
});
