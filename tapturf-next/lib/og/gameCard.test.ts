import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_DESIGN,
  GAME_CARD_SHAPES,
  cardArt,
  cardDayParts,
  cardSpots,
  fitSize,
  gameCardAlt,
  gameCardFacts,
  gameCardPath,
  gameCardVersion,
  gameShareImages,
  isGameCardShape,
  isGameId,
  ogText,
  textEm,
  type CardGame,
  type GameCardFacts,
} from "./gameCard";
import { bannedCopy } from "../seo/defaults";

// 4 Nov 2026, 12:00 in India.
const NOW = Date.UTC(2026, 10, 4, 6, 30);
const ID = "dddddddd-dddd-4ddd-8ddd-000000000002";

const turfGame: CardGame = {
  sport: "box cricket",
  date: "2026-11-07",
  start_time: "19:00:00",
  end_time: "21:00:00",
  current_players: 8,
  max_players: 12,
  status: "open",
  price_per_player: 150,
  skill_level: "all",
  turf_booked: true,
  host_name: "Asha Kulkarni",
  turfs: { id: "t1", name: "Kings Arena", address: "Survey 12, Baner, Pune", area: "Baner", city: "pune" },
};
const typedGame: CardGame = {
  ...turfGame,
  sport: "Football",
  turfs: undefined,
  venue_name: "Shivaji Maidan",
  venue_address: "Behind Ganesh Temple, Baner Road",
  venue_area: "Baner",
  venue_city: "pune",
};

/** Every character the bundled Noto Sans (Latin) has, and nothing else. */
const DRAWABLE = /^[ -~\u00a0-\u00ac\u00ae-\u00ff\u0131\u0152\u0153\u02bb\u02bc\u02c6\u02da\u02dc\u2002\u2009\u200b\u2013\u2014\u2018-\u201a\u201c-\u201e\u2022\u2026\u2032\u2033\u2039\u203a\u2044\u2074\u20ac\u2122\u2212\u2215]*$/u;

/** Every line of words a card draws from these facts. */
const lines = (f: GameCardFacts): string[] =>
  [f.sport, f.label, f.title, f.place, f.day, f.time, f.spots.text, f.spots.count, f.spots.note, f.price, f.skill, f.booked, f.host].filter((x): x is string => !!x);

test("the card says sport, venue, place, the stored India day and time, spots, and the page's public facts", () => {
  const f = gameCardFacts(turfGame, NOW);
  assert.deepEqual(f, {
    sport: "Box Cricket",
    label: "BOX CRICKET",
    art: "cricket",
    title: "Kings Arena",
    place: "Baner, Pune",
    day: "Sat 7 Nov",
    time: "7\u00a0\u2013 9\u00a0PM",
    spots: { text: "4 spots left", kind: "open", in: 8, max: 12, count: "8 of 12 in", note: null },
    price: "150",
    skill: "All levels",
    booked: "Turf booked",
    host: "Asha",
  });
  const t = gameCardFacts(typedGame, NOW);
  assert.deepEqual([t.sport, t.title, t.place, t.booked], ["Football", "Shivaji Maidan", "Baner, Pune", "Venue booked"], "a typed venue reads like a turf");
  // Late at night UTC is already the next day in India; the card reads the stored date, never "Today".
  assert.equal(gameCardFacts(turfGame, Date.UTC(2026, 10, 6, 20, 0)).day, "Sat 7 Nov");
  assert.equal(gameCardFacts({ ...turfGame, date: "2027-01-02" }, NOW).day, "Sat 2 Jan 2027", "another year says it");
  assert.deepEqual(cardDayParts("Sat 7 Nov"), { weekday: "SAT", dom: "7", month: "NOV" });
  assert.deepEqual(cardDayParts("Sat 2 Jan 2027"), { weekday: "SAT", dom: "2", month: "JAN 2027" });
  assert.equal(cardDayParts("2026-11-07"), null, "a date it does not know stays a line of text");
});

