import { test } from "node:test";
import assert from "node:assert/strict";
import { codeRange, dayWords, gameCode, gamePath, gameSlugPath, gameUrl, gameWords, parseGameParam, resolveGameParam, slugWords, timeWords, type GameCandidate } from "./gamePath";

const ID = "4b63fb76-1c2d-4e3f-8a9b-0123456789ab";
const TURF = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const game = (o: Partial<GameCandidate> = {}): GameCandidate => ({
  id: ID,
  sport: "Football",
  date: "2026-11-14",
  start_time: "19:00:00",
  turf_id: TURF,
  turfs: { name: "DN Parande", address: "Dhanori Road, Pune", area: "Dhanori", city: "pune" },
  created_at: "2026-11-01T10:00:00Z",
  ...o,
});
const PATH = "/game/football-dn-parande-dhanori-pune-sat-14-nov-7pm-4b63fb76";

test("the URL: sport, venue, area, city, India day, start time, then the first 8 of the id", () => {
  assert.equal(gamePath(game()), PATH);
  assert.equal(gameUrl(game()), `https://www.tapturf.in${PATH}`);
  assert.equal(gameSlugPath(game()), PATH);
  assert.equal(gameSlugPath(game(), { whole: true }), `/game/football-dn-parande-dhanori-pune-sat-14-nov-7pm-${ID}`);
  assert.equal(gameCode(ID), "4b63fb76");
  assert.equal(gameCode(ID.toUpperCase()), "4b63fb76");
  assert.equal(gameCode("not-an-id"), "");
  assert.deepEqual(codeRange("4b63fb76"), { from: "4b63fb76-0000-0000-0000-000000000000", to: "4b63fb76-ffff-ffff-ffff-ffffffffffff" });
  // Real-looking ones.
  assert.equal(
    gamePath(game({ id: "31f65c2b-86e7-45ac-9e4d-f0b5e95303db", sport: "Box Cricket", date: "2026-11-13", start_time: "20:00:00", turfs: { name: "Kridadham Premium Multisport Club", area: "Rane Nagar", city: "nashik" } })),
    "/game/box-cricket-kridadham-premium-multisport-club-rane-nagar-nashik-fri-13-nov-8pm-31f65c2b",
  );
  assert.equal(
    gamePath(game({ id: "d22e7b85-0ea3-4915-8e85-27b12a9110ce", date: "2026-10-29", start_time: "20:00:00", turfs: { name: "ClayGrounds | Ghaziabad", area: "Biharipur Village", city: "ghaziabad" } })),
    "/game/football-claygrounds-ghaziabad-biharipur-village-thu-29-oct-8pm-d22e7b85",
    "the city is not said twice",
  );
  for (const p of [PATH, gamePath(game({ turfs: { name: "नाशिक टर्फ 🏏", area: "Müller’s Café & Co.", city: "nashik" } }))]) {
    assert.match(p, /^\/game\/[a-z0-9]+(?:-[a-z0-9]+)*$/, p);
  }
});

test("words: accents come off, other scripts and emoji drop out, an empty venue is left out", () => {
  assert.equal(slugWords("Müller’s Café & Co.", 40), "mullers-cafe-and-co");
  assert.equal(slugWords("  ---  ", 40), "");
  assert.equal(slugWords("नाशिक टर्फ", 40), "");
  assert.equal(slugWords("Turf 🏏 No. 1", 40), "turf-no-1");
  assert.equal(slugWords(null, 40), "");
  // A venue in Devanagari only: the URL still names the sport, the place and the time.
  assert.equal(gameWords(game({ turfs: { name: "नाशिक टर्फ", area: "Gangapur Road", city: "nashik" } })), "football-gangapur-road-nashik-sat-14-nov-7pm");
  // A typed venue (not on TapTurf): its own name, area and the host's words for the town.
  assert.equal(
    gamePath(game({ turf_id: null, turfs: null, venue_name: " Shivaji Maidan ", venue_area: "Baner", venue_city: "pune" })),
    "/game/football-shivaji-maidan-baner-pune-sat-14-nov-7pm-4b63fb76",
  );
  assert.equal(gameWords(game({ turf_id: null, turfs: null, venue_name: "School Ground", venue_area: null, venue_city: "Sinnar Town" })), "football-school-ground-sinnar-town-sat-14-nov-7pm");
  // No venue at all (its turf row is gone): the page still has a URL.
  assert.equal(gameSlugPath(game({ turfs: null })), "/game/football-sat-14-nov-7pm-4b63fb76");
  assert.equal(gameSlugPath(game({ turfs: null, sport: "" })), "/game/game-sat-14-nov-7pm-4b63fb76");
  // The area or city a name already says is not repeated; a longer word that only contains it is not that.
  assert.equal(gameWords(game({ turfs: { name: "Turf Up Dhanori", area: "Dhanori", city: "pune" } })), "football-turf-up-dhanori-pune-sat-14-nov-7pm");
  assert.equal(gameWords(game({ turfs: { name: "Punekar Turf", area: null, city: "pune" } })), "football-punekar-turf-pune-sat-14-nov-7pm");
  assert.equal(gameWords(game({ sport: "Cricket", turfs: { name: "Cricket Hub", area: null, city: null, address: "" } })), "cricket-cricket-hub-sat-14-nov-7pm");
});

