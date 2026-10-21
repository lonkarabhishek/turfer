import { afterEach, beforeEach, describe, mock, test } from "node:test";
// The eye count's tests run with these: test:live runs this file (package.json lists each test file).
import "./watch.test";
import assert from "node:assert/strict";
import {
  FAIL_BACKOFF_MS,
  FRESH_MS,
  QUIET_MS,
  WAIT_POLL_FOR_MS,
  WAIT_POLL_MS,
  WAIT_SLOW_POLL_MS,
  CLOCK_GRACE_MS,
  ago,
  boardNow,
  boardPause,
  cardFrom,
  clockNow,
  freshness,
  isNewer,
  joinClock,
  liveBadgeOn,
  nextPoll,
  pauseOf,
  pauseText,
  readLive,
  resultCardHref,
  serverTimeOf,
  setClock,
  span,
  startPolling,
  type Seen,
} from "./follow";
import { LIVE_DONE_POLL_FOR_MS, LIVE_DONE_POLL_MS, LIVE_POLL_MS, type LiveGetResponse } from "../../lib/live/types";
import { apply, check, derive, newMatch, type Match, type MatchEvent } from "../../lib/cricket/scoring";
import { applyBoard, checkBoard, clockMs, deriveBoard, newBoard, undoBoard } from "../../lib/board/index";
import type { Board, BoardEvent } from "../../lib/board/types";

const MIN = 60_000;

test("readLive keeps well formed answers and refuses the rest", () => {
  const ok = { status: "live", match: { v: 1 }, rev: 12, updatedAt: "2026-10-20T10:00:00.000Z" };
  assert.deepEqual(readLive(ok), ok);
  assert.deepEqual(readLive({ status: "waiting", match: null, rev: 0, updatedAt: null }), { status: "waiting", match: null, rev: 0, updatedAt: null });
  assert.equal(readLive(null), null);
  assert.equal(readLive("live"), null);
  assert.equal(readLive({ ...ok, status: "paused" }), null);
  assert.equal(readLive({ ...ok, rev: "12" }), null);
  assert.equal(readLive({ ...ok, rev: -1 }), null);
  assert.equal(readLive({ ...ok, rev: 1.5 }), null);
  assert.equal(readLive({ error: "not_found" }), null);
  // A time that does not parse is dropped, not trusted.
  assert.equal(readLive({ ...ok, updatedAt: "yesterday" })?.updatedAt, null);
  assert.equal(readLive({ ...ok, match: undefined })?.match, null);
});

test("only a higher rev replaces the score", () => {
  assert.ok(isNewer({ status: "live", rev: 5 }, null));
  assert.ok(isNewer({ status: "live", rev: 6 }, { status: "live", rev: 5 }));
  assert.ok(!isNewer({ status: "live", rev: 5 }, { status: "live", rev: 5 }));
  // An old CDN copy after a newer answer.
  assert.ok(!isNewer({ status: "live", rev: 4 }, { status: "live", rev: 5 }));
  assert.ok(!isNewer({ status: "waiting", rev: 0 }, { status: "live", rev: 5 }));
  // Undo of the last ball: done goes back to live with a higher rev.
  assert.ok(isNewer({ status: "live", rev: 9 }, { status: "done", rev: 8 }));
  assert.ok(!isNewer({ status: "waiting", rev: 0 }, { status: "waiting", rev: 0 }));
});

test("turning a link off keeps the rev and still counts", () => {
  assert.ok(isNewer({ status: "stopped", rev: 5 }, { status: "live", rev: 5 }));
  assert.ok(isNewer({ status: "expired", rev: 5 }, { status: "done", rev: 5 }));
  assert.ok(!isNewer({ status: "live", rev: 5 }, { status: "stopped", rev: 5 }));
  assert.ok(!isNewer({ status: "expired", rev: 5 }, { status: "stopped", rev: 5 }));
  assert.ok(!isNewer({ status: "stopped", rev: 4 }, { status: "live", rev: 5 }));
});

