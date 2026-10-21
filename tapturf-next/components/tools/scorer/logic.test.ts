// Run with: npm run test:scorer (compiled with tsc to .test-out/scorer-ui, then node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, check, derive, newMatch, publicMatch, restoreMatch, sanitizeMatch, type Match, type MatchEvent, type Tag } from "../../../lib/cricket/scoring";
import { buildBall, defaultName, keyHint, placeholderOf, plainRuns, playerEdits, profileName, profilePick, resolveOption, resolvePlayer, runAllowed, smartUndo, stamp } from "./logic";

/** Apply one tap's events the way the scorer does: same timestamp, refuse on error. */
let clock = 1000;
function tap(m: Match, ...events: MatchEvent[]): Match {
  clock += 1000;
  for (const e of stamp(events, clock)) {
    const c = check(m, e);
    assert.equal(c.error, null, `${JSON.stringify(e)}: ${c.error}`);
    m = apply(m, e);
  }
  return m;
}
const fresh = () =>
  tap(
    newMatch({ teamA: "Titans", teamB: "Strikers", overs: 2, playersPerSide: 6 }, { id: "t", now: 0 }),
    { type: "setBatter", player: "a1", name: "Batter 1", end: "striker" },
    { type: "setBatter", player: "a2", name: "Batter 2", end: "nonStriker" },
    { type: "setBowler", player: "b1", name: "Bowler 1" },
  );
const score = (m: Match) => {
  const v = derive(m).current;
  return `${v.runs}/${v.wickets} (${v.overs})`;
};

test("pad taps become the right deliveries", () => {
  assert.deepEqual(buildBall("none", 4), { type: "ball", runs: 4, extra: "none" });
  assert.deepEqual(buildBall("wide", 0), { type: "ball", runs: 0, extra: "wide" });
  assert.deepEqual(buildBall("wide", 2), { type: "ball", runs: 0, extra: "wide", extraRuns: 2 });
  assert.deepEqual(buildBall("noBall", 4), { type: "ball", runs: 4, extra: "noBall" });
  assert.deepEqual(buildBall("noBall", 1, "legBye"), { type: "ball", runs: 0, extra: "noBall", extraRuns: 1, noBallExtra: "legBye" });
  assert.deepEqual(buildBall("bye", 2), { type: "ball", runs: 0, extra: "bye", extraRuns: 2 });
  // A run out off a bye with nothing run is a run out on a fair ball.
  assert.deepEqual(buildBall("bye", 0, "bat", { kind: "runOut" }), { type: "ball", runs: 0, extra: "none", wicket: { kind: "runOut" } });
  assert.deepEqual([plainRuns("wide"), plainRuns("noBall"), plainRuns("bye"), plainRuns("legBye")], [0, 0, 1, 1]);
  assert.equal(runAllowed("wide", "bat", 6), false);
  assert.equal(runAllowed("bye", "bat", 0), false);
  assert.equal(runAllowed("noBall", "bat", 6), true);
  assert.equal(runAllowed(null, "bat", 6), true);
  assert.equal(keyHint("wide", "bat", 0), "Wd");
  assert.equal(keyHint("noBall", "bye", 2), "Nb+2b");
  assert.equal(keyHint("legBye", "bat", 3), "3lb");
  assert.equal(keyHint(null, "bat", 3), null);
});

test("every built delivery passes the engine's checks", () => {
  const m = fresh();
  for (const [x, n, nb] of [
    ["none", 0],
    ["none", 6],
    ["wide", 0],
    ["wide", 4],
    ["noBall", 0],
    ["noBall", 6],
    ["noBall", 2, "bye"],
    ["noBall", 1, "legBye"],
    ["bye", 1],
    ["legBye", 4],
  ] as const) {
    assert.equal(check(m, buildBall(x, n, nb)).error, null, `${x} ${n} ${nb ?? ""}`);
  }
});