test("price, level, booked and host: what the game page says in public, or nothing", () => {
  const facts = (g: Partial<CardGame>) => gameCardFacts({ ...turfGame, ...g }, NOW);
  assert.equal(facts({ price_per_player: 0 }).price, "Free");
  assert.equal(facts({ price_per_player: "100.00" as unknown as number }).price, "100", "the database's numeric comes as text");
  assert.equal(facts({ price_per_player: 1200 }).price, "1,200");
  assert.equal(facts({ price_per_player: 99.5 }).price, "99.5");
  assert.equal(facts({ price_per_player: undefined }).price, null, "no price on the row: not said, never \"Free\"");
  assert.equal(facts({ price_per_player: -5 }).price, null);
  assert.deepEqual(
    (["all", "beginner", "intermediate", "advanced"] as const).map((skill_level) => facts({ skill_level }).skill),
    ["All levels", "Beginners", "Intermediate", "Advanced"],
  );
  assert.equal(facts({ skill_level: undefined }).skill, null);
  assert.equal(facts({ turf_booked: false }).booked, null, "not booked is not said");
  assert.equal(facts({ turf_booked: undefined }).booked, null);
  // The host's first name alone; nobody else is ever named (the row's confirmed names are not read).
  assert.equal(facts({ host_name: "  roshan  patil " }).host, "roshan");
  for (const host_name of ["Player", "", undefined, "आशा कुलकर्णी", "Sudarshanprasadrao K"]) assert.equal(facts({ host_name }).host, null, String(host_name));
  const withFriends = { ...turfGame, confirmed_names: ["Rahul", "Meera"], confirmed_extra: 2 } as CardGame;
  assert.deepEqual(gameCardFacts(withFriends, NOW), gameCardFacts(turfGame, NOW));
  assert.ok(!JSON.stringify(gameCardFacts(withFriends, NOW)).includes("Rahul"));
});

test("each sport gets its own pitch or court; any other gets plain turf", () => {
  const art = (sports: string[]) => sports.map(cardArt);
  assert.deepEqual(art(["Football", "5v5 football", "Futsal"]), ["football", "football", "football"]);
  assert.deepEqual(art(["Cricket", "box cricket", "Cricket Nets"]), ["cricket", "cricket", "cricket"]);
  assert.deepEqual(art(["Badminton", "Pickleball", "Volleyball", "Basketball"]), ["badminton", "pickleball", "volleyball", "basketball"]);
  assert.deepEqual(art(["Tennis", "Lawn Tennis", "Padel"]), ["tennis", "tennis", "tennis"]);
  assert.deepEqual(art(["Table Tennis", "Ultimate Frisbee", "Swimming", "कबड्डी", ""]), ["turf", "turf", "turf", "turf", "turf"]);
});

test("spots: who is in, what is left, full, closed once played, cancelled; never urgency", () => {
  const spots = (g: Partial<CardGame>) => cardSpots({ ...turfGame, ...g }, NOW);
  assert.deepEqual(spots({ current_players: 11 }), { text: "1 spot left", kind: "open", in: 11, max: 12, count: "11 of 12 in", note: "Almost full" });
  assert.deepEqual(spots({ current_players: 12 }), { text: "Full", kind: "full", in: 12, max: 12, count: "12 of 12 in", note: null });
  assert.deepEqual(spots({ current_players: 14 }), { text: "Full", kind: "full", in: 12, max: 12, count: "12 of 12 in", note: null }, "never more in than the game holds");
  assert.deepEqual(spots({ status: "full", current_players: 9 }), { text: "Full", kind: "full", in: 9, max: 12, count: "9 of 12 in", note: null });
  assert.deepEqual(spots({ date: "2026-11-03" }), { text: "Joining closed", kind: "closed", in: 8, max: 12, count: "8 of 12 joined", note: null });
  assert.deepEqual(spots({ status: "cancelled" }), { text: "Cancelled", kind: "cancelled", in: 8, max: 12, count: null, note: null });
  // "Almost full" only with 1 or 2 spots left, and only when they are a quarter of the game or less.
  const note = (current_players: number, max_players: number) => spots({ current_players, max_players }).note;
  assert.deepEqual([note(10, 12), note(9, 12), note(12, 14), note(11, 14)], ["Almost full", null, "Almost full", null]);
  assert.deepEqual([note(1, 2), note(2, 4), note(3, 4), note(4, 6), note(5, 6)], [null, null, "Almost full", null, "Almost full"], "half a small game left is not almost full");
  for (const g of [turfGame, typedGame, { ...turfGame, current_players: 12 }, { ...turfGame, current_players: 11 }, { ...turfGame, status: "cancelled" as const }]) {
    const f = gameCardFacts(g, NOW);
    // "Turf booked" is the game page's own fact about the host's slot (lib/utils/game.ts turfInfo), not a claim that TapTurf books.
    for (const line of [...lines(f).filter((l) => l !== f.booked), gameCardAlt(g, NOW)]) assert.equal(bannedCopy(line), null, line);
    assert.doesNotMatch(lines(f).join(" "), /hurry|selling|fast|last chance|only \d/i);
  }
});