test("server time is Date plus Age", () => {
  const date = "Tue, 20 Oct 2026 10:00:00 GMT";
  assert.equal(serverTimeOf(date, null), Date.parse(date));
  assert.equal(serverTimeOf(date, "3"), Date.parse(date) + 3000);
  assert.equal(serverTimeOf(date, "junk"), Date.parse(date));
  assert.equal(serverTimeOf(date, "-5"), Date.parse(date));
  assert.ok(Number.isNaN(serverTimeOf(null, "3")));
  assert.ok(Number.isNaN(serverTimeOf("not a date", null)));
});

test("polls fast while live, slower once done, and stop only when the link is off", () => {
  assert.equal(nextPoll("live", 10_000, 0), LIVE_POLL_MS);
  assert.equal(nextPoll("live", null, 0), LIVE_POLL_MS);
  assert.equal(nextPoll("live", NaN, 0), LIVE_POLL_MS);
  assert.equal(nextPoll("live", QUIET_MS, 0), LIVE_POLL_MS);
  assert.equal(nextPoll("live", QUIET_MS + 1, 0), null);

  assert.equal(nextPoll("done", 0, 0), LIVE_DONE_POLL_MS);
  assert.equal(nextPoll("done", LIVE_DONE_POLL_FOR_MS - 1, 0), LIVE_DONE_POLL_MS);
  assert.equal(nextPoll("done", LIVE_DONE_POLL_FOR_MS, 0), null);

  assert.equal(nextPoll("waiting", null, 0), WAIT_POLL_MS);
  assert.equal(nextPoll("waiting", null, WAIT_POLL_FOR_MS - 1), WAIT_POLL_MS);
  // After 10 min a waiting page is still polled, once a minute: the first update can be late.
  assert.equal(nextPoll("waiting", null, WAIT_POLL_FOR_MS), WAIT_SLOW_POLL_MS);
  assert.equal(nextPoll("waiting", null, 6 * 60 * MIN), WAIT_SLOW_POLL_MS);
  assert.equal(WAIT_SLOW_POLL_MS, 60_000);

  assert.equal(nextPoll("stopped", 0, 0), "stop");
  assert.equal(nextPoll("expired", 0, 0), "stop");
  assert.deepEqual([...FAIL_BACKOFF_MS], [6_000, 12_000, 30_000]);
});

test("ages read in plain words", () => {
  assert.equal(span(-500), "0 s");
  assert.equal(span(45_000), "45 s");
  assert.equal(span(6 * MIN + 59_000), "6 min");
  assert.equal(span(60 * MIN), "1 hour");
  assert.equal(span(5 * 60 * MIN), "5 hours");
  assert.equal(span(3 * 24 * 60 * MIN), "3 days");
  assert.equal(ago(3_000), "just now");
  assert.equal(ago(25_000), "25 s ago");
});

test("the live line turns amber after 2 min and gives up after 3 hours", () => {
  assert.deepEqual(freshness("live", 20_000), { tone: "live", text: "Updated 20 s ago" });
  assert.equal(freshness("live", FRESH_MS - 1).tone, "live");
  assert.deepEqual(freshness("live", 6 * MIN), { tone: "quiet", text: "No update for 6 min. The scorer may be offline." });
  assert.equal(freshness("live", QUIET_MS).tone, "quiet");
  assert.equal(freshness("live", QUIET_MS + MIN).tone, "stopped");
  assert.match(freshness("live", QUIET_MS + MIN).text, /^This match stopped updating/);
  assert.equal(freshness("done", 12 * MIN).text, "Final score. Last update 12 min ago.");
});