test("undo takes back one tap: a ball, or a wicket with the batter who came in", () => {
  let m = tap(fresh(), buildBall("none", 4));
  m = tap(m, buildBall("none", 1));
  assert.equal(score(m), "5/0 (0.2)");
  m = smartUndo(m).match;
  assert.equal(score(m), "4/0 (0.1)");

  const before = m;
  m = tap(m, buildBall("none", 0, "bat", { kind: "bowled" }), { type: "setBatter", ...resolvePlayer(apply(m, buildBall("none", 0, "bat", { kind: "bowled" })), "a", "Batter 3") });
  assert.equal(score(m), "4/1 (0.2)");
  assert.equal(derive(m).current.striker?.name, "Batter 3");
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, before.events);
  assert.equal(u.removedBall, before.events.length);
});

test("undo after the next bowler is picked takes back the last ball of the over with the pick", () => {
  let m = fresh();
  for (let i = 0; i < 5; i++) m = tap(m, buildBall("none", 1));
  const fiveBalls = m;
  m = tap(m, buildBall("none", 6));
  assert.deepEqual(derive(m).needs, ["bowler"]);
  m = tap(m, { type: "setBowler", player: "b2", name: "Bowler 2" });
  assert.equal(derive(m).ready, true);
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, fiveBalls.events);
  assert.equal(score(u.match), "5/0 (0.5)");
  assert.equal(derive(u.match).current.bowler?.name, "Bowler 1");
});

test("undo of a strike swap, a rename or a mid-over bowler change takes back only that", () => {
  let m = tap(fresh(), buildBall("none", 2));
  const afterBall = m;
  m = tap(m, { type: "swapStrike" });
  assert.deepEqual(smartUndo(m).match.events, afterBall.events);
  m = tap(afterBall, { type: "renamePlayer", team: "a", player: "a1", name: "Rohit" });
  assert.deepEqual(smartUndo(m).match.events, afterBall.events);
  m = tap(afterBall, { type: "setBowler", player: "b2", name: "Bowler 2" });
  assert.deepEqual(smartUndo(m).match.events, afterBall.events);
});

test("undo after picking the chase openers goes back to the innings break", () => {
  let m = fresh();
  for (let i = 0; i < 6; i++) m = tap(m, buildBall("none", 1));
  m = tap(m, { type: "setBowler", player: "b2", name: "Bowler 2" });
  for (let i = 0; i < 6; i++) m = tap(m, buildBall("none", 1));
  const brk = derive(m);
  assert.equal(brk.inningsBreak, true);
  const atBreak = m;
  m = tap(m, { type: "setBatter", player: "b3", name: "Batter 1", end: "striker" }, { type: "setBatter", player: "b4", name: "Batter 2", end: "nonStriker" }, { type: "setBowler", player: "a3", name: "Bowler 1" });
  assert.equal(derive(m).ready, true);
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, atBreak.events);
  assert.equal(u.removedBall, null);
});

test("default names keep counting after renames and never cross roles", () => {
  let m = tap(fresh(), { type: "renamePlayer", team: "a", player: "a1", name: "Rohit" });
  const v = derive(m);
  // Two have batted, one renamed: the next is Batter 3, not a second "Batter 1".
  assert.equal(defaultName(v, "a", "Batter"), "Batter 3");
  assert.equal(defaultName(v, "b", "Bowler"), "Bowler 2");
  assert.equal(defaultName(v, "b", "Batter"), "Batter 1");
  assert.equal(defaultName(v, "a", "Batter", ["Batter 3"]), "Batter 4");
  assert.equal(placeholderOf("Bowler 2"), "Bowler");
  assert.equal(placeholderOf("batter 10"), "Batter");
  assert.equal(placeholderOf("Rohit"), null);
  // Typing an existing name picks that player; a new name adds one with a fresh id.
  assert.deepEqual(resolvePlayer(m, "a", "rohit"), { player: "a1" });
  m = tap(m, buildBall("none", 0));
  assert.deepEqual(resolvePlayer(m, "a", "Sahil"), { player: "a3", name: "Sahil" });
});

/* Tags: TapTurf profiles picked from search */

