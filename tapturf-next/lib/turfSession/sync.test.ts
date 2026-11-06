// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCreate, readOp } from "../tournament/payload";
import { resolve } from "../tournament/standings";
import type { Fixture, Op, Tournament } from "../tournament/types";
import { endSession, removeMatch, reopen } from "./session";
import { hashResult, manualOf, markPushed, nextOp, sessionName, seriesLength, toCreateBody, waiting, type Step } from "./sync";
import { aSession, T0, withFinal, withScored } from "./testkit";
import type { Session } from "./types";

const SECRET = "a".repeat(64);
const CODE = "abcdefgh1234";

/** The tournament as the server would serve it after the create body. */
function created(s: Session): { session: Session; view: Tournament } {
  const { body, pushed, teamsPushed } = toCreateBody(s, SECRET);
  const read = readCreate(JSON.parse(JSON.stringify(body)));
  assert.ok("ok" in read, `the route takes it: ${JSON.stringify(read)}`);
  const view: Tournament = {
    code: CODE,
    status: "on",
    name: read.ok.name,
    settings: read.ok.settings,
    teams: read.ok.teams.map((t, i) => ({ id: i + 1, name: t.name, short: t.short })),
    fixtures: read.ok.fixtures.map((f) => ({ ...f, live: null, liveResult: null })),
    rev: 1,
    createdAt: "",
    updatedAt: "",
  };
  return { session: { ...s, live: { ...s.live, want: true, secret: SECRET, code: CODE, pushed, teamsPushed } }, view };
}

/** A change as the server does it, after the route has read it (readOp). */
function serve(view: Tournament, op: Op): Tournament {
  const read = readOp(JSON.parse(JSON.stringify({ secret: SECRET, ...op })));
  assert.ok("ok" in read, `the route takes ${JSON.stringify(op)}: ${JSON.stringify(read)}`);
  const o = read.ok.op;
  const v: Tournament = { ...view, rev: view.rev + 1, fixtures: view.fixtures.map((f) => ({ ...f })), teams: view.teams.map((t) => ({ ...t })) };
  switch (o.op) {
    case "team": {
      if (v.teams.some((t) => t.id !== o.id && t.name.toLowerCase() === o.name.toLowerCase())) throw new Error("taken");
      v.teams.find((t) => t.id === o.id)!.name = o.name;
      return v;
    }
    case "fixture_add": {
      const id = Math.max(0, ...view.fixtures.map((f) => f.id), ...removed) + 1;
      v.fixtures.push({ id, stage: o.stage, slot: o.slot, round: o.round, seq: v.fixtures.length + 1, home: o.home, away: o.away, day: o.day, time: o.time, result: null, live: null, liveResult: null });
      return v;
    }
    case "fixture_remove":
      removed.push(o.id);
      v.fixtures = v.fixtures.filter((f) => f.id !== o.id);
      return v;
    case "result":
      v.fixtures.find((f) => f.id === o.id)!.result = o.result;
      return v;
    case "settings":
      v.settings = o.settings;
      v.name = o.name;
      return v;
    default:
      throw new Error(`not expected: ${o.op}`);
  }
}
const removed: number[] = [];

/** Send every change the session asks for, as the hook does, until it asks for nothing. */
function sync(s: Session, view: Tournament): { session: Session; view: Tournament; ops: Op[] } {
  const ops: Op[] = [];
  let live = s.live;
  for (let i = 0; i < 100; i++) {
    const step: Step = nextOp({ ...s, live }, view, true);
    if (!step) return { session: { ...s, live }, view, ops };
    if ("read" in step) throw new Error("a fresh view never needs a read");
    ops.push(step.op);
    view = serve(view, step.op);
    live = markPushed(live, step.mark);
  }
  throw new Error("never settled");
}

const roundsOf = (v: Tournament) =>
  v.fixtures
    .filter((f) => f.stage === "league")
    .sort((a, b) => a.round - b.round)
    .map((f) => [f.round, f.result ? f.result.result : null] as const);