test("an innings break or a match before its first ball is not called offline", () => {
  const brk = pauseText("break");
  const start = pauseText("start");
  assert.deepEqual(freshness("live", 6 * MIN, brk), { tone: "paused", text: "Innings break. Last update 6 min ago." });
  assert.deepEqual(freshness("live", 6 * MIN, start), { tone: "paused", text: "Waiting for the first ball. Last update 6 min ago." });
  // Fresh is fresh, paused or not.
  assert.deepEqual(freshness("live", 20_000, brk), { tone: "live", text: "Updated 20 s ago" });
  assert.equal(freshness("live", QUIET_MS, brk).tone, "paused");
  // A pause that lasts 3 hours is called stopped all the same.
  assert.equal(freshness("live", QUIET_MS + MIN, brk).tone, "stopped");
  assert.equal(freshness("live", QUIET_MS + MIN, start).tone, "stopped");
  // With balls bowled, a quiet scorer may be offline.
  assert.equal(pauseText(null), null);
  assert.equal(freshness("live", 6 * MIN, pauseText(null)).tone, "quiet");
  assert.equal(freshness("done", 6 * MIN, brk).tone, "done");
});

const PLAYERS = { a: ["Amit", "Rahul", "Karan"], b: ["Sameer", "Vikas", "Nikhil"] };
const ball = (runs = 0, extra: "none" | "wide" = "none", wicket = false): MatchEvent => ({ type: "ball", runs, extra, extraRuns: 0, ...(wicket ? { wicket: { kind: "bowled" as const } } : {}) });
const bat = (player: string): MatchEvent => ({ type: "setBatter", player });
const bowl = (player: string): MatchEvent => ({ type: "setBowler", player });
/** Apply events, failing the test on any refused event. */
function run(m: Match, ...events: MatchEvent[]): Match {
  for (const e of events) {
    assert.equal(check(m, e).error, null, JSON.stringify(e));
    m = apply(m, e);
  }
  return m;
}

test("the pause comes from the match: before the first ball, and the innings break", () => {
  let m = newMatch({ teamA: "Titans", teamB: "Strikers", overs: 2, playersPerSide: 3, players: PLAYERS }, { id: "p", now: 0 });
  assert.equal(pauseOf(derive(m)), "start");
  m = run(m, bat("a1"), bat("a2"), bowl("b1"));
  assert.equal(pauseOf(derive(m)), "start");
  // A wide is the first ball too.
  m = run(m, ball(0, "wide"));
  assert.equal(pauseOf(derive(m)), null);
  m = run(m, ball(4), ball(0, "none", true), bat("a3"), ball(1), ball(0, "none", true));
  assert.equal(derive(m).inningsBreak, true);
  assert.equal(pauseOf(derive(m)), "break");
  // The break ends once the chase has anyone picked, as derive() has it; the chase's first ball is still to come.
  m = run(m, bat("b1"));
  assert.equal(pauseOf(derive(m)), "start");
  m = run(m, bat("b2"), bowl("a1"), ball(1));
  assert.equal(pauseOf(derive(m)), null);
  m = run(m, ball(6));
  assert.equal(derive(m).status, "done");
  assert.equal(pauseOf(derive(m)), null);
});

/* ------------------------------------------------------------------ */
/* Boards: the follower's clock and the pauses                         */
/* ------------------------------------------------------------------ */

const B0 = Date.parse("2026-10-20T10:00:00Z");
/** The server's clock runs 90 s ahead of the scorer's phone: only differences of server times may count. */
const SKEW = 90_000;
/** Apply board events, failing the test on any refused one. */
function play(b: Board, ...events: BoardEvent[]): Board {
  for (const e of events) {
    assert.equal(checkBoard(b, e), null, JSON.stringify(e));
    b = applyBoard(b, e);
  }
  return b;
}
const football = (halfMinutes = 20) => newBoard("football", { teamA: "Red FC", teamB: "Blue FC", rules: { halfMinutes } }, { id: "bfoot", now: B0 });
/** What the follower shows: the clock at boardNow for a copy the server took at updatedAt, read at serverNow. */
const followerClock = (b: Board, updatedAt: number, serverNow: number) => {
  const v = deriveBoard(b);
  const t = boardNow(b, v, updatedAt, serverNow);
  return t === null ? null : clockMs(v, t);
};