const amitS = { u: "amit_s", name: "Amit", photo: "https://example.com/a.jpg" };
const amitK = { u: "amit_k", name: "Amit" };
const four = () => newMatch({ teamA: "Titans", teamB: "Strikers", overs: 4, playersPerSide: 6 }, { id: "t", now: 0 });
const openers = (m: Match) => tap(m, { type: "setBatter", player: "a1", name: "Batter 1", end: "striker" }, { type: "setBatter", player: "a2", name: "Batter 2", end: "nonStriker" });
const legal = (m: Match) => derive(m).current.legalBalls;

test("a second Amit picked from search is a new player; the same profile again is the same player", () => {
  let m = openers(four());
  const first = profilePick(m, "b", "", amitS)!;
  // Only { u } rides on the pick: never the name or photo from the search result.
  assert.deepEqual(first, { player: "b1", name: "Amit", tag: { u: "amit_s" } });
  m = tap(m, { type: "setBowler", ...first });
  for (let i = 0; i < 6; i++) m = tap(m, buildBall("none", 0));
  const endOfOver = m;

  assert.deepEqual(resolvePlayer(m, "b", "Amit", { u: "amit_s" }), { player: "b1", tag: { u: "amit_s" } });
  // The profile decides, whatever the name box says.
  assert.deepEqual(resolvePlayer(m, "b", "Someone else", { u: "amit_s" }), { player: "b1", tag: { u: "amit_s" } });
  // Another profile with the same name, or the name typed with no profile: someone new, never the tagged Amit.
  assert.deepEqual(resolvePlayer(m, "b", "Amit", { u: "amit_k" }), { player: "b2", name: "Amit", tag: { u: "amit_k" } });
  assert.deepEqual(resolvePlayer(m, "b", "amit"), { player: "b2", name: "amit" });
  // A tag that is not a real one is no tag.
  assert.deepEqual(resolvePlayer(m, "b", "Amit", { u: "Amit K" }), { player: "b2", name: "Amit" });

  m = tap(m, { type: "setBowler", ...profilePick(m, "b", "", amitK)! });
  m = tap(m, buildBall("none", 4));
  const v = derive(m);
  assert.deepEqual(
    v.current.bowlers.map((b) => `${b.id} ${b.name} @${b.tag?.u} ${b.figures}`),
    ["b1 Amit @amit_s 0/0", "b2 Amit @amit_k 0/4"],
  );
  assert.deepEqual(
    v.teams.b.players.map((p) => `${p.id} ${p.name} @${p.tag?.u}`),
    ["b1 Amit @amit_s", "b2 Amit @amit_k"],
  );
  // Both survive storage, the live link's sanitize and its public copy.
  assert.deepEqual(derive(restoreMatch(JSON.stringify(m))!), v);
  assert.deepEqual(derive(publicMatch(sanitizeMatch(JSON.parse(JSON.stringify(m)))!)), v);

  // Undo the four, then the pick: it goes back with the last ball of the over, and so does Amit K's tag.
  m = smartUndo(m).match;
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, endOfOver.events.slice(0, -1));
  assert.equal(legal(u.match), 5);
  assert.deepEqual(
    derive(u.match).teams.b.players.map((p) => `${p.id} @${p.tag?.u}`),
    ["b1 @amit_s"],
  );
});

test("a profile picked for an untagged player of that name tags him, and undo takes the tag back with the pick", () => {
  let m = newMatch({ teamA: "Titans", teamB: "Strikers", overs: 4, playersPerSide: 6, players: { b: ["Sameer", "Vikas"] } }, { id: "t", now: 0 });
  m = tap(openers(m), { type: "setBowler", player: "b1" });
  for (let i = 0; i < 6; i++) m = tap(m, buildBall("none", 1));
  const sixBalls = m;
  const pick = profilePick(m, "b", "", { u: "vikas_r", name: "Vikas" })!;
  assert.deepEqual(pick, { player: "b2", tag: { u: "vikas_r" } });
  m = tap(m, { type: "setBowler", ...pick });
  assert.deepEqual(derive(m).current.bowler?.tag, { u: "vikas_r" });
  assert.equal(derive(m).lastAction, "Vikas to bowl");
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, sixBalls.events.slice(0, -1));
  assert.equal(u.removedBall, sixBalls.events.length - 1);
  assert.equal(Object.prototype.hasOwnProperty.call(derive(u.match).teams.b.players[1], "tag"), false);
});

