import { test } from "node:test";
import assert from "node:assert/strict";
import { MEDALS, bestFirst } from "./medals";
import { coPlayers, playedWithList } from "./playedWith";
import { BADGE_IDS_MAX, badgeIds, badgeKey, badgeLabel, badgeOf, bestBadge, createBadgeSync, medalOf, parseBadges, type BadgeSent } from "./playerBadge";

// The medal on a player's photo: what the read sends, what the badge says,
// and the send that keeps the database in step. Fake people.

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("parseBadges: only real badges, by account id", () => {
  const got = parseBadges([
    { id: U(1), m: "games-25", n: 7, u: "asha" },
    { id: U(2).toUpperCase(), m: "first-game", n: 1, u: "ravi_k" },
    { id: U(3), m: "not-a-medal", n: 2, u: "priya23" },
    { id: U(4), m: "games-5", n: 0, u: "kiran_p" },
    { id: U(5), m: "games-5", n: 2.5, u: "meera_i" },
    { id: U(6), m: "games-5", n: "3", u: "neha_j" },
    { id: U(7), m: "games-5", n: 3, u: "Bad Name" },
    { id: U(8), m: "games-5", n: 3, u: null },
    { id: "acc-9", m: "games-5", n: 3, u: "someone" },
    { id: U(10), m: "games-5", n: 100, u: "someone" },
    { id: U(11), m: null, n: 0, u: "nomedal" },
    null,
    "games-25",
    [U(12), "games-25", 1, "list"],
  ]);
  assert.deepEqual([...got], [
    [U(1), { medal: "games-25", medals: 7, username: "asha" }],
    [U(2), { medal: "first-game", medals: 1, username: "ravi_k" }],
  ], "an unknown medal, a count that is no count, a username that can't be a profile, an id that is no account: left out");
  for (const junk of [null, undefined, "", 7, {}, { r: "ok" }, "[]"]) assert.equal(parseBadges(junk).size, 0, `not a list: ${JSON.stringify(junk)}`);
  assert.equal(parseBadges([]).size, 0);
  // Every medal in the catalog is one the page can draw.
  const all = parseBadges(MEDALS.map((m, i) => ({ id: U(100 + i), m: m.id, n: i + 1, u: `player_${i}` })));
  assert.equal(all.size, MEDALS.length);
});

test("badgeOf and medalOf: an id the build doesn't know draws nothing", () => {
  const badges = parseBadges([{ id: U(1), m: "games-25", n: 7, u: "asha" }]);
  assert.deepEqual(badgeOf(badges, U(1)), { medal: "games-25", medals: 7, username: "asha" });
  assert.deepEqual(badgeOf(badges, U(1).toUpperCase()), { medal: "games-25", medals: 7, username: "asha" }, "whatever the id's case");
  assert.equal(badgeOf(badges, U(2)), null);
  assert.equal(badgeOf(badges, null), null);
  assert.equal(badgeOf(null, U(1)), null);
  assert.equal(badgeOf(undefined, undefined), null);
  assert.equal(medalOf("games-25")?.name, "Turf Veteran");
  for (const id of ["", "games-26", "GAMES-25", null, undefined, "__proto__", "constructor"]) assert.equal(medalOf(id), null, String(id));
});

test("badgeLabel: the medal's name, and how many when there are more", () => {
  assert.equal(badgeLabel({ medal: "games-25", medals: 7 }), "Turf Veteran medal, 7 medals earned");
  assert.equal(badgeLabel({ medal: "first-game", medals: 1 }), "First Whistle medal");
  assert.equal(badgeLabel({ medal: "games-50", medals: 2 }), "Half Century medal, 2 medals earned");
  assert.equal(badgeLabel({ medal: "nope", medals: 3 }), "", "nothing to say about a medal the build doesn't know");
  // Every medal's label is its own name, plainly: no urgency, nothing about bookings.
  for (const m of MEDALS) {
    const label = badgeLabel({ medal: m.id, medals: 4 });
    assert.ok(label.startsWith(`${m.name} medal`), m.id);
    assert.doesNotMatch(label, /\bbook|hurry|only|!/i, m.id);
  }
});

test("badgeIds and badgeKey: real ids, each once, at most 60; one key per set of people", () => {
  assert.deepEqual(badgeIds([U(2), U(1), U(2), null, undefined, "", "acc-3", U(1).toUpperCase(), "not-a-uuid", `${U(4)}x`]), [U(2), U(1)]);
  const many = Array.from({ length: 200 }, (_, i) => U(i));
  assert.equal(badgeIds(many).length, BADGE_IDS_MAX);
  assert.equal(BADGE_IDS_MAX, 60, "the function reads the first 60");
  assert.deepEqual(badgeIds(many).slice(0, 3), [U(0), U(1), U(2)], "the first ones asked about");
  assert.equal(badgeIds(many, 120).length, 120);
  assert.deepEqual(badgeIds([]), []);
  assert.equal(badgeKey([U(2), U(1)]), badgeKey([U(1), U(2)]), "the order doesn't matter");
  assert.notEqual(badgeKey([U(1)]), badgeKey([U(1), U(2)]));
});

test("bestBadge: the first of the earned medals (best first) and how many", () => {
  assert.deepEqual(bestBadge([]), { medal: null, medals: 0 });
  assert.deepEqual(bestBadge(["first-game"]), { medal: "first-game", medals: 1 });
  // As the routes send them: bestFirst of what was earned.
  const earned = bestFirst([{ id: "first-game" }, { id: "games-5" }, { id: "games-25" }, { id: "first-host" }, { id: "turfs-3" }]).map((m) => m.id);
  assert.deepEqual(bestBadge(earned), { medal: "games-25", medals: 5 }, "the hardest tier leads");
});