test("board clock: an undo does not set the follower's clock back", () => {
  // Kick off 10:00:00, goal 10:10:00, goal undone 10:10:05, sent then.
  let b = play(football(), { type: "clock", run: true, at: B0 }, { type: "point", side: "a", how: "goal", at: B0 + 10 * MIN });
  b = undoBoard(b);
  const sent = { ...b, sentAt: B0 + 10 * MIN + 5_000 };
  const updatedAt = B0 + 10 * MIN + 6_000 + SKEW;
  assert.equal(followerClock(sent, updatedAt, updatedAt), 10 * MIN + 5_000);
  assert.equal(followerClock(sent, updatedAt, updatedAt + MIN), 11 * MIN + 5_000);
  // Without sentAt the newest event (the kick off) is all there is: the clock read 0:00 here.
  assert.equal(followerClock(b, updatedAt, updatedAt), 0);
});

test("board clock: a send held back offline still ticks from when it went", () => {
  // Kick off 10:00, goal 10:05 with no signal, the send lands 10:12.
  const b = play(football(), { type: "clock", run: true, at: B0 }, { type: "point", side: "a", how: "goal", at: B0 + 5 * MIN });
  const sent = { ...b, sentAt: B0 + 12 * MIN };
  const updatedAt = B0 + 12 * MIN + 400 + SKEW;
  assert.equal(followerClock(sent, updatedAt, updatedAt), 12 * MIN);
  // A CDN copy read 10 s on, or a server time a little behind the row's: never earlier than the send.
  assert.equal(followerClock(sent, updatedAt, updatedAt + 10_000), 12 * MIN + 10_000);
  assert.equal(followerClock(sent, updatedAt, updatedAt - 3_000), 12 * MIN);
  // Paused clocks do not move however old the copy is.
  const paused = { ...play(b, { type: "clock", run: false, at: B0 + 12 * MIN }), sentAt: B0 + 12 * MIN };
  assert.equal(followerClock(paused, updatedAt, updatedAt + 30 * MIN), 12 * MIN);
  // No sentAt and no `at` anywhere: nothing to anchor on.
  const plain = newBoard("other", {}, { id: "bplain", now: B0 });
  assert.equal(boardNow(plain, deriveBoard(plain), updatedAt, updatedAt), null);
});

test("board pause: a running clock with nothing to send is not called offline, within the half and its grace", () => {
  let b = football(45);
  assert.equal(boardPause(deriveBoard(b), null), "Waiting for the start.");
  b = play(b, { type: "clock", run: true, at: B0 });
  const sent = { ...b, sentAt: B0 };
  const updatedAt = B0 + SKEW;
  const at = (ms: number) => {
    const v = deriveBoard(sent);
    const pause = boardPause(v, followerClock(sent, updatedAt, updatedAt + ms));
    return { pause, fresh: freshness("live", ms, pause), badge: liveBadgeOn(ms, pause === "Clock running.") };
  };
  // A 0-0 spell of 20 minutes: paused, and the LIVE badge stays.
  const quiet20 = at(20 * MIN);
  assert.equal(quiet20.pause, "Clock running.");
  assert.deepEqual(quiet20.fresh, { tone: "paused", text: "Clock running. Last update 20 min ago." });
  assert.equal(quiet20.badge, true);
  // 45+16: past stoppage time anyone plays, so the scorer may be offline after all.
  const late = at(45 * MIN + CLOCK_GRACE_MS + MIN);
  assert.equal(late.pause, null);
  assert.equal(late.fresh.tone, "quiet");
  assert.equal(late.badge, false);
  // Half time is a pause of its own.
  const ht = deriveBoard(play(b, { type: "period", at: B0 + 46 * MIN }));
  assert.equal(ht.period?.break, true);
  assert.equal(boardPause(ht, clockMs(ht, B0 + 50 * MIN)), `${ht.period?.label}.`);
  assert.match(boardPause(ht, null) ?? "", /^Half time\.$/);
});