test("a wicket and the next batter from search are one tap: undo takes back the ball, the batter and the tag", () => {
  let m = tap(openers(four()), { type: "setBowler", player: "b1", name: "Bowler 1" }, buildBall("none", 2));
  const before = m;
  const w = buildBall("none", 0, "bat", { kind: "bowled" });
  // The typed name stays; the profile only adds the tag.
  const next = profilePick(apply(m, w), "a", "Rahul", { u: "rahul_p", name: "Rahul Patil" })!;
  assert.deepEqual(next, { player: "a3", name: "Rahul", tag: { u: "rahul_p" } });
  m = tap(m, w, { type: "setBatter", ...next });
  assert.deepEqual(derive(m).current.striker, { ...derive(m).current.striker!, id: "a3", name: "Rahul", tag: { u: "rahul_p" } });
  const u = smartUndo(m);
  assert.deepEqual(u.match.events, before.events);
  assert.equal(JSON.stringify(derive(u.match)).includes("rahul_p"), false);
});

test("PlayerSheet: tag, swap or remove a tag (with a rename in the same tap), also after the match is over", () => {
  let m = tap(fresh(), buildBall("none", 1));
  const afterBall = m;
  let v = derive(m);
  assert.deepEqual(playerEdits(v, "a", "a1", { name: "Batter 1" }), []);
  // A tag-only change goes even though the name is the same.
  assert.deepEqual(playerEdits(v, "a", "a1", { name: "Batter 1", tag: { u: "rohit_s" } }), [{ type: "tagPlayer", team: "a", player: "a1", tag: { u: "rohit_s" } }]);
  // The box still holds a placeholder, so the profile's name takes its place.
  const evs = playerEdits(v, "a", "a1", { name: profileName("Batter 1", "Rohit Sharma"), tag: { u: "rohit_s" } });
  assert.deepEqual(evs, [
    { type: "renamePlayer", team: "a", player: "a1", name: "Rohit Sharma" },
    { type: "tagPlayer", team: "a", player: "a1", tag: { u: "rohit_s" } },
  ]);
  m = tap(m, ...evs);
  v = derive(m);
  assert.equal(v.lastAction, "Rohit Sharma tagged");
  assert.deepEqual(
    v.current.batters.map((b) => `${b.name} @${b.tag?.u ?? "-"}`),
    ["Rohit Sharma @rohit_s", "Batter 2 @-"],
  );
  // The whole tap comes back with one undo.
  assert.deepEqual(smartUndo(m).match.events, afterBall.events);

  assert.deepEqual(playerEdits(v, "a", "a1", { tag: { u: "rohit_s" } }), []);
  assert.deepEqual(playerEdits(v, "a", "a1", { tag: { u: "rohit_99" } }), [{ type: "tagPlayer", team: "a", player: "a1", tag: { u: "rohit_99" } }]);
  assert.deepEqual(playerEdits(v, "a", "a2", { tag: null }), []);
  assert.deepEqual(playerEdits(v, "a", "a1", { tag: { u: "Not OK" } }), []);
  assert.deepEqual(playerEdits(v, "a", "a9", { tag: null }), []);
  // A search result passed whole: only { u } is kept.
  assert.deepEqual(playerEdits(v, "a", "a2", { tag: { u: "rahul_p", name: "Rahul", photo: "p.jpg" } as Tag }), [{ type: "tagPlayer", team: "a", player: "a2", tag: { u: "rahul_p" } }]);

  // Remove tag.
  const off = playerEdits(v, "a", "a1", { tag: null });
  assert.deepEqual(off, [{ type: "tagPlayer", team: "a", player: "a1", tag: null }]);
  m = tap(m, ...off);
  assert.equal(derive(m).lastAction, "Rohit Sharma untagged");
  assert.equal(JSON.stringify(derive(m)).includes("rohit_s"), false);

  // After the match is over, a player can still be tagged.
  m = tap(m, { type: "endInnings", reason: "abandoned" });
  v = derive(m);
  assert.equal(v.status, "done");
  m = tap(m, ...playerEdits(v, "b", "b1", { tag: { u: "bowler_one" } }));
  assert.equal(derive(m).lastAction, "Bowler 1 tagged");
  assert.deepEqual(derive(m).innings[0].bowlers[0].tag, { u: "bowler_one" });
});