test("the create body: a series of the plan, played matches with their results, no player names", () => {
  let s = withFinal(withFinal(aSession({ plan: 5 }), 60, 50), 40, 45, { battedFirst: "b" });
  ({ session: s } = withScored(s, [4, 4, 4, 1, 1, 1], [1, 1, 1, 1, 1, 1]));
  const { body, pushed } = toCreateBody(s, SECRET);
  assert.equal(body.name, "Turf session: Sai Sports Arena, Sun 8 Nov");
  assert.equal(body.settings.format, "bilateral");
  assert.equal(body.settings.matches, 5);
  assert.equal(body.settings.starts, "2026-11-08");
  assert.deepEqual(body.teams, [{ name: "Titans", short: null }, { name: "Strikers", short: null }]);
  assert.equal(body.fixtures!.length, 5);
  assert.deepEqual(body.fixtures!.map((f) => f.result?.result ?? null), ["a", "b", "a", null, null]);
  assert.equal(body.fixtures![1].result?.battedFirst, "b");
  assert.equal(Object.keys(pushed).length, 5);
  const text = JSON.stringify(body);
  for (const p of ["Rohan", "Amit", "Vikas", "Sameer"]) assert.ok(!text.includes(p), `${p} stays on the phone`);
  assert.equal(seriesLength(aSession({ plan: null })), 3, "not sure: 3 at least");
  assert.equal(sessionName({ venue: "", day: "2026-11-08", sides: s.sides }), "Turf session: Titans vs Strikers");
  assert.ok(sessionName({ venue: "x".repeat(70), day: "2026-11-08", sides: s.sides }).length <= 60);
});

test("the margin's words are carried, so a chase at 6 a side does not read as 10 wickets", () => {
  const s = withFinal(aSession({ playersPerSide: 6 }), 50, 51, { wb: 2 });
  const r = manualOf(s.matches[0])!;
  assert.equal(r.text, "Strikers won by 3 wickets");
  const { view } = created(s);
  const res = resolve(view);
  assert.equal(res.fixtures[0].text, "Strikers won by 3 wickets", "the follower page shows the session's words");
  assert.equal(res.series?.line, "Titans 0 - 1 Strikers");
});

test("a fresh link has nothing to send; a lost reply sends the same change again", () => {
  let s = withFinal(aSession(), 60, 50);
  const c = created(s);
  assert.equal(nextOp(c.session, c.view, true), null);
  s = withFinal(c.session, 30, 40);
  const one = nextOp(s, c.view, true);
  const two = nextOp(s, c.view, true);
  assert.deepEqual(one, two, "not marked: asked again, the same change");
  assert.ok(one && "op" in one && one.op.op === "result" && one.op.id === 2);
  assert.equal(waiting(s), 1);
  const sent = one as { op: Op; mark?: Parameters<typeof markPushed>[1] };
  const after = markPushed(s.live, sent.mark);
  assert.equal(nextOp({ ...s, live: after }, serve(c.view, sent.op), true), null);
  assert.equal(waiting({ ...s, live: after }), 0);
});

test("a fixture is never added against a stale view", () => {
  let s = aSession({ plan: 3 });
  for (let i = 0; i < 3; i++) s = withFinal(s, 50 + i, 40);
  const c = created(s);
  s = withFinal(c.session, 70, 20);
  assert.deepEqual(nextOp(s, c.view, false), { read: true });
  const step = nextOp(s, c.view, true);
  assert.deepEqual(step && "op" in step ? step.op : null, { op: "fixture_add", stage: "league", slot: null, round: 4, home: 1, away: 2, day: "2026-11-08", time: null });
  assert.deepEqual(nextOp(s, null, true), { read: true }, "no view yet: read it");
  const done = sync(s, c.view);
  assert.deepEqual(roundsOf(done.view), [[1, "a"], [2, "a"], [3, "a"], [4, "a"]]);
  assert.equal(done.view.settings.matches, 4, "the series grows with the matches played");
});