test("board pause: before the first point, between games, and never once done", () => {
  // No first server yet: points wait for it.
  let b = newBoard("badminton", { teamA: "Asha", teamB: "Ravi", rules: { doubles: false } }, { id: "bbad", now: B0 });
  b = play(b, { type: "rename", side: "a", name: "Asha K", at: B0 });
  assert.equal(deriveBoard(b).needsServe, true);
  assert.equal(boardPause(deriveBoard(b), null), "Waiting for the start.");
  // First server picked, nothing scored yet.
  b = play(b, { type: "serve", side: "a", at: B0 + 1_000 });
  assert.equal(boardPause(deriveBoard(b), null), "Waiting for the start.");
  b = play(b, { type: "point", side: "a", at: B0 + 2_000 });
  assert.equal(boardPause(deriveBoard(b), null), null);
  // Game 1 to Asha: the next game is 0-0 until its first point.
  for (let i = 1; i < 21; i++) b = play(b, { type: "point", side: "a", at: B0 + 2_000 + i * 1_000 });
  const v = deriveBoard(b);
  assert.equal(v.sets.length, 2);
  assert.equal(boardPause(v, null), "Between games.");
  b = play(b, { type: "point", side: "b", at: B0 + 60_000 });
  assert.equal(boardPause(deriveBoard(b), null), null);
  const done = deriveBoard(play(b, { type: "end", reason: "abandoned", at: B0 + 70_000 }));
  assert.equal(done.status, "done");
  assert.equal(boardPause(done, null), null);
});

test("board pause: a count down clock holds only while time is left", () => {
  const b = play(newBoard("basketball", { teamA: "Hoops", teamB: "Dunkers" }, { id: "bball", now: B0 }), { type: "clock", run: true, at: B0 });
  const v = deriveBoard(b);
  assert.equal(v.clock?.down, true);
  assert.equal(boardPause(v, clockMs(v, B0 + 4 * MIN)), "Clock running.");
  // The quarter's time is up and nobody pressed End quarter: no reason for the quiet any more.
  assert.equal(boardPause(v, clockMs(v, B0 + 60 * MIN)), null);
});

test("no copy uses a dash as punctuation", () => {
  const lines = [
    freshness("live", 0),
    freshness("live", 6 * MIN),
    freshness("live", 6 * MIN, pauseText("break")),
    freshness("live", 6 * MIN, pauseText("start")),
    freshness("live", 6 * MIN, "Half time."),
    freshness("live", QUIET_MS * 2),
    freshness("done", MIN),
  ].map((f) => f.text);
  for (const l of lines) assert.doesNotMatch(l, /[\u2013\u2014]/);
});

test("the server clock lasts the visit: only the first page's render time sets it", () => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
  try {
    // Before any page mounts, the phone's clock.
    assert.equal(clockNow(), T0);
    // The first page, server rendered, finds the server a minute ahead.
    assert.equal(joinClock(T0 + MIN), false);
    assert.equal(clockNow(), T0 + MIN);
    mock.timers.tick(5 * MIN);
    setClock(T0 + 5 * MIN + 90_000);
    assert.equal(clockNow(), T0 + 5 * MIN + 90_000);
    // Back, 10 min later: the router cache's copy has the old render time, which is not trusted.
    mock.timers.tick(10 * MIN);
    assert.equal(joinClock(T0 + MIN), true);
    assert.equal(clockNow(), T0 + 15 * MIN + 90_000);
    assert.equal(joinClock(T0 + 15 * MIN), true);
  } finally {
    mock.timers.reset();
  }
});