test("long names are cut between words, and the whole URL stays short", () => {
  assert.equal(slugWords("The Very Long Name Of A Sports Arena And Club", 20), "the-very-long-name");
  assert.equal(slugWords("Supercalifragilisticexpialidocious", 10), "supercalif");
  assert.equal(slugWords("abc def", 3), "abc");
  const long = gamePath(
    game({
      sport: "Box Cricket And Football Fives Mixed",
      turfs: { name: "The Maharaja Shivaji International Multisport Arena And Football Academy Of Pune West", area: "Hinjewadi Phase Three Rajiv Gandhi Infotech Park", city: "pimpri-chinchwad-and-more" },
    }),
  );
  assert.equal(long, "/game/box-cricket-and-the-maharaja-shivaji-international-hinjewadi-phase-pimpri-chinchwad-and-sat-14-nov-7pm-4b63fb76");
  assert.ok(long.length <= "/game/".length + 20 + 36 + 20 + 20 + 10 + 7 + 8 + 6, String(long.length));
  assert.ok(!/--|-$/.test(long));
});

test("the day is the stored India day, the time as people say it, midnight and noon too", () => {
  const tz = process.env.TZ;
  try {
    // Whatever the machine's time zone, the stored day is the day.
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati"]) {
      process.env.TZ = zone;
      assert.equal(dayWords("2026-11-14"), "sat-14-nov", zone);
      assert.equal(dayWords("2026-11-15"), "sun-15-nov", zone);
      assert.equal(dayWords("2027-01-01"), "fri-1-jan", zone);
      assert.equal(gamePath(game({ date: "2026-11-15", start_time: "00:00:00" })), "/game/football-dn-parande-dhanori-pune-sun-15-nov-12am-4b63fb76", zone);
    }
  } finally {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
  assert.equal(dayWords("2028-02-29"), "tue-29-feb");
  assert.equal(dayWords("2026-02-31"), "");
  assert.equal(dayWords("soon"), "");
  assert.equal(dayWords(null), "");
  assert.equal(timeWords("00:00:00"), "12am");
  assert.equal(timeWords("00:30"), "12-30am");
  assert.equal(timeWords("06:00"), "6am");
  assert.equal(timeWords("12:00:00"), "12pm");
  assert.equal(timeWords("12:15"), "12-15pm");
  assert.equal(timeWords("19:00"), "7pm");
  assert.equal(timeWords("19:30:00"), "7-30pm");
  assert.equal(timeWords("23:59"), "11-59pm");
  assert.equal(timeWords("24:00"), "");
  assert.equal(timeWords(""), "");
});

test("a link without the game's facts is the id link, which the page redirects", () => {
  assert.equal(gamePath({ id: ID }), `/game/${ID}`);
  assert.equal(gamePath({ id: ID.toUpperCase() }), `/game/${ID}`);
  // A turf's game whose turf is not here: the venue could not be named as the page names it.
  assert.equal(gamePath(game({ turfs: undefined })), `/game/${ID}`);
  assert.equal(gamePath(game({ turf_id: undefined, turfs: undefined })), `/game/${ID}`);
  assert.equal(gamePath(game({ date: null })), `/game/${ID}`);
  assert.equal(gamePath(game({ start_time: "" })), `/game/${ID}`);
  // Known to have no turf (turf_id null on the row): its words are all there are.
  assert.equal(gamePath(game({ turf_id: null, turfs: null })), "/game/football-sat-14-nov-7pm-4b63fb76");
  assert.equal(gamePath({ id: "x y" }), "/game/x%20y");
});

test("reading a URL: an id, words and a code, words and an id, a bare code", () => {
  assert.deepEqual(parseGameParam(ID), { code: "4b63fb76", id: ID, words: "" });
  assert.deepEqual(parseGameParam(ID.toUpperCase()), { code: "4b63fb76", id: ID, words: "" });
  assert.deepEqual(parseGameParam("football-dn-parande-dhanori-pune-sat-14-nov-7pm-4b63fb76"), { code: "4b63fb76", id: null, words: "football-dn-parande-dhanori-pune-sat-14-nov-7pm" });
  assert.deepEqual(parseGameParam(`football-sat-14-nov-7pm-${ID}`), { code: "4b63fb76", id: ID, words: "football-sat-14-nov-7pm" });
  assert.deepEqual(parseGameParam("4b63fb76"), { code: "4b63fb76", id: null, words: "" });
  assert.deepEqual(parseGameParam("anything-at-all-4b63fb76"), { code: "4b63fb76", id: null, words: "anything-at-all" });
  for (const bad of ["", "create", "football-7pm", "football-4b63fb7", "football-4b63fb7g", "4b63fb76-", "football_4b63fb76", "%E0%A4%A", "a".repeat(250) + "-4b63fb76", "../4b63fb76", "x 4b63fb76"]) {
    assert.equal(parseGameParam(bad), null, bad);
  }
});

