import { LIVE_CODE_RE, LIVE_DONE_POLL_FOR_MS, LIVE_DONE_POLL_MS, LIVE_POLL_MS, LIVE_POLL_TIMEOUT_MS, type LiveGetResponse, type LiveStatus } from "../../lib/live/types";
import type { Board, BoardView } from "../../lib/board/types";

/**
 * The follower page's rules (/live/<code>): which poll answer to show,
 * when to poll next, and how old the score is, worked out from the
 * server's clock, since budget phones are often minutes off; a board's
 * clock as the scorer sees it. Also the handoff to the scorecard maker
 * for "Make the result card".
 * No React and relative imports only, so follow.test.ts can run it with
 * fake timers.
 */

export type FollowStatus = LiveGetResponse["status"];

/** Before the scorer's first update: this often, for this long after the page opened, then this often while the tab is visible... */
export const WAIT_POLL_MS = 15_000;
export const WAIT_POLL_FOR_MS = 10 * 60_000;
export const WAIT_SLOW_POLL_MS = 60_000;
/** ...and after a failed poll (404, 5xx, no network), these, then the last one again. */
export const FAIL_BACKOFF_MS = [6_000, 12_000, 30_000] as const;
/** The live dot goes after this long without an update. */
export const FRESH_MS = 2 * 60_000;
/** A live match this quiet is called stopped and polled only when the page is looked at again. */
export const QUIET_MS = 3 * 60 * 60_000;

const STATUSES: readonly FollowStatus[] = ["waiting", "live", "done", "stopped", "expired"];
const FINAL: readonly FollowStatus[] = ["stopped", "expired"];

/** A GET /api/live/<code> body, checked. The match is left for sanitizeLive. */
export function readLive(body: unknown): LiveGetResponse | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!STATUSES.includes(b.status as FollowStatus)) return null;
  if (typeof b.rev !== "number" || !Number.isSafeInteger(b.rev) || b.rev < 0) return null;
  const updatedAt = typeof b.updatedAt === "string" && Number.isFinite(Date.parse(b.updatedAt)) ? b.updatedAt : null;
  return { status: b.status as FollowStatus, match: b.match ?? null, rev: b.rev, updatedAt };
}

/**
 * Whether an answer replaces what is shown. Only a higher rev does, so a
 * CDN copy from before the last ball never takes the score back. The one
 * exception: turning a link off or expiring it clears the match but keeps
 * the rev, so the same rev with a final status counts too.
 */
export function isNewer(next: { status: FollowStatus; rev: number }, cur: { status: FollowStatus; rev: number } | null): boolean {
  if (!cur) return true;
  if (next.rev !== cur.rev) return next.rev > cur.rev;
  return FINAL.includes(next.status) && !FINAL.includes(cur.status);
}

/** The server's time when it answered: Date, plus Age for a CDN copy. NaN without a Date header. */
export function serverTimeOf(date: string | null, age: string | null): number {
  const d = date ? Date.parse(date) : NaN;
  const a = Number(age ?? 0);
  return d + 1000 * (Number.isFinite(a) && a > 0 ? a : 0);
}

/**
 * When to poll next, in ms. null: only when the page is looked at again
 * (visible, focus, online). "stop": never, the link is off for good.
 * age is how old the last update is by the server's clock, null while
 * waiting; waited is how long this page has been open.
 */
export function nextPoll(status: FollowStatus, age: number | null, waited: number): number | null | "stop" {
  switch (status) {
    case "stopped":
    case "expired":
      return "stop";
    case "waiting":
      // Still polled after the first 10 min, more slowly: the card says the score shows by itself, and the first update can be late.
      return waited < WAIT_POLL_FOR_MS ? WAIT_POLL_MS : WAIT_SLOW_POLL_MS;
    case "done":
      // The last ball is often undone, so a finished match is watched a while.
      return age !== null && age >= LIVE_DONE_POLL_FOR_MS ? null : LIVE_DONE_POLL_MS;
    case "live":
      return age !== null && age > QUIET_MS ? null : LIVE_POLL_MS;
  }
}

/** "40 s", "6 min", "2 hours", "3 days". */
export function span(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return h === 1 ? "1 hour" : `${h} hours`;
  return `${Math.floor(h / 24)} days`;
}

export function ago(ms: number): string {
  return ms < 10_000 ? "just now" : `${span(ms)} ago`;
}

/** A gap in a live match where no update is due: the innings break, or before the first ball of an innings. */
export type Pause = "break" | "start" | null;

/**
 * Whether a live match is in a planned gap, from its derived view.
 * byOver gets its first over with the innings' first delivery, wides
 * included, so an empty one means no ball yet. The break ends once
 * anyone is picked for the chase, as derive() has it.
 */
export function pauseOf(v: { status: "live" | "done"; inningsBreak: boolean; current: { byOver: readonly unknown[] } }): Pause {
  if (v.status !== "live") return null;
  if (v.inningsBreak) return "break";
  return v.current.byOver.length === 0 ? "start" : null;
}