test("ogText keeps only what the bundled font draws: marks dropped to base letters, emoji and symbols left out", () => {
  assert.deepEqual(ogText("  Kings   Arena ⚽ "), { text: "Kings Arena", lost: false });
  assert.deepEqual(ogText("Āzād Maidān"), { text: "Azad Maidan", lost: false });
  assert.deepEqual(ogText("Café Turf – “Night”"), { text: "Café Turf – “Night”", lost: false });
  assert.deepEqual(ogText("₹150 · 7 PM"), { text: "150 · 7 PM", lost: false });
  assert.equal(ogText("शिवाजी मैदान").lost, true);
  assert.equal(ogText("Shivaji मैदान").lost, true);
  assert.equal(ogText("Ground \u{1f44d}\u{1f3fd}\u200d").text, "Ground");
});

test("a name the font cannot draw whole is left off, never drawn in part", () => {
  const dev = gameCardFacts({ ...typedGame, venue_name: "शिवाजी मैदान" }, NOW);
  assert.deepEqual([dev.title, dev.place], ["Baner, Pune", null], "its place leads instead");
  const none = gameCardFacts({ ...typedGame, venue_name: "शिवाजी मैदान", venue_area: null, venue_city: "वाई" }, NOW);
  assert.deepEqual([none.title, none.place], ["Football game", null]);
  assert.equal(gameCardFacts({ ...typedGame, sport: "कबड्डी" }, NOW).sport, "Game");
  const bare = gameCardFacts({ ...typedGame, sport: "कबड्डी", venue_name: "शिवाजी मैदान", venue_area: null, venue_city: "वाई" }, NOW);
  assert.deepEqual([bare.title, bare.label], ["Game", "GAME"], "never \"Game game\"");
  const long = gameCardFacts({ ...typedGame, venue_name: "Pimpri Chinchwad Municipal Corporation Ground ⚽ behind the Old Railway Station" }, NOW);
  assert.equal(long.title, "Pimpri Chinchwad Municipal Corporation Ground behind the Old…", "cut after a whole word, the emoji left out");
  const oneWord = gameCardFacts({ ...typedGame, venue_name: "X".repeat(80) }, NOW);
  assert.equal(oneWord.title, `${"X".repeat(63)}…`, "no space to cut at: cut at the limit");
  for (const g of [turfGame, typedGame, { ...typedGame, venue_name: "Ground ⚽ 👍" }, { ...typedGame, venue_name: "Āzād ₹ Maidān", host_name: "Zoë ⚽ D'Souza", price_per_player: 1200 }]) {
    const f = gameCardFacts(g, NOW);
    for (const line of lines(f)) assert.match(line, DRAWABLE, line);
  }
});

test("the sport label is uppercased before it is drawn, so every capital in it is one the font has", () => {
  // Uppercasing in the renderer (textTransform) came after ogText: "µ" and "ÿ" are in the font, their
  // capitals (Greek "Μ", "Ÿ") are not, and next/og fetched them from Google Fonts while drawing.
  assert.equal(gameCardFacts({ ...typedGame, sport: "Taµball" }, NOW).label, "GAME", "a capital the font lacks: just GAME");
  assert.equal(gameCardFacts({ ...typedGame, sport: "Kaÿoga" }, NOW).label, "KAYOGA", "Ÿ: its base letter");
  assert.equal(gameCardFacts({ ...typedGame, sport: "Straße" }, NOW).label, "STRASSE");
  assert.equal(gameCardFacts({ ...typedGame, sport: "Pétanque" }, NOW).label, "PÉTANQUE");
  assert.equal(gameCardFacts({ ...typedGame, sport: "कबड्डी" }, NOW).label, "GAME");
  // Every character the font has, inside a sport's name and leading it: the label is drawable as it stands.
  for (let c = 0x20; c <= 0x2215; c++) {
    const ch = String.fromCodePoint(c);
    if (!DRAWABLE.test(ch)) continue;
    for (const sport of [`Ta${ch}ball`, `${ch}ball`]) {
      const f = gameCardFacts({ ...typedGame, sport }, NOW);
      assert.match(f.label, DRAWABLE, `U+${c.toString(16)}: ${f.label}`);
      assert.match(f.sport, DRAWABLE, `U+${c.toString(16)}: ${f.sport}`);
    }
  }
});