test("which game, and where it should be: the id link and old words redirect, the current URL does not", () => {
  const g = game();
  const at = (param: string, list: GameCandidate[] = [g]) => resolveGameParam(param, list);
  // Its URL now: the page, no redirect.
  assert.deepEqual(at(PATH.slice(6)), { game: g, path: PATH, redirect: null });
  // The old id link, capitals, a bare code: 308 to the URL.
  assert.equal(at(ID)?.redirect, PATH);
  assert.equal(at(ID.toUpperCase())?.redirect, PATH);
  assert.equal(at("4b63fb76")?.redirect, PATH);
  assert.equal(at(PATH.slice(6).toUpperCase())?.redirect, PATH);
  // The game was edited (another venue, day and time): the words it had redirect to the words it has.
  const moved = game({ date: "2026-11-15", start_time: "06:30:00", turfs: { name: "Turf Up", area: "Hinjewadi", city: "pune" } });
  const now = "/game/football-turf-up-hinjewadi-pune-sun-15-nov-6-30am-4b63fb76";
  assert.deepEqual(at(PATH.slice(6), [moved]), { game: moved, path: now, redirect: now });
  assert.deepEqual(at(now.slice(6), [moved]), { game: moved, path: now, redirect: null });
  // Words that are not the game's at all still find it by the code.
  assert.equal(at("cricket-somewhere-else-4b63fb76")?.redirect, PATH);
  // No such game, or nothing a game URL could be.
  assert.equal(at(PATH.slice(6), []), null);
  assert.equal(at("football-dn-parande-00000000"), null);
  assert.equal(at("nonsense"), null);
  // A whole id that is not the game with that code.
  assert.equal(at("4b63fb76-0000-4000-8000-000000000000"), null);
  // A row with another code (never from the range read) is not it.
  assert.equal(at("football-aaaaaaaa", [g]), null);
});

test("two games sharing a code: each at its whole-id URL, a short link goes to the game whose words it has", () => {
  const OTHER = "4b63fb76-9999-4999-8999-999999999999";
  const a = game();
  const b = game({ id: OTHER, sport: "Cricket", date: "2026-12-05", start_time: "07:00:00", turfs: { name: "Kings Arena", area: "Baner", city: "pune" }, created_at: "2026-11-20T10:00:00Z" });
  const both = [b, a];
  const pathA = `/game/football-dn-parande-dhanori-pune-sat-14-nov-7pm-${ID}`;
  const pathB = `/game/cricket-kings-arena-baner-pune-sat-5-dec-7am-${OTHER}`;
  // Their own URLs: no redirect.
  assert.deepEqual(resolveGameParam(pathA.slice(6), both), { game: a, path: pathA, redirect: null });
  assert.deepEqual(resolveGameParam(pathB.slice(6), both), { game: b, path: pathB, redirect: null });
  // The old id links: each to its own.
  assert.deepEqual(resolveGameParam(ID, both), { game: a, path: pathA, redirect: pathA });
  assert.deepEqual(resolveGameParam(OTHER, both), { game: b, path: pathB, redirect: pathB });
  // Links made with the short code (a card, a share from before the second game): by the words.
  assert.equal(resolveGameParam(PATH.slice(6), both)?.redirect, pathA);
  assert.equal(resolveGameParam("cricket-kings-arena-baner-pune-sat-5-dec-7am-4b63fb76", both)?.redirect, pathB);
  // B's words from before its time was edited still say more of B than of A.
  assert.equal(resolveGameParam("cricket-kings-arena-baner-pune-sun-6-dec-8am-4b63fb76", both)?.redirect, pathB);
  // Nothing to tell them apart (a bare code): the older game, whose code it was first.
  assert.equal(resolveGameParam("4b63fb76", both)?.redirect, pathA);
  assert.equal(resolveGameParam("4b63fb76", [a, b])?.redirect, pathA);
  // The same words exactly (a game posted twice): the older again, and each still has its whole-id URL.
  const twin = game({ id: OTHER, created_at: "2026-11-20T10:00:00Z" });
  assert.equal(resolveGameParam(PATH.slice(6), [twin, a])?.game, a);
  assert.equal(resolveGameParam(`${PATH.slice(6, -8)}${OTHER}`, [twin, a])?.game, twin);
  // Once the other game is gone, the short URL is the page again.
  assert.deepEqual(resolveGameParam(PATH.slice(6), [a]), { game: a, path: PATH, redirect: null });
  assert.equal(resolveGameParam(pathA.slice(6), [a])?.redirect, PATH);
});