test("createBadgeSync: sends once per value per player, waits out a database without the function, forgets a failure", async () => {
  const calls: [string, string | null, number][] = [];
  let answer: BadgeSent | "throw" = "ok";
  let now = 1_000_000;
  const sync = createBadgeSync(
    async (id, medal, medals) => {
      calls.push([id, medal, medals]);
      if (answer === "throw") throw new Error("down");
      return answer;
    },
    { now: () => now, missingWaitMs: 600_000, max: 3 },
  );

  assert.equal(await sync("a", ["games-25", "first-game"]), "sent");
  assert.equal(await sync("a", ["games-25", "first-game"]), "same", "the same value is not sent again");
  assert.equal(await sync("a", ["games-25", "first-game"]), "same");
  assert.deepEqual(calls, [["a", "games-25", 2]]);
  assert.equal(await sync("a", ["games-25", "first-game", "first-host"]), "sent", "a new count is");
  assert.equal(await sync("a", ["games-50", "games-25", "first-game", "first-host"]), "sent", "and a better medal");
  assert.equal(await sync("b", []), "sent", "no medal is a value too (the database then keeps no medal)");
  assert.equal(await sync("b", []), "same");
  assert.deepEqual(calls.slice(1), [["a", "games-25", 3], ["a", "games-50", 4], ["b", null, 0]]);

  // A failure is forgotten: the next time tries again; what was sent before stays known.
  calls.length = 0;
  answer = "failed";
  assert.equal(await sync("a", ["games-50"]), "failed");
  assert.equal(await sync("a", ["games-50"]), "failed", "tried again");
  assert.equal(calls.length, 2);
  answer = "throw";
  assert.equal(await sync("c", ["first-game"]), "failed", "a throw is a failure, never an exception");
  answer = "ok";
  assert.equal(await sync("a", ["games-50", "games-25", "first-game", "first-host"]), "same", "the value the database has is still the one remembered");
  assert.equal(await sync("c", ["first-game"]), "sent");

  // Before the migration: one try, then nothing for ten minutes, for anyone.
  calls.length = 0;
  answer = "missing";
  assert.equal(await sync("d", ["first-game"]), "waiting");
  assert.equal(await sync("d", ["first-game"]), "waiting");
  assert.equal(await sync("e", ["games-5"]), "waiting");
  assert.equal(calls.length, 1, "asked once");
  assert.equal(await sync("c", ["first-game"]), "same", "what is known to be sent needs no call either way");
  now += 600_001;
  answer = "ok";
  assert.equal(await sync("d", ["first-game"]), "sent", "after the wait it tries again, and the file is in");
  assert.equal(calls.length, 2);

  // Two reads at once (played and passport) send one.
  calls.length = 0;
  const both = await Promise.all([sync("f", ["first-game"]), sync("f", ["first-game"])]);
  assert.deepEqual(both.sort(), ["same", "sent"]);
  assert.equal(calls.length, 1);

  // It remembers at most `max` players: the oldest is forgotten, and simply sent again.
  calls.length = 0;
  for (const id of ["p1", "p2", "p3", "p4"]) await sync(id, ["first-game"]);
  assert.equal(await sync("p4", ["first-game"]), "same");
  assert.equal(await sync("a", ["games-50", "games-25", "first-game", "first-host"]), "sent", "forgotten by now: sent again, which changes nothing in the database");
});

test("playedWithList: the badge of someone with a public profile, never an account id", () => {
  const list = coPlayers("me", [{ id: "g1", day: "2026-11-01" } as never], new Map([["g1", ["me", U(1), U(2), U(3)]]]));
  const people = new Map([
    [U(1), { name: "Asha Rao", photo: null }],
    [U(2), { name: "Ravi Kumar", photo: null }],
    [U(3), { name: "Priya Sharma", photo: null }],
  ]);
  const extras = new Map([[U(1), { username: "asha", whatsapp: null }]]);
  const badges = parseBadges([
    { id: U(1), m: "games-25", n: 7, u: "asha" },
    { id: U(2), m: "first-game", n: 1, u: "ravi_k" },
  ]);
  const out = playedWithList(list, people, extras, 60, badges);
  assert.deepEqual(out.map((p) => [p.name, p.username, p.badge ?? null]), [
    ["Asha Rao", "asha", { medal: "games-25", medals: 7 }],
    ["Ravi Kumar", "ravi_k", { medal: "first-game", medals: 1 }],
    ["Priya Sharma", null, null],
  ], "a badge names the profile when the extras could not; no badge, nothing added");
  assert.ok(!("badge" in out[2]), "the row of someone without one is exactly as before");
  assert.doesNotMatch(JSON.stringify(out), /00000000-0000/, "no account id goes to the browser");
  // Without the read (before the migration, or it failed): the list as it always was.
  assert.deepEqual(playedWithList(list, people, extras), playedWithList(list, people, extras, 60, null));
  assert.ok(playedWithList(list, people, extras).every((p) => !("badge" in p)));
  // A badge that isn't one is left out.
  const odd = new Map([[U(3), { medal: "nope", medals: 2, username: "priya23" }]]);
  assert.ok(!("badge" in playedWithList(list, people, extras, 60, odd)[2]));
});
