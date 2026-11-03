import { test } from "node:test";
import assert from "node:assert/strict";
import { gameEndsAt, isPlayed, istDay, playedGames, shortDay, weekDays, weekOf, type GameRow, type ReviewRow, type TurfRef } from "./history";
import { streakNudge, streakOf, streakReachedOn, sundayWords } from "./streak";
import { MEDALS, STARTER_MEDALS, bestFirst, lockedShortlist, medalsOf, nextMedal, toGo, type MedalProgress } from "./medals";
import { buildPassport, latestPlayedByTurf, publicPassport } from "./passport";
import { playedHereShort, playedHereText } from "./playedHere";
import { coPlayers, playedWithList, spacedWhatsapp, whatsappLink } from "./playedWith";

// Sunday 1 Nov 2026, 6 PM in India. Its week: Monday 26 Oct to Sunday 1 Nov.
const NOW = Date.parse("2026-11-01T12:30:00Z");
// Thursday 29 Oct 2026, 6 PM in India: the same week, three days to go.
const THURSDAY = Date.parse("2026-10-29T12:30:00Z");
const ME = "me";
let n = 0;
const game = (date: string, o: Partial<GameRow> = {}): GameRow => ({
  id: `g${++n}`,
  creator_id: "host",
  turf_id: "t1",
  sport: "Football",
  date,
  start_time: "19:00:00",
  end_time: "20:00:00",
  status: "completed",
  ...o,
});
const TURFS: TurfRef[] = [
  { id: "t1", slug: "turf-one-wakad", name: "Turf One", city: "pune", cityLabel: "Pune" },
  { id: "t2", slug: "box-arena", name: "Box Arena", city: "pune", cityLabel: "Pune" },
  { id: "t3", slug: null, name: "Lake Turf", city: "nashik", cityLabel: "Nashik" },
  { id: "t4", slug: "city-ground", name: "City Ground", city: "mumbai", cityLabel: "Mumbai" },
];

test("played: over and not cancelled, by India's clock", () => {
  // 1 Nov, 7 to 8 PM India: 13:30 to 14:30 UTC.
  assert.equal(gameEndsAt({ date: "2026-11-01", start_time: "19:00:00", end_time: "20:00:00" }), Date.parse("2026-11-01T14:30:00Z"));
  assert.equal(isPlayed(game("2026-11-01"), NOW), false, "tonight's game is not played yet");
  assert.equal(isPlayed(game("2026-11-01", { start_time: "17:00", end_time: "18:30" }), NOW), false, "a game on now is not played yet");
  assert.equal(isPlayed(game("2026-11-01", { start_time: "16:00", end_time: "17:30" }), NOW), true, "this afternoon's is");
  assert.equal(isPlayed(game("2026-10-31"), NOW), true);
  assert.equal(isPlayed(game("2026-10-31", { status: "cancelled" }), NOW), false, "a cancelled game never counts");
  assert.equal(isPlayed(game("2026-10-31", { status: "open" }), NOW), true, "a stored status of open after the game still counts");
  // Ends past midnight: 31 Oct 11 PM to 1 Nov 1 AM.
  assert.equal(gameEndsAt({ date: "2026-10-31", start_time: "23:00", end_time: "01:00" }), Date.parse("2026-10-31T19:30:00Z"));
  // No end: an hour after the start.
  assert.equal(gameEndsAt({ date: "2026-11-01", start_time: "16:00", end_time: null }), Date.parse("2026-11-01T11:30:00Z"));
  assert.equal(gameEndsAt({ date: "not a date", start_time: "16:00", end_time: null }), null);
  assert.equal(isPlayed(game("bad"), NOW), false);
});

test("played games: the host's own count, each once, oldest first", () => {
  const a = game("2026-10-20", { creator_id: ME });
  const b = game("2026-10-10");
  const c = game("2026-11-05");
  const list = playedGames(ME, [a, b, a, c], NOW);
  assert.deepEqual(list.map((g) => [g.id, g.hosted]), [[b.id, false], [a.id, true]]);
});