test("a follower's result card goes to the scorecard maker with the way back", () => {
  const code = "ab12cd34ef56";
  const href = resultCardHref(code);
  assert.equal(href, "/tools/cricket-scorecard-maker?from=live-follow&code=ab12cd34ef56");
  assert.deepEqual(cardFrom(new URL(href, "https://tapturf.in").search), { by: "follower", code });
  // The scorer's own handoff is unchanged.
  assert.deepEqual(cardFrom("?from=live-scorer"), { by: "scorer" });
  assert.deepEqual(cardFrom("?from=live-scorer&code=ab12cd34ef56"), { by: "scorer" });
  // A code that is not one gives no link back, but the card still fills in.
  assert.deepEqual(cardFrom("?from=live-follow"), { by: "follower", code: null });
  assert.deepEqual(cardFrom("?from=live-follow&code=..%2Ftools"), { by: "follower", code: null });
  assert.deepEqual(cardFrom("?from=live-follow&code=AB12CD34EF56"), { by: "follower", code: null });
  assert.deepEqual(cardFrom("?from=live-follow&code=ab12cd34ef567"), { by: "follower", code: null });
  assert.equal(cardFrom(""), null);
  assert.equal(cardFrom("?from=game"), null);
});

/* ------------------------------------------------------------------ */
/* Polling, with fake timers                                           */
/* ------------------------------------------------------------------ */

type Answer = { status?: number; body?: unknown; age?: string; hang?: boolean };

/** A page around startPolling: answers come from a queue, the last one repeats. */
function harness(first: Seen | null, answers: Answer[]) {
  const shown: LiveGetResponse[] = [];
  const troubles: boolean[] = [];
  const clocks: number[] = [];
  let cur = first;
  let hidden = false;
  let polls = 0;
  let aborted = 0;
  let next = 0;
  const poller = startPolling({
    get: (signal) => {
      polls++;
      const a = answers[Math.min(next++, answers.length - 1)];
      if (a.hang) {
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => {
            aborted++;
            reject(new Error("aborted"));
          }),
        );
      }
      const status = a.status ?? 200;
      const headers = new Headers({ date: new Date(Date.now()).toUTCString(), ...(a.age ? { age: a.age } : {}) });
      return Promise.resolve({ ok: status >= 200 && status < 300, status, headers, json: async () => a.body });
    },
    current: () => cur,
    show: (r) => {
      if (r.match === "broken") return false;
      shown.push(r);
      cur = { status: r.status, rev: r.rev, updatedAt: r.updatedAt ? Date.parse(r.updatedAt) : null };
      return true;
    },
    trouble: (on) => troubles.push(on),
    clock: (at) => clocks.push(at),
    serverTime: () => Date.now(),
    hidden: () => hidden,
  });
  return {
    poller,
    shown,
    troubles,
    clocks,
    get polls() {
      return polls;
    },
    get aborted() {
      return aborted;
    },
    hide(h: boolean) {
      hidden = h;
    },
  };
}