test("profileName keeps the scorer's name and fills an empty or placeholder box; profilePick needs a real username", () => {
  assert.equal(profileName("", "Rahul Patil"), "Rahul Patil");
  assert.equal(profileName("  ", " Rahul   Patil "), "Rahul Patil");
  assert.equal(profileName("Batter 3", "Rahul Patil"), "Rahul Patil");
  assert.equal(profileName("bowler 12", "Rahul Patil"), "Rahul Patil");
  assert.equal(profileName("Rahul", "Rahul Patil"), "Rahul");
  assert.equal(profileName("", "A".repeat(60)), "A".repeat(40));
  assert.equal(profileName("Batter 3", ""), "Batter 3");
  const m = openers(four());
  assert.equal(profilePick(m, "b", "", { u: "Bad Name", name: "X" }), null);
  // No name anywhere: the username stands in, so the pick is never refused for a missing name.
  assert.deepEqual(profilePick(m, "b", "", { u: "sam99" }), { player: "b1", name: "sam99", tag: { u: "sam99" } });
  assert.equal(check(m, { type: "setBowler", ...profilePick(m, "b", "", { u: "sam99" })! }).error, null);
  // stamp keeps the tag on the pick.
  assert.deepEqual(stamp([{ type: "setBatter", player: "a3", tag: { u: "sam99" } }], 5), [{ type: "setBatter", player: "a3", tag: { u: "sam99" }, at: 5 }]);
});

test("resolveOption: names kept by OpenersSheet stay the same player, tagged or not", () => {
  // Amit (@amit_s) bowls the only over; in the chase his name is the first opener on offer.
  let m = newMatch({ teamA: "Titans", teamB: "Strikers", overs: 1, playersPerSide: 6 }, { id: "t", now: 0 });
  m = openers(m);
  m = tap(m, { type: "setBowler", ...profilePick(m, "b", "", amitS)! });
  for (let i = 0; i < 6; i++) m = tap(m, buildBall("none", 0));
  const v = derive(m);
  assert.equal(v.inningsBreak, true);
  assert.deepEqual(
    v.batterOptions.map((o) => `${o.id} ${o.name} @${o.tag?.u}`),
    ["b1 Amit @amit_s"],
  );
  assert.deepEqual(resolveOption(m, "b", "amit", v.batterOptions), { player: "b1" });
  // resolvePlayer alone would make a second Amit: a name with no profile never joins a tagged player.
  assert.deepEqual(resolvePlayer(m, "b", "Amit"), { player: "b2", name: "Amit" });
  // A name that is not on offer is resolved as usual.
  assert.deepEqual(resolveOption(m, "b", "Zed", v.batterOptions), { player: "b2", name: "Zed" });
  m = tap(m, { type: "setBatter", ...resolveOption(m, "b", "Amit", v.batterOptions), end: "striker" });
  m = tap(m, { type: "setBatter", ...resolveOption(m, "b", "Zed", derive(m).batterOptions), end: "nonStriker" });
  assert.deepEqual(derive(m).current.striker?.tag, { u: "amit_s" });
  assert.equal(derive(m).teams.b.players.length, 2);
  // Two on offer with one name: the untagged one, as resolvePlayer would.
  assert.deepEqual(
    resolveOption(m, "b", "Amit", [
      { id: "b1", name: "Amit", tag: { u: "amit_s" } },
      { id: "b5", name: "Amit" },
    ]),
    { player: "b5" },
  );
});
