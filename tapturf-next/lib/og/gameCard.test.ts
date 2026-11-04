import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GAME_CARD_PADDING,
  GAME_CARD_SHAPES,
  cardSpots,
  cardTitleSize,
  gameCardAlt,
  gameCardFacts,
  gameCardPath,
  gameCardVersion,
  gameShareImages,
  isGameCardShape,
  isGameId,
  ogText,
  type CardGame,
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

test("the card says sport, venue, place, the stored India day and time, and spots", () => {
  const f = gameCardFacts(turfGame, NOW);
  assert.deepEqual(f, {
    sport: "Box Cricket",
    pill: "BOX CRICKET GAME",
    title: "Kings Arena",
    place: "Baner, Pune",
    when: "Sat 7 Nov \u00b7 7\u00a0\u2013 9\u00a0PM",
    spots: { text: "4 spots left", kind: "open" },
  });
  const t = gameCardFacts(typedGame, NOW);
  assert.deepEqual([t.sport, t.title, t.place], ["Football", "Shivaji Maidan", "Baner, Pune"], "a typed venue reads like a turf");
  // Late at night UTC is already the next day in India; the card reads the stored date, never "Today".
  assert.equal(gameCardFacts(turfGame, Date.UTC(2026, 10, 6, 20, 0)).when.startsWith("Sat 7 Nov"), true);
  assert.equal(gameCardFacts({ ...turfGame, date: "2027-01-02" }, NOW).when.startsWith("Sat 2 Jan 2027"), true, "another year says it");
});