const PAUSED: Record<Exclude<Pause, null>, string> = { break: "Innings break.", start: "Waiting for the first ball." };

/** A cricket pause in words, for freshness(). */
export function pauseText(p: Pause): string | null {
  return p ? PAUSED[p] : null;
}

/** Past a timed period's length a running clock no longer explains the quiet: stoppage time is rarely this long. */
export const CLOCK_GRACE_MS = 15 * 60_000;

/**
 * Whether a live board is in a spell where the scorer has nothing to
 * send, in words, or null. shownMs is the clock as shown now (clockMs at
 * boardNow). A 0-0 football half sends nothing for 20 minutes by design,
 * and so do a badminton interval and a volleyball set break.
 */
export function boardPause(
  v: Pick<BoardView, "status" | "eventCount" | "needsServe" | "period" | "sets" | "clock" | "timeline">,
  shownMs: number | null,
): string | null {
  if (v.status !== "live") return null;
  if (v.eventCount === 0 || v.needsServe) return "Waiting for the start.";
  if (v.period?.break) return `${v.period.label}.`;
  const c = v.clock;
  if (c?.running && shownMs !== null && (c.down ? shownMs > 0 : c.limitMs === null || shownMs < c.limitMs + CLOCK_GRACE_MS)) return "Clock running.";
  const last = v.sets[v.sets.length - 1];
  if (v.sets.length > 1 && last && last.a === 0 && last.b === 0) return "Between games.";
  // Names and the first serve picked, nothing scored and the clock never started: the game has not begun.
  const clockStarted = !!c && (c.running || (c.down ? c.limitMs !== null && c.ms < c.limitMs : c.ms > 0));
  if (!clockStarted && !v.timeline.some((l) => l.tone === "score")) return "Waiting for the start.";
  return null;
}

/**
 * The scorer's "now" for a board's clock, from the follower's server
 * time: when this copy was sent (sentAt, the scorer's clock) plus how long
 * the server has had it. Anchored on the send, not the last event, so an
 * undo or a send held back offline does not set the clock back. null
 * when there is nothing to anchor on.
 */
export function boardNow(board: Pick<Board, "sentAt">, view: Pick<BoardView, "lastAt">, updatedAtMs: number, serverNow: number): number | null {
  const anchor = board.sentAt ?? view.lastAt;
  return anchor == null ? null : anchor + Math.max(0, serverNow - updatedAtMs);
}

export type Freshness = { tone: "live" | "paused" | "quiet" | "stopped" | "done"; text: string };

/**
 * The line under the score for a live or finished match. age is by the
 * server's clock; pause is the planned gap in words (pauseText,
 * boardPause), or null. In a pause the scorer has nothing to send, so a
 * quiet spell there is not called offline; past QUIET_MS it is called
 * stopped all the same.
 */
export function freshness(status: Extract<LiveStatus, "live" | "done">, age: number, pause: string | null = null): Freshness {
  if (status === "done") return { tone: "done", text: `Final score. Last update ${ago(age)}.` };
  if (age < FRESH_MS) return { tone: "live", text: `Updated ${ago(age)}` };
  if (age <= QUIET_MS && pause) return { tone: "paused", text: `${pause} Last update ${ago(age)}.` };
  if (age <= QUIET_MS) return { tone: "quiet", text: `No update for ${span(age)}. The scorer may be offline.` };
  return { tone: "stopped", text: `This match stopped updating. Last update ${ago(age)}.` };
}

/** The LIVE badge: while updates keep coming, or while a running clock explains why none do (hold). */
export function liveBadgeOn(age: number, hold: boolean): boolean {
  return age < FRESH_MS || (hold && age <= QUIET_MS);
}

/* ------------------------------------------------------------------ */
/* The server's clock                                                  */
/* ------------------------------------------------------------------ */

/** Server time minus this phone's, kept for the whole visit, not per page. null until a follower page mounts. */
let skew: number | null = null;

/**
 * Called when a follower page mounts, with the server's time at its
 * render. The first one in this document is the server render, fresh at
 * hydration, so its time sets the clock. A later one can be the router
 * cache's copy (Back reuses one however old): its time is not trusted,
 * the clock stays as the last poll left it, and the answer is true, so
 * the page polls at once.
 */
export function joinClock(serverNow: number): boolean {
  if (skew !== null) return true;
  skew = serverNow - Date.now();
  return false;
}

/** The server's time as of a poll's answer, from its Date and Age headers. */
export function setClock(serverTime: number): void {
  skew = serverTime - Date.now();
}

/** Server time now. Before any page has mounted, the phone's. */
export function clockNow(): number {
  return Date.now() + (skew ?? 0);
}

/* ------------------------------------------------------------------ */
/* The result card                                                     */
/* ------------------------------------------------------------------ */