const T0 = Date.parse("2026-10-20T10:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const live = (rev: number, at = Date.now()) => ({ body: { status: "live", match: { v: 1 }, rev, updatedAt: iso(at) } });
const flush = () => new Promise<void>((r) => setImmediate(r));
/** Move fake time on in steps, letting each poll's promises settle. */
async function advance(ms: number, step = 1_000) {
  for (let t = 0; t < ms; t += step) {
    mock.timers.tick(Math.min(step, ms - t));
    for (let i = 0; i < 5; i++) await flush();
  }
}

describe("polling", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 }));
  afterEach(() => mock.timers.reset());

  test("live: every 6 s, and only a higher rev is shown", async () => {
    const h = harness({ status: "live", rev: 5, updatedAt: T0 }, [live(5), live(4), live(6), live(6)]);
    await advance(LIVE_POLL_MS - 1_000);
    assert.equal(h.polls, 0);
    await advance(1_000);
    assert.equal(h.polls, 1);
    await advance(LIVE_POLL_MS * 3);
    assert.equal(h.polls, 4);
    assert.deepEqual(h.shown.map((r) => r.rev), [6]);
    assert.deepEqual(h.troubles, []);
    assert.equal(h.clocks.length, 4);
    h.poller.stop();
  });

  test("failures keep the score and back off 6, 12, 30, 30 s, then recover", async () => {
    const h = harness({ status: "live", rev: 5, updatedAt: T0 }, [{ status: 503 }, { status: 404 }, { status: 500 }, { status: 503 }, live(7)]);
    await advance(LIVE_POLL_MS);
    assert.equal(h.polls, 1);
    assert.deepEqual(h.troubles, [true]);
    await advance(6_000);
    assert.equal(h.polls, 2);
    await advance(12_000);
    assert.equal(h.polls, 3);
    await advance(29_000);
    assert.equal(h.polls, 3);
    await advance(1_000);
    assert.equal(h.polls, 4);
    await advance(30_000);
    assert.equal(h.polls, 5);
    assert.deepEqual(h.troubles, [true, false]);
    assert.deepEqual(h.shown.map((r) => r.rev), [7]);
    await advance(LIVE_POLL_MS);
    assert.equal(h.polls, 6);
    h.poller.stop();
  });

  test("a broken body or match counts as a failed poll", async () => {
    const h = harness(null, [{ body: { error: "x" } }, { body: { status: "live", match: "broken", rev: 3, updatedAt: iso(T0) } }, live(3)]);
    await advance(FAIL_BACKOFF_MS[0]);
    assert.equal(h.polls, 1);
    await advance(FAIL_BACKOFF_MS[0]);
    assert.equal(h.polls, 2);
    await advance(FAIL_BACKOFF_MS[1]);
    assert.equal(h.polls, 3);
    assert.deepEqual(h.shown.map((r) => r.rev), [3]);
    assert.deepEqual(h.troubles, [true, false]);
    h.poller.stop();
  });

  test("a hung poll is given up after 8 s and only one runs at a time", async () => {
    const h = harness({ status: "live", rev: 1, updatedAt: T0 }, [{ hang: true }, live(2)]);
    await advance(LIVE_POLL_MS);
    assert.equal(h.polls, 1);
    h.poller.wake();
    assert.equal(h.polls, 1);
    await advance(8_000);
    assert.equal(h.aborted, 1);
    assert.deepEqual(h.troubles, [true]);
    await advance(FAIL_BACKOFF_MS[0]);
    assert.equal(h.polls, 2);
    h.poller.stop();
  });

  test("a hidden tab does not poll; coming back polls at once, but not twice", async () => {
    const h = harness({ status: "live", rev: 1, updatedAt: T0 }, [live(1)]);
    h.hide(true);
    h.poller.wake();
    await advance(60_000);
    assert.equal(h.polls, 0);
    h.hide(false);
    h.poller.wake();
    h.poller.wake();
    await advance(1_000);
    assert.equal(h.polls, 1);
    // A focus right after the poll does not poll again; the chain carries on.
    h.poller.wake();
    await advance(1_000);
    assert.equal(h.polls, 1);
    await advance(LIVE_POLL_MS);
    assert.equal(h.polls, 2);
    h.poller.stop();
  });

  test("done: every 30 s for 30 min after the last update, then only when looked at", async () => {
    const h = harness({ status: "done", rev: 9, updatedAt: T0 }, [{ body: { status: "done", match: { v: 1 }, rev: 9, updatedAt: iso(T0) } }]);
    await advance(LIVE_DONE_POLL_FOR_MS + LIVE_DONE_POLL_MS, 5_000);
    const n = h.polls;
    assert.equal(n, LIVE_DONE_POLL_FOR_MS / LIVE_DONE_POLL_MS);
    await advance(10 * 60_000, 5_000);
    assert.equal(h.polls, n);
    h.poller.wake();
    await advance(1_000);
    assert.equal(h.polls, n + 1);
    h.poller.stop();
  });

  test("waiting: every 15 s for 10 min, then every minute while visible, never while hidden", async () => {
    const waiting = { body: { status: "waiting", match: null, rev: 0, updatedAt: null } };
    const h = harness({ status: "waiting", rev: 0, updatedAt: null }, [waiting]);
    await advance(WAIT_POLL_FOR_MS, 5_000);
    const n = h.polls;
    assert.equal(n, WAIT_POLL_FOR_MS / WAIT_POLL_MS);
    await advance(WAIT_SLOW_POLL_MS - 5_000, 5_000);
    assert.equal(h.polls, n);
    await advance(5_000, 5_000);
    assert.equal(h.polls, n + 1);
    await advance(9 * WAIT_SLOW_POLL_MS, 5_000);
    assert.equal(h.polls, n + 10);
    // The tab goes to the background (visibilitychange wakes the poller): nothing at all.
    h.hide(true);
    h.poller.wake();
    await advance(30 * 60_000, 5_000);
    assert.equal(h.polls, n + 10);
    // Back in front: at once, then every minute again.
    h.hide(false);
    h.poller.wake();
    await advance(1_000);
    assert.equal(h.polls, n + 11);
    await advance(WAIT_SLOW_POLL_MS, 5_000);
    assert.equal(h.polls, n + 12);
    assert.equal(h.shown.length, 0);
    h.poller.stop();
  });

  test("the first update after a late start still shows by itself", async () => {
    const waiting = { body: { status: "waiting", match: null, rev: 0, updatedAt: null } };
    const answers: Answer[] = Array.from({ length: WAIT_POLL_FOR_MS / WAIT_POLL_MS + 2 }, () => waiting);
    const h = harness({ status: "waiting", rev: 0, updatedAt: null }, [...answers, live(3, T0 + 12 * MIN)]);
    await advance(13 * MIN, 5_000);
    assert.deepEqual(h.shown.map((r) => r.rev), [3]);
    h.poller.stop();
  });

  test("a page back from the router cache polls at once, not after the first interval", async () => {
    // What LiveFollow does when joinClock says the page is not the first: wake() right after start.
    const h = harness({ status: "done", rev: 9, updatedAt: T0 - 30 * MIN }, [{ body: { status: "done", match: { v: 1 }, rev: 10, updatedAt: iso(T0 - 2 * MIN) } }]);
    h.poller.wake();
    await advance(1_000);
    assert.equal(h.polls, 1);
    assert.equal(h.clocks.length, 1);
    assert.deepEqual(h.shown.map((r) => r.rev), [10]);
    h.poller.stop();
  });

  test("a live match quiet for 3 hours is polled only when looked at", async () => {
    const h = harness({ status: "live", rev: 2, updatedAt: T0 - QUIET_MS - 1 }, [live(2, T0 - QUIET_MS - 1)]);
    await advance(60_000);
    assert.equal(h.polls, 0);
    h.poller.wake();
    await advance(1_000);
    assert.equal(h.polls, 1);
    await advance(60_000);
    assert.equal(h.polls, 1);
    h.poller.stop();
  });

  test("turned off: shown once, then never polled again", async () => {
    const h = harness({ status: "live", rev: 4, updatedAt: T0 }, [{ body: { status: "stopped", match: null, rev: 4, updatedAt: iso(T0) } }, live(5)]);
    await advance(LIVE_POLL_MS);
    assert.deepEqual(h.shown.map((r) => r.status), ["stopped"]);
    h.poller.wake();
    await advance(10 * 60_000, 5_000);
    assert.equal(h.polls, 1);
    h.poller.stop();
  });

  test("the server clock comes from Date plus Age", async () => {
    const h = harness({ status: "live", rev: 1, updatedAt: T0 }, [{ ...live(1), age: "4" }]);
    await advance(LIVE_POLL_MS);
    // Date has whole seconds; Age adds the CDN copy's age.
    assert.equal(h.clocks[0], Math.floor((T0 + LIVE_POLL_MS) / 1000) * 1000 + 4_000);
    h.poller.stop();
  });

  test("stop() cancels the poll in flight and the chain", async () => {
    const h = harness({ status: "live", rev: 1, updatedAt: T0 }, [{ hang: true }]);
    await advance(LIVE_POLL_MS);
    h.poller.stop();
    assert.equal(h.aborted, 1);
    await advance(60_000);
    assert.equal(h.polls, 1);
    assert.deepEqual(h.troubles, []);
  });
});