test("spots: left, one, full, closed once played, cancelled; never urgency", () => {
  assert.deepEqual(cardSpots({ ...turfGame, current_players: 11 }, NOW), { text: "1 spot left", kind: "open" });
  assert.deepEqual(cardSpots({ ...turfGame, current_players: 12 }, NOW), { text: "Full", kind: "full" });
  assert.deepEqual(cardSpots({ ...turfGame, current_players: 14 }, NOW), { text: "Full", kind: "full" });
  assert.deepEqual(cardSpots({ ...turfGame, status: "full", current_players: 9 }, NOW), { text: "Full", kind: "full" });
  assert.deepEqual(cardSpots({ ...turfGame, date: "2026-11-03" }, NOW), { text: "Joining closed", kind: "closed" });
  assert.deepEqual(cardSpots({ ...turfGame, status: "cancelled" }, NOW), { text: "Cancelled", kind: "cancelled" });
  for (const g of [turfGame, typedGame, { ...turfGame, current_players: 12 }]) {
    const f = gameCardFacts(g, NOW);
    for (const line of [f.sport, f.pill, f.title, f.place ?? "", f.when, f.spots.text, gameCardAlt(g, NOW)]) assert.equal(bannedCopy(line), null, line);
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
  assert.deepEqual([bare.title, bare.pill], ["Game", "GAME"], "never \"Game game\"");
  const long = gameCardFacts({ ...typedGame, venue_name: "Pimpri Chinchwad Municipal Corporation Ground ⚽ behind the Old Railway Station" }, NOW);
  assert.equal(long.title, "Pimpri Chinchwad Municipal Corporation Ground behind the Old…", "cut after a whole word, the emoji left out");
  const oneWord = gameCardFacts({ ...typedGame, venue_name: "X".repeat(80) }, NOW);
  assert.equal(oneWord.title, `${"X".repeat(63)}…`, "no space to cut at: cut at the limit");
  for (const g of [turfGame, typedGame, { ...typedGame, venue_name: "Ground ⚽ 👍" }, { ...typedGame, venue_name: "Āzād ₹ Maidān" }]) {
    const f = gameCardFacts(g, NOW);
    for (const line of [f.sport, f.pill, f.title, f.place ?? "", f.when, f.spots.text]) assert.match(line, DRAWABLE, line);
  }
});

test("the sport pill is uppercased before it is drawn, so every capital in it is one the font has", () => {
  // Uppercasing in the renderer (textTransform) came after ogText: "µ" and "ÿ" are in the font, their
  // capitals (Greek "Μ", "Ÿ") are not, and next/og fetched them from Google Fonts while drawing.
  assert.equal(gameCardFacts({ ...typedGame, sport: "Taµball" }, NOW).pill, "GAME", "a capital the font lacks: just GAME");
  assert.equal(gameCardFacts({ ...typedGame, sport: "Kaÿoga" }, NOW).pill, "KAYOGA GAME", "Ÿ: its base letter");
  assert.equal(gameCardFacts({ ...typedGame, sport: "Straße" }, NOW).pill, "STRASSE GAME");
  assert.equal(gameCardFacts({ ...typedGame, sport: "Pétanque" }, NOW).pill, "PÉTANQUE GAME");
  assert.equal(gameCardFacts({ ...typedGame, sport: "कबड्डी" }, NOW).pill, "GAME");
  // Every character the font has, inside a sport's name and leading it: the pill is drawable as it stands.
  for (let c = 0x20; c <= 0x2215; c++) {
    const ch = String.fromCodePoint(c);
    if (!DRAWABLE.test(ch)) continue;
    for (const sport of [`Ta${ch}ball`, `${ch}ball`]) {
      const f = gameCardFacts({ ...typedGame, sport }, NOW);
      assert.match(f.pill, DRAWABLE, `U+${c.toString(16)}: ${f.pill}`);
      assert.match(f.sport, DRAWABLE, `U+${c.toString(16)}: ${f.sport}`);
    }
  }
});

test("a long word gets a smaller title so it stays on the card; ordinary names keep their size", () => {
  const shapes = ["og", "4x3", "1x1"] as const;
  assert.deepEqual(shapes.map((s) => cardTitleSize("Kings Arena", s)), [96, 106, 117], "short names: the sizes as before");
  assert.deepEqual(shapes.map((s) => cardTitleSize("Pimpri Chinchwad Municipal Corporation Ground behind the Old…", s)), [54, 59, 66]);
  // Widths in em measured from the bundled Noto Sans (its hmtx): each word fits its line at its size.
  // (A word of only its widest letters, "WWWW…", can still be too wide: it wraps inside itself, wordBreak.)
  const em: Record<string, number> = { PlayArenaSportsHub: 9.725, MAHALAXMISPORTSARENA: 12.799, Supercalifragilistic: 8.601 };
  for (const shape of shapes) {
    const line = GAME_CARD_SHAPES[shape].width - 2 * GAME_CARD_PADDING[shape][1];
    for (const [word, w] of Object.entries(em)) {
      const size = cardTitleSize(word, shape);
      assert.ok(w * size <= line, `${shape} ${word}: ${size}px is ${Math.round(w * size)}px, the line ${line}px`);
      assert.ok(cardTitleSize(`${word} Turf`, shape) <= size, "the longest word sets it, wherever it is");
    }
    // No size fits 63 letters on a line: the smallest size, and the card wraps the word (wordBreak).
    assert.equal(cardTitleSize(`${"X".repeat(63)}…`, shape), { og: 54, "4x3": 59, "1x1": 66 }[shape]);
  }
  assert.equal(cardTitleSize("Kings-Arena-Sports-Complex", "og"), cardTitleSize("Kings Arena Sports Complex", "og"), "a line can break after a hyphen");
});

test("the version changes with what the card says, and only then", () => {
  const v = gameCardVersion(gameCardFacts(turfGame, NOW));
  assert.match(v, /^[0-9a-z]{1,7}$/);
  assert.equal(gameCardVersion(gameCardFacts({ ...turfGame, price_per_player: 999 } as CardGame, NOW)), v, "price is not drawn");
  assert.equal(gameCardVersion(gameCardFacts(turfGame, NOW + 3600_000)), v, "an hour later, the same card");
  for (const g of [
    { ...turfGame, current_players: 9 },
    { ...turfGame, current_players: 12 },
    { ...turfGame, start_time: "20:00:00" },
    { ...turfGame, date: "2026-11-08" },
    { ...turfGame, status: "cancelled" as const },
    { ...turfGame, turfs: { ...turfGame.turfs!, name: "Kings Arena 2" } },
    typedGame,
  ]) {
    assert.notEqual(gameCardVersion(gameCardFacts(g, NOW)), v, JSON.stringify(g));
  }
  assert.notEqual(gameCardVersion(gameCardFacts(turfGame, Date.UTC(2026, 10, 7, 14, 1))), v, "played: closed");
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