/** Where a follower's "Make the result card" goes: the scorecard maker, told which link it came from. */
export function resultCardHref(code: string): string {
  return `/tools/cricket-scorecard-maker?from=live-follow&code=${encodeURIComponent(code)}`;
}

/**
 * Who handed the scorecard maker its card, from its query string: the
 * live scorer (?from=live-scorer) or a follower (?from=live-follow), with
 * the link to go back to when the code is well formed. null for anything
 * else, which fills nothing in.
 */
export type CardFrom = { by: "scorer" } | { by: "follower"; code: string | null };

export function cardFrom(search: string): CardFrom | null {
  const q = new URLSearchParams(search);
  const from = q.get("from");
  if (from === "live-scorer") return { by: "scorer" };
  if (from !== "live-follow") return null;
  const code = q.get("code") ?? "";
  return { by: "follower", code: LIVE_CODE_RE.test(code) ? code : null };
}

/* ------------------------------------------------------------------ */
/* Polling                                                             */
/* ------------------------------------------------------------------ */

/** What is on screen, as far as polling cares. updatedAt is ms by the server's clock. */
export type Seen = { status: FollowStatus; rev: number; updatedAt: number | null };

export type PollIo = {
  /** One GET /api/live/<code>, given up when the signal aborts. */
  get: (signal: AbortSignal) => Promise<Pick<Response, "ok" | "status" | "headers" | "json">>;
  /** What is on screen now. */
  current: () => Seen | null;
  /** Show an answer newer than current(). false when it cannot be shown (a broken match), which counts as a failed poll. */
  show: (r: LiveGetResponse) => boolean;
  /** The last poll failed and the page keeps the last score, or polls work again. Called on a change only. */
  trouble: (on: boolean) => void;
  /** The server's time as of an answer, from its Date and Age headers. */
  clock: (serverTime: number) => void;
  /** Server time now. */
  serverTime: () => number;
  /** The tab is hidden: nothing is polled until wake() finds it visible. */
  hidden: () => boolean;
};

export type Poller = {
  /** Visible again, focus, online, back from the cache: poll now unless one just ran. */
  wake: () => void;
  stop: () => void;
};

/**
 * The follower's polling: one poll at a time on a setTimeout chain timed
 * by nextPoll(), a backoff after failures, nothing while the tab is
 * hidden, and nothing ever again once the link is off.
 */
export function startPolling(io: PollIo): Poller {
  let alive = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctl: AbortController | null = null;
  let fails = 0;
  let lastPoll = -Infinity;
  let ended = false;
  let troubled = false;
  const opened = Date.now();

  const flag = (on: boolean) => {
    if (on === troubled) return;
    troubled = on;
    io.trouble(on);
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = undefined;
    const cur = io.current();
    // Nothing to show yet, or the last poll failed: back off. Otherwise by status and how old the score is.
    let wait: number | null | "stop";
    if (fails || !cur) wait = FAIL_BACKOFF_MS[Math.min(Math.max(fails, 1), FAIL_BACKOFF_MS.length) - 1];
    else wait = nextPoll(cur.status, cur.updatedAt === null ? null : io.serverTime() - cur.updatedAt, Date.now() - opened);
    if (wait === "stop") {
      ended = true;
      return;
    }
    if (wait !== null && !io.hidden()) timer = setTimeout(poll, wait);
  };

  const poll = async () => {
    if (!alive || ended || ctl) return;
    clearTimeout(timer);
    timer = undefined;
    lastPoll = Date.now();
    const c = new AbortController();
    ctl = c;
    const kill = setTimeout(() => c.abort(), LIVE_POLL_TIMEOUT_MS);
    try {
      const res = await io.get(c.signal);
      if (!res.ok) throw new Error(`live poll ${res.status}`);
      const r = readLive(await res.json());
      if (!r) throw new Error("live poll: bad body");
      if (!alive) return;
      const at = serverTimeOf(res.headers.get("date"), res.headers.get("age"));
      if (Number.isFinite(at)) io.clock(at);
      if (isNewer(r, io.current()) && !io.show(r)) throw new Error("live poll: bad match");
      fails = 0;
      flag(false);
    } catch {
      if (!alive) return;
      fails += 1;
      flag(true);
    } finally {
      clearTimeout(kill);
      ctl = null;
    }
    if (alive) schedule();
  };

  const wake = () => {
    if (!alive || ended) return;
    if (io.hidden()) {
      clearTimeout(timer);
      timer = undefined;
      return;
    }
    if (ctl) return;
    // Focus and visibilitychange come together; one poll does for both.
    if (Date.now() - lastPoll < 2_000) {
      if (!timer) schedule();
      return;
    }
    void poll();
  };

  schedule();
  return {
    wake,
    stop: () => {
      alive = false;
      clearTimeout(timer);
      ctl?.abort();
    },
  };
}