test("undo after the end clears that match's result on the page", () => {
  let { session: s } = withScored(aSession({ plan: 2 }), [1, 1, 1, 1, 1, 1], [4, 4]);
  const scored = withScored(s, [6, 6, 6, 6, 6, 6], [1, 1, 1, 1, 1, 1]);
  s = endSession(scored.session, T0).session;
  const c = created(s);
  assert.deepEqual(roundsOf(c.view), [[1, "b"], [2, "b"]], "Strikers bat first in match 2 and set 36");
  // Match 2's scorecard opened from the summary, its last ball taken back.
  const undone = { ...c.session, matches: c.session.matches.map((m) => (m.n === 2 ? { ...m, result: null } : m)) };
  const step = nextOp(undone, c.view, true);
  assert.deepEqual(step && "op" in step ? step.op : null, { op: "result", id: 2, result: null });
});

test("taking a match out renumbers: the results move up and the last fixture is cleared", () => {
  let s = aSession({ plan: 3 });
  s = withFinal(s, 60, 50);
  s = withFinal(s, 40, 50);
  s = withFinal(s, 70, 10);
  const c = created(s);
  const out = removeMatch(c.session, 1, T0).session;
  const done = sync(out, c.view);
  assert.deepEqual(roundsOf(done.view), [[1, "b"], [2, "a"], [3, null]]);
  assert.equal(resolve(done.view).series?.line, "Titans 1 - 1 Strikers");
  // Ended: the empty fixture comes off and the series is the 2 played.
  const ended = sync(endSession(done.session, T0).session, done.view);
  assert.deepEqual(roundsOf(ended.view), [[1, "b"], [2, "a"]]);
  assert.equal(ended.view.settings.matches, 2);
});

test("more than 9 matches: fixtures keep coming, the series stops at 9", () => {
  let s = aSession({ plan: null });
  s = withFinal(s, 60, 50);
  let c = created(s);
  s = c.session;
  for (let i = 0; i < 11; i++) s = withFinal(s, 60, 50 + (i % 2) * 20);
  const done = sync(s, c.view);
  assert.equal(done.view.fixtures.length, 12);
  assert.equal(done.view.settings.matches, 9);
  assert.equal(resolve(done.view).series?.line, `Titans ${1 + 6} - 5 Strikers`);
  c = { session: done.session, view: done.view };
  const ended = sync(endSession(c.session, T0).session, c.view);
  assert.equal(ended.view.settings.matches, 9);
});

test("a reopened session adds its fixtures back", () => {
  let s = withFinal(withFinal(aSession({ plan: 4 }), 60, 50), 40, 50);
  const c = created(s);
  const ended = sync(endSession(c.session, T0).session, c.view);
  assert.deepEqual(roundsOf(ended.view), [[1, "a"], [2, "b"]]);
  s = withFinal(reopen(ended.session, T0), 80, 20);
  assert.deepEqual(nextOp(s, ended.view, false), { read: true });
  const back = sync(s, ended.view);
  assert.deepEqual(roundsOf(back.view), [[1, "a"], [2, "b"], [3, "a"]]);
  assert.equal(back.view.settings.matches, 3);
});

test("renamed teams go up, and two names swapped go through a stand-in", () => {
  let s = withFinal(aSession(), 60, 50);
  const c = created(s);
  s = { ...c.session, sides: { a: { ...c.session.sides.a, name: "Lions" }, b: c.session.sides.b } };
  let done = sync(s, c.view);
  assert.deepEqual(done.view.teams.map((t) => t.name), ["Lions", "Strikers"]);
  s = { ...done.session, sides: { a: { ...done.session.sides.a, name: "Strikers" }, b: { ...done.session.sides.b, name: "Lions" } } };
  done = sync(s, done.view);
  assert.deepEqual(done.view.teams.map((t) => t.name), ["Strikers", "Lions"]);
  assert.equal(done.ops.length, 3);
});

test("hashes tell results apart, none is '-'", () => {
  const s = withFinal(withFinal(aSession(), 60, 50), 60, 50, { wa: 4 });
  assert.notEqual(hashResult(manualOf(s.matches[0])), hashResult(manualOf(s.matches[1])));
  assert.equal(hashResult(null), "-");
  const f: Fixture = { id: 1, stage: "league", slot: null, round: 1, seq: 1, home: 1, away: 2, day: null, time: null, result: manualOf(s.matches[0]), live: null, liveResult: null };
  assert.equal(hashResult(f.result), hashResult(manualOf(s.matches[0])));
});