test("weeks: Monday to Sunday, India time", () => {
  assert.equal(istDay(Date.parse("2026-10-31T19:00:00Z")), "2026-11-01", "half past midnight in India is already the 1st");
  assert.equal(weekOf("2026-10-26"), weekOf("2026-11-01"), "Monday and Sunday are one week");
  assert.equal(weekOf("2026-11-02"), weekOf("2026-11-01") + 1, "the next Monday starts the next");
  assert.deepEqual(weekDays(weekOf("2026-10-29")), { monday: "2026-10-26", sunday: "2026-11-01" });
});

test("streak: weeks in a row, alive until the Sunday after the last game", () => {
  const thisWeek = [game("2026-10-28"), game("2026-10-21"), game("2026-10-14"), game("2026-09-16"), game("2026-09-09")];
  const s = streakOf(playedGames(ME, thisWeek, NOW), NOW);
  assert.equal(s.current, 3);
  assert.equal(s.best, 3);
  assert.equal(s.thisWeek, true);
  assert.equal(s.weeks.length, 12);
  assert.deepEqual(s.weeks.slice(-3), [true, true, true]);
  assert.equal(s.monday, "2026-10-26");
  assert.equal(s.sunday, "2026-11-01");
  assert.deepEqual(streakNudge(s, 5, NOW), { title: "3-week streak", detail: "You played this week. Play next week to keep it going.", tone: "calm", until: null });

  const lastWeekGames = [game("2026-10-21"), game("2026-10-15"), game("2026-10-06")];
  const lastWeek = streakOf(playedGames(ME, lastWeekGames, THURSDAY), THURSDAY);
  assert.equal(lastWeek.current, 3, "no game this week yet: last week's run is still on");
  assert.equal(lastWeek.thisWeek, false);
  assert.deepEqual(streakNudge(lastWeek, 3, THURSDAY), { title: "3-week streak", detail: "Play this week to keep it.", tone: "hot", until: "Until Sunday, 1 Nov" });
  assert.equal(sundayWords(lastWeek), "Sunday, 1 Nov");
  // On that Sunday itself: the last day, said plainly, and no "Until" under it.
  const sunday = streakOf(playedGames(ME, lastWeekGames, NOW), NOW);
  assert.deepEqual(streakNudge(sunday, 3, NOW), { title: "3-week streak", detail: "Last day: play today to keep your 3-week streak.", tone: "hot", until: null });

  const broken = streakOf(playedGames(ME, [game("2026-10-12"), game("2026-10-05"), game("2026-09-28"), game("2026-09-21")], NOW), NOW);
  assert.equal(broken.current, 0, "a week with no game ends it");
  assert.equal(broken.best, 4);
  assert.deepEqual(streakNudge(broken, 4, NOW), { title: "Best streak: 4 weeks", detail: "Play this week to start a new one.", tone: "calm", until: null });

  const one = streakOf(playedGames(ME, [game("2026-10-21")], THURSDAY), THURSDAY);
  assert.equal(streakNudge(one, 1, THURSDAY)?.detail, "Play this week to make it a 2-week streak.");
  assert.equal(streakNudge(one, 1, THURSDAY)?.until, "Until Sunday, 1 Nov");
  const oneSunday = streakOf(playedGames(ME, [game("2026-10-21")], NOW), NOW);
  assert.equal(streakNudge(oneSunday, 1, NOW)?.detail, "Last day: play today to make it a 2-week streak.");
  assert.equal(streakNudge(streakOf([], NOW), 0, NOW), null, "never played: no nudge");
  // Tonight's game isn't played yet, so it doesn't count this week.
  assert.equal(streakOf(playedGames(ME, [game("2026-11-01")], NOW), NOW).thisWeek, false);
  // The day a run reached 3 weeks: its first game in the third week.
  assert.equal(streakReachedOn(playedGames(ME, [game("2026-10-06"), game("2026-10-15"), game("2026-10-23"), game("2026-10-21")], NOW), 3), "2026-10-21");
  assert.equal(streakReachedOn(playedGames(ME, [game("2026-10-06")], NOW), 3), null);
});