test("a text gets the size that fits its box: a long word shrinks it, ordinary names keep theirs", () => {
  // Widths in em measured from the bundled Noto Sans (its hmtx).
  const em: Record<string, number> = { PlayArenaSportsHub: 9.725, MAHALAXMISPORTSARENA: 12.799, Supercalifragilistic: 8.601, "7\u00a0\u2013 9\u00a0PM": 3.936 };
  for (const [word, w] of Object.entries(em)) assert.ok(Math.abs(textEm(word) - w) < 0.002, `${word}: ${textEm(word)}`);
  assert.equal(textEm("Aa", 0.05).toFixed(3), "1.300", "tracking is per character");
  const box = { width: 760, max: 96, min: 40 };
  assert.equal(fitSize("Kings Arena", box), 96, "a short name: the full size");
  for (const [word, w] of Object.entries(em)) {
    const size = fitSize(word, box);
    assert.ok(w * size <= box.width, `${word}: ${size}px is ${Math.round(w * size)}px, the box ${box.width}px`);
    assert.ok(fitSize(`${word} Turf`, { ...box, lines: 2 }) <= size, "the longest word sets it, wherever it is");
  }
  // One line: the whole text fits. Two lines: it may be bigger, but never so big that a word is wider than the box.
  const long = "Kridadham Premium Multisport Club";
  const one = fitSize(long, box);
  assert.ok(textEm(long) * one <= box.width && one < 96 && one >= 40);
  const two = fitSize(long, { ...box, lines: 2 });
  assert.ok(two > one && textEm("Multisport") * two <= box.width);
  // No size fits 63 letters on a line: the smallest size, and the card wraps and clamps the word.
  assert.equal(fitSize(`${"X".repeat(63)}…`, box), 40);
  assert.equal(fitSize("Kings-Arena-Sports-Complex", { ...box, lines: 2 }), fitSize("Kings Arena Sports Complex", { ...box, lines: 2 }), "a line can break after a hyphen");
});

test("the version changes with what the card says or how it looks, and only then", () => {
  const f = gameCardFacts(turfGame, NOW);
  const v = gameCardVersion(f);
  assert.match(v, /^[0-9a-z]{1,7}$/);
  assert.equal(gameCardVersion(gameCardFacts(turfGame, NOW + 3600_000)), v, "an hour later, the same card");
  assert.equal(gameCardVersion(gameCardFacts({ ...turfGame, description: "Bring whites", confirmed_names: ["Rahul"] } as CardGame, NOW)), v, "what is not drawn does not change it");
  for (const g of [
    { ...turfGame, current_players: 9 },
    { ...turfGame, current_players: 12 },
    { ...turfGame, max_players: 14 },
    { ...turfGame, start_time: "20:00:00" },
    { ...turfGame, date: "2026-11-08" },
    { ...turfGame, status: "cancelled" as const },
    { ...turfGame, turfs: { ...turfGame.turfs!, name: "Kings Arena 2" } },
    { ...turfGame, price_per_player: 200 },
    { ...turfGame, price_per_player: 0 },
    { ...turfGame, skill_level: "advanced" as const },
    { ...turfGame, turf_booked: false },
    { ...turfGame, host_name: "Rahul Jadhav" },
    typedGame,
  ]) {
    assert.notEqual(gameCardVersion(gameCardFacts(g, NOW)), v, JSON.stringify(g));
  }
  assert.notEqual(gameCardVersion(gameCardFacts(turfGame, Date.UTC(2026, 10, 7, 14, 1))), v, "played: closed");
  // Each design has its own URLs, so switching CARD_DESIGN makes every share preview fetch the new picture.
  assert.equal(gameCardVersion(f, CARD_DESIGN), v);
  assert.equal(new Set((["a", "b", "c"] as const).map((d) => gameCardVersion(f, d))).size, 3);
  // The card before this one (template 1, a hash of sport, title, place, "day · time" and spots) is at none of them.
  assert.notEqual(v, "1acr8lc");
});

test("URLs: absolute www, one per shape, at the current version; og is 1200x630", () => {
  const imgs = gameShareImages(ID, turfGame, NOW);
  const v = gameCardVersion(gameCardFacts(turfGame, NOW));
  assert.deepEqual(imgs.jsonLd, [
    `https://www.tapturf.in/api/og/game/${ID}?v=${v}`,
    `https://www.tapturf.in/api/og/game/${ID}/4x3?v=${v}`,
    `https://www.tapturf.in/api/og/game/${ID}/1x1?v=${v}`,
  ]);
  assert.deepEqual(imgs.og, {
    url: imgs.jsonLd[0],
    width: 1200,
    height: 630,
    alt: "Box Cricket at Kings Arena, Baner, Pune, Sat 7 Nov, 7 – 9 PM. 4 spots left.",
    type: "image/png",
  });
  assert.deepEqual(GAME_CARD_SHAPES["4x3"], { width: 1200, height: 900 });
  assert.deepEqual(GAME_CARD_SHAPES["1x1"], { width: 1200, height: 1200 });
  assert.equal(gameCardPath(ID, "1x1", "abc"), `/api/og/game/${ID}/1x1?v=abc`);
  assert.ok(isGameCardShape("4x3") && isGameCardShape("og") && !isGameCardShape("constructor") && !isGameCardShape("16x9"));
  assert.ok(isGameId(ID) && !isGameId("../etc") && !isGameId(`${ID}x`));
});
