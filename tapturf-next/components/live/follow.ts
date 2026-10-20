import { LIVE_DONE_POLL_FOR_MS, LIVE_DONE_POLL_MS, LIVE_POLL_MS, LIVE_POLL_TIMEOUT_MS, type LiveGetResponse, type LiveStatus } from "../../lib/live/types";

/**
 * The follower page's rules (/live/<code>): which poll answer to show,
 * when to poll next, and how old the score is, worked out from the
 * server's clock, since budget phones are often minutes off.
 * No React and relative imports only, so follow.test.ts can run it with
 * fake timers.
 */

export type FollowStatus = LiveGetResponse["status"];

/** Before the scorer's first update: this often, for this long after the page opened... */
export const WAIT_POLL_MS = 15_000;
export const WAIT_POLL_FOR_MS = 10 * 60_000;
/** ...and after a failed poll (404, 5xx, no network), these, then the last one again. */
export const FAIL_BACKOFF_MS = [6_000, 12_000, 30_000] as const;
/** The live dot goes after this long without an update. */
export const FRESH_MS = 2 * 60_000;
/** A live match this quiet is called stopped and polled only when the page is looked at again. */
export const QUIET_MS = 3 * 60 * 60_000;

const STATUSES: readonly FollowStatus[] = ["waiting", "live", "done", "stopped", "expired"];
const FINAL: readonly FollowStatus[] = ["stopped", "expired"];

/** A GET /api/live/<code> body, checked. The match is left for sanitizeMatch. */
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
      return waited < WAIT_POLL_FOR_MS ? WAIT_POLL_MS : null;
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

export type Freshness = { tone: "live" | "quiet" | "stopped" | "done"; text: string };

/** The line under the score for a live or finished match. age is by the server's clock. */
export function freshness(status: Extract<LiveStatus, "live" | "done">, age: number): Freshness {
  if (status === "done") return { tone: "done", text: `Final score. Last update ${ago(age)}.` };
  if (age < FRESH_MS) return { tone: "live", text: `Updated ${ago(age)}` };
  if (age <= QUIET_MS) return { tone: "quiet", text: `No update for ${span(age)}. The scorer may be offline.` };
  return { tone: "stopped", text: `This match stopped updating. Last update ${ago(age)}.` };
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