test("medals: earned from real counts, with the day, and what the next one takes", () => {
  const none: MedalProgress = {
    games: { have: 0, days: [] },
    hosted: { have: 0, days: [] },
    turfs: { have: 0, days: [] },
    cities: { have: 0, days: [] },
    sports: { have: 0, days: [] },
    reviews: { have: 0, days: [] },
    streak: { best: 0, current: 0, reachedOn: () => null },
  };
  const empty = medalsOf(none);
  assert.equal(empty.length, MEDALS.length);
  assert.ok(empty.every((m) => !m.earned && m.earnedOn === null && m.need), "nothing is given away");
  const by = (id: string) => empty.find((m) => m.id === id)!;
  assert.equal(by("first-game").need, "Play your first game for First Whistle");
  assert.equal(by("first-host").need, "Host a game for Captain");
  assert.equal(by("first-review").need, "Review a turf you played at for First Word");
  // Only a first medal says what to do; a bigger one of the same track says how many, so no two read alike.
  assert.equal(toGo(by("reviews-5")), "Write 5 reviews");
  assert.equal(toGo(by("reviews-10")), "Write 10 reviews");
  assert.equal(toGo(by("games-5")), "Play 5 games");
  assert.equal(toGo(by("hosted-5")), "Host 5 games");
  assert.equal(toGo(by("turfs-3")), "Play at 3 turfs");
  assert.equal(toGo(by("cities-3")), "Play in 3 cities");
  assert.equal(by("streak-4").need, "Play 4 weeks in a row for On a Roll");
  for (const track of ["games", "hosted", "reviews"] as const) {
    const lines = empty.filter((m) => m.track === track).map((m) => toGo(m));
    assert.equal(new Set(lines).size, lines.length, `${track}: every locked medal reads differently`);
  }
  // Short enough for two lines on a phone's medal tile.
  assert.ok(MEDALS.every((m) => m.blurb.length <= 18), MEDALS.filter((m) => m.blurb.length > 18).map((m) => m.blurb).join(", "));
  assert.equal(MEDALS.find((m) => m.id === "first-game")?.blurb, "First game played");
  assert.equal(MEDALS.find((m) => m.id === "first-review")?.blurb, "First review");

  // Before a first game: no "Next up", the three starters, the rest behind "See all".
  const fresh = lockedShortlist(empty, 0);
  assert.equal(fresh.next, null);
  assert.deepEqual(fresh.shown.map((m) => m.id), [...STARTER_MEDALS]);
  assert.deepEqual(fresh.shown.map((m) => m.name), ["First Whistle", "Captain", "First Word"]);
  assert.equal(fresh.rest.length, MEDALS.length - 3);
  // A first review before any game: First Word is earned, so two starters are left.
  const reviewedOnly = medalsOf({ ...none, reviews: { have: 1, days: ["2026-10-09"] } });
  assert.deepEqual(lockedShortlist(reviewedOnly, 0).shown.map((m) => m.id), ["first-game", "first-host"]);
  assert.equal(new Set(MEDALS.map((m) => m.id)).size, MEDALS.length, "ids are unique");
  assert.equal(new Set(MEDALS.map((m) => m.name)).size, MEDALS.length, "and names");

  const some = medalsOf({
    games: { have: 3, days: ["2026-10-01", "2026-10-08", "2026-10-15"] },
    hosted: { have: 4, days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"] },
    turfs: { have: 2, days: ["2026-10-01", "2026-10-08"] },
    cities: { have: 1, days: ["2026-10-01"] },
    sports: { have: 1, days: ["2026-10-01"] },
    reviews: { have: 1, days: ["2026-10-09"] },
    streak: { best: 3, current: 2, reachedOn: () => null },
  });
  const m = (id: string) => some.find((x) => x.id === id)!;
  assert.equal(m("first-game").earned, true);
  assert.equal(m("first-game").earnedOn, "2026-10-01");
  assert.equal(m("games-5").need, "2 more games for Regular");
  assert.equal(m("games-5").progress, 0.6);
  assert.equal(m("hosted-5").need, "Host 1 more game for Matchmaker");
  assert.equal(m("turfs-3").need, "1 more turf for Explorer");
  assert.equal(m("cities-3").need, "2 more cities for Away Days");
  assert.equal(m("sports-3").need, "2 more sports for All-Rounder");
  assert.equal(m("reviews-5").need, "4 more reviews for Scout");
  assert.equal(m("first-review").earnedOn, "2026-10-09");
  assert.equal(m("streak-4").need, "2 more weeks in a row for On a Roll", "counted from the run going now");
  assert.equal(nextMedal(some)?.id, "hosted-5", "the closest one: 4 of 5 hosted");
  assert.equal(toGo(m("games-5")), "2 more games", "on its own tile, without its name again");
  assert.equal(toGo(m("streak-4")), "2 more weeks in a row");
  assert.equal(toGo(m("first-game")), null, "nothing to go once earned");

  // Next up on its own, then the three closest to done, the rest in the catalog's order.
  const list = lockedShortlist(some, 3);
  assert.equal(list.next?.id, "hosted-5");
  assert.deepEqual(list.shown.map((x) => x.id), ["turfs-3", "games-5", "streak-4"], "2 of 3 turfs, 3 of 5 games, 2 of 4 weeks: the closest after Matchmaker");
  assert.equal(list.rest.length, some.filter((x) => !x.earned).length - 4);
  assert.ok(list.rest.every((x) => !x.earned && x !== list.next && !list.shown.includes(x)));
  assert.deepEqual(list.rest.map((x) => x.id), MEDALS.map((x) => x.id).filter((id) => list.rest.some((x) => x.id === id)), "catalog order");
  // Best first: the hardest tier leads, the catalog breaks ties.
  assert.deepEqual(bestFirst([{ id: "first-game" }, { id: "turfs-3" }, { id: "games-25" }, { id: "first-review" }]).map((x) => x.id), ["games-25", "turfs-3", "first-game", "first-review"]);
});

test("passport: stamps, numbers, reviewed and review more, from played games only", () => {
  const games = [
    game("2026-09-14", { turf_id: "t1", sport: "Football", creator_id: ME }),
    game("2026-09-21", { turf_id: "t2", sport: "Box Cricket" }),
    game("2026-10-05", { turf_id: "t1", sport: "football" }),
    game("2026-10-12", { turf_id: "t3", sport: "Football" }),
    game("2026-10-30", { turf_id: "t2", sport: "Box Cricket", status: "cancelled" }),
    game("2026-11-03", { turf_id: "t4", sport: "Badminton" }),
    game("2026-10-19", { turf_id: "gone", sport: "Pickleball" }),
  ];
  const reviews: ReviewRow[] = [
    { turf_id: "t2", rating: 4, created_at: "2026-09-22T05:00:00Z" },
    { turf_id: "t2", rating: 5, created_at: "2026-09-25T05:00:00Z" },
    { turf_id: "t4", rating: 3, created_at: "2026-10-01T18:40:00Z" },
  ];
  const p = buildPassport({ userId: ME, games, turfs: TURFS, reviews, since: "2026-09-01T00:00:00Z", now: NOW });
  assert.deepEqual(p.numbers, { games: 5, hosted: 1, turfs: 4, cities: 2, sports: 3, reviews: 2, since: "2026-09-01T00:00:00Z" });
  assert.deepEqual(
    p.stamps.turfs.map((s) => [s.name, s.first, s.last, s.games, s.cityLabel, s.sport]),
    [
      ["Turf One", "2026-09-14", "2026-10-05", 2, "Pune", "Football"],
      ["Box Arena", "2026-09-21", "2026-09-21", 1, "Pune", "Box Cricket"],
      ["Lake Turf", "2026-10-12", "2026-10-12", 1, "Nashik", "Football"],
    ],
    "a stamp per known turf, first and latest game; the cancelled and the future game count for nothing",
  );
  assert.deepEqual(p.stamps.cities.map((c) => [c.label, c.first, c.games]), [["Pune", "2026-09-14", 3], ["Nashik", "2026-10-12", 1]]);
  assert.deepEqual(p.stamps.sports.map((c) => [c.label, c.games]), [["Football", 3], ["Box Cricket", 1], ["Pickleball", 1]], "sports match whatever their case");
  assert.deepEqual(p.reviewed.map((r) => [r.name, r.rating, r.day]), [["City Ground", 3, "2026-10-02"], ["Box Arena", 5, "2026-09-25"]], "newest first, one per turf, India's date");
  assert.deepEqual(p.reviewMore.map((s) => s.name), ["Lake Turf", "Turf One"], "played and not reviewed, latest game first");
  assert.equal(p.medals.find((m) => m.id === "games-5")?.earnedOn, "2026-10-19", "the day of the fifth game");
  assert.equal(p.medals.find((m) => m.id === "turfs-3")?.earnedOn, "2026-10-12");
  assert.equal(p.medals.find((m) => m.id === "sports-3")?.earnedOn, "2026-10-19");
  assert.equal(p.medals.find((m) => m.id === "first-host")?.earned, true);
  assert.equal(p.medals.find((m) => m.id === "hosted-5")?.earned, false);

  // What the public may see: counts, earned medals, reviewed turfs; never a date or a place played.
  const pub = publicPassport(p);
  assert.deepEqual(pub.numbers, { games: 5, hosted: 1, turfs: 4, cities: 2, sports: 3, reviews: 2, bestStreak: p.streak.best });
  assert.deepEqual(pub.medals.map((m) => m.id).sort(), p.medals.filter((m) => m.earned).map((m) => m.id).sort());
  assert.deepEqual(pub.medals.map((m) => m.id), ["turfs-3", "sports-3", "first-game", "games-5", "first-host", "first-review"], "best first: Explorer and All-Rounder lead");
  assert.deepEqual(Object.keys(pub.medals[0]).sort(), ["art", "blurb", "id", "name"]);
  assert.deepEqual(pub.reviewed.map((r) => Object.keys(r).sort()), [["cityLabel", "name", "rating", "slug", "turfId"], ["cityLabel", "name", "rating", "slug", "turfId"]]);
  const text = JSON.stringify(pub);
  assert.doesNotMatch(text, /2026-|Lake Turf|Turf One|"(since|first|last|day|stamps)":/, "no dates, no turfs played at");

  const empty = buildPassport({ userId: ME, games: [], turfs: [], reviews: [], since: null, now: NOW });
  assert.deepEqual(empty.numbers, { games: 0, hosted: 0, turfs: 0, cities: 0, sports: 0, reviews: 0, since: null });
  assert.equal(publicPassport(empty).medals.length, 0);
});

test("passport: a game at a venue its host typed (no turf) counts as a game played; turf stamps stay TapTurf's", () => {
  const games = [
    game("2026-10-12", { turf_id: "t1", sport: "Football" }),
    game("2026-10-19", { turf_id: null, sport: "Football", creator_id: ME }),
    game("2026-10-26", { turf_id: null, sport: "Cricket" }),
  ];
  const p = buildPassport({ userId: ME, games, turfs: TURFS, reviews: [], since: null, now: NOW });
  assert.deepEqual([p.numbers.games, p.numbers.hosted, p.numbers.turfs, p.numbers.sports], [3, 1, 1, 2], "three played, one hosted, one turf, two sports");
  assert.deepEqual(p.stamps.turfs.map((s) => s.name), ["Turf One"], "a stamp for the TapTurf turf only");
  assert.deepEqual(p.reviewMore.map((s) => s.name), ["Turf One"], "nothing to review at a venue TapTurf doesn't list");
  assert.equal(p.streak.current, 3, "and its weeks count for the streak (three weeks in a row)");
});

test("passport: a sport's formats are one sport, by its sport page", () => {
  const football = buildPassport({
    userId: ME,
    games: [game("2026-10-01", { sport: "Football" }), game("2026-10-08", { sport: "5v5 Football" }), game("2026-10-15", { sport: "7v7 Football" })],
    turfs: TURFS,
    reviews: [],
    since: null,
    now: NOW,
  });
  assert.equal(football.numbers.sports, 1);
  assert.deepEqual(football.stamps.sports.map((s) => [s.key, s.label, s.games]), [["football", "Football", 3]]);
  assert.equal(football.stamps.turfs[0].sport, "Football", "the turf stamp's sport too");
  assert.equal(football.medals.find((m) => m.id === "sports-3")?.earned, false, "no All-Rounder for football alone");
  assert.equal(publicPassport(football).numbers.sports, 1);

  const mixed = buildPassport({
    userId: ME,
    games: [
      game("2026-10-01", { sport: "5v5 Football" }),
      game("2026-10-02", { sport: "football" }),
      game("2026-10-03", { sport: "Box Cricket" }),
      game("2026-10-04", { sport: "cricket" }),
      game("2026-10-05", { sport: "kabaddi" }),
      game("2026-10-06", { sport: " Kabaddi " }),
    ],
    turfs: TURFS,
    reviews: [],
    since: null,
    now: NOW,
  });
  assert.deepEqual(
    mixed.stamps.sports.map((s) => [s.label, s.games]),
    [["Football", 2], ["Box Cricket", 1], ["Cricket", 1], ["Kabaddi", 2]],
    "Box Cricket keeps its own page; a sport with no page goes by its label",
  );
  assert.equal(mixed.numbers.sports, 4);
});

test("played here: the latest day per turf, in words", () => {
  const played = playedGames(ME, [game("2026-09-14", { turf_id: "t1" }), game("2026-10-05", { turf_id: "t1" }), game("2026-10-02", { turf_id: "t2" }), game("2026-11-09", { turf_id: "t3" })], NOW);
  assert.deepEqual(latestPlayedByTurf(played), { t1: "2026-10-05", t2: "2026-10-02" });
  assert.equal(playedHereText("2026-10-05", NOW), "You played here on 5 Oct");
  assert.equal(playedHereText("2025-12-28", NOW), "You played here on 28 Dec 2025");
  assert.equal(playedHereText("2026-11-01", NOW), "You played here today");
  assert.equal(playedHereText("2026-10-31", NOW), "You played here yesterday");
  assert.equal(playedHereShort("2026-10-05", NOW), "Played here · 5 Oct");
  assert.equal(playedHereShort("2026-10-31", NOW), "Played here · yesterday");
  assert.equal(shortDay("2026-10-05", NOW), "5 Oct");
});

test("played with: most games together first, names only from users, extras only from the database", () => {
  const g1 = game("2026-10-01", { creator_id: "id-ravi" });
  const g2 = game("2026-10-08", { creator_id: ME });
  const g3 = game("2026-10-15", { creator_id: "id-neha" });
  const future = game("2026-11-08", { creator_id: "id-ravi" });
  const played = playedGames(ME, [g1, g2, g3, future], NOW);
  const rosters = new Map([
    [g1.id, ["id-ravi", ME, "id-priya"]],
    [g2.id, [ME, "id-ravi", "id-gone", "id-ravi"]],
    [g3.id, ["id-neha", ME, "id-priya"]],
    [future.id, ["id-ravi", ME, "id-kiran"]],
  ]);
  const list = coPlayers(ME, played, rosters);
  assert.deepEqual(list, [
    { userId: "id-priya", together: 2, last: "2026-10-15" },
    { userId: "id-ravi", together: 2, last: "2026-10-08" },
    { userId: "id-neha", together: 1, last: "2026-10-15" },
    { userId: "id-gone", together: 1, last: "2026-10-08" },
  ], "a game that hasn't happened counts for nothing; kiran never played with them");
  const people = new Map([
    ["id-priya", { name: "Priya Sharma", photo: null }],
    ["id-ravi", { name: "Ravi Kumar", photo: "https://example.com/r.jpg" }],
    ["id-neha", { name: "Neha Joshi", photo: null }],
  ]);
  const extras = new Map([
    ["id-priya", { username: "priya", whatsapp: "+919800000003" }],
    ["id-ravi", { username: "Not A Name", whatsapp: "98000 00002" }],
  ]);
  const view = playedWithList(list, people, extras);
  assert.deepEqual(view, [
    { key: "p1", name: "Priya Sharma", photo: null, username: "priya", together: 2, last: "2026-10-15", whatsapp: "+919800000003" },
    { key: "p2", name: "Ravi Kumar", photo: "https://example.com/r.jpg", username: null, together: 2, last: "2026-10-08", whatsapp: null },
    { key: "p3", name: "Neha Joshi", photo: null, username: null, together: 1, last: "2026-10-15", whatsapp: null },
  ], "a gone account drops out; a malformed username or number is never shown");
  assert.doesNotMatch(JSON.stringify(view), /id-/, "no account ids, only keys");
  const before = playedWithList(list, people, null);
  assert.ok(before.every((p) => p.username === null && p.whatsapp === null), "before the migration: names and photos, nothing else");
  assert.equal(whatsappLink("+919800000003"), "https://wa.me/919800000003");
  assert.equal(spacedWhatsapp("+919800000003"), "+91 98000 00003");
});
