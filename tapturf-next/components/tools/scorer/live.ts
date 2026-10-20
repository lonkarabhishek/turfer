// Relative, not "@/", so live.test.ts compiles on its own (npm run test:scorer).
import { useEffect, useRef, useState } from "react";
import type { MatchView } from "../../../lib/cricket/scoring";
import {
  LIVE_CODE_RE,
  LIVE_KEEPALIVE_MAX_BYTES,
  LIVE_LINKS_KEY,
  LIVE_RETRY_MS,
  LIVE_SEND_EVERY_MS,
  LIVE_SEND_TIMEOUT_MS,
  liveUrl,
  type LiveError,
  type LiveLinkRecord,
  type LivePutBody,
  type LiveStopBody,
  type LiveSyncState,
} from "../../../lib/live/types";
import { loadLinks, loadMatch, saveLink } from "./storage";

/**
 * The scorer's side of a live link (lib/live/types.ts has the flow).
 * Every local edit bumps the link's rev and queues a send of the whole
 * match as storage has it at send time. One request per match at a
 * time: the first edit goes at once, later ones at most once per
 * LIVE_SEND_EVERY_MS, an innings or match end straight away. Hiding
 * or leaving the page flushes with keepalive. Only edits made in this
 * tab and page lifecycle events send, never a storage event, so two
 * open tabs cannot keep waking each other.
 *
 * The decisions are the pure functions below (live.test.ts);
 * createLiveSync runs them against injected I/O, and useLiveSync wires
 * that to fetch, localStorage and the page events.
 */

/** Why a link is not live, or why the last try to change it failed. Shown in the share sheet. */
export type LiveFault = "offline" | "unavailable" | "limit" | "too_big" | "forbidden" | "gone" | "bad" | "not_off";

/** The server takes one write per link every 500 ms; a send sooner after the last answer comes back slow. */
const MIN_GAP_MS = 600;
/** Offer a link to the next match only within a day: the server takes writes for 36 hours from its first. */
const KEEP_LINK_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Decisions                                                           */
/* ------------------------------------------------------------------ */

/** The rev for a local edit: the edit's time, but always past the last one, so a clock that steps back cannot make edits stale. */
export function nextRev(rev: number, now: number): number {
  return Math.max(now, rev + 1);
}

/** Status and innings count. When either changes, the send skips the throttle, so followers see an innings or match end at once. */
export function shapeOf(view: { status: MatchView["status"]; innings: readonly unknown[] }): string {
  return `${view.status}:${view.innings.length}`;
}

/** On, and not waiting for a stop to reach the server. */
export function sendable(link: LiveLinkRecord | null | undefined): link is LiveLinkRecord {
  return !!link && link.on && !link.stopped;
}

/**
 * How long to wait before the next send; 0 sends now. A send goes on
 * the leading edge, then at most once per LIVE_SEND_EVERY_MS from the
 * last one's start. Urgent ones skip that, but never the gap after the
 * last answer or a backoff.
 */
export function sendWait(t: { now: number; lastStart: number; lastDone: number; retryAt: number; urgent: boolean }): number {
  const throttle = t.urgent ? 0 : t.lastStart + LIVE_SEND_EVERY_MS - t.now;
  return Math.max(0, throttle, t.lastDone + MIN_GAP_MS - t.now, t.retryAt - t.now);
}

/** Backoff after the nth network error or 5xx in a row (0 based). */
export function retryDelay(fails: number): number {
  return LIVE_RETRY_MS[Math.min(Math.max(0, fails), LIVE_RETRY_MS.length - 1)];
}

/** A write's answer: ok, a LiveError, or network when the request never got one. */
export type Reply = { r: "ok" | LiveError | "network"; rev?: number };

const ERRORS = new Set<string>(["stale", "slow", "forbidden", "gone", "limit", "too_big", "bad", "unavailable"] satisfies LiveError[]);

/** Read a PUT or DELETE answer. Anything that is not ours (a proxy's page, a 5xx without a body) counts as unavailable. */
export function readReply(status: number, body: unknown): Reply {
  const b = (body && typeof body === "object" ? body : {}) as { ok?: unknown; error?: unknown; rev?: unknown };
  const rev = typeof b.rev === "number" && Number.isSafeInteger(b.rev) && b.rev >= 0 ? b.rev : undefined;
  if (status >= 200 && status < 300 && b.ok === true) return { r: "ok", rev };
  if (typeof b.error === "string" && ERRORS.has(b.error)) return { r: b.error as LiveError, rev };
  return { r: "unavailable" };
}

/** Read the POST /api/live/new answer. */
export function readNew(status: number, body: unknown): { code: string } | { fault: LiveFault } {
  const b = (body && typeof body === "object" ? body : {}) as { code?: unknown; error?: unknown };
  if (status === 200 && typeof b.code === "string" && LIVE_CODE_RE.test(b.code)) return { code: b.code };
  return { fault: b.error === "limit" ? "limit" : "unavailable" };
}

/** What to do after an answer. wait: ms before the next try (0: when the throttle allows). */
export type Step = { link: LiveLinkRecord; wait: number; fails: number; offline: boolean; fault: LiveFault | null; halt: boolean };

/**
 * Apply a write's answer to the link as stored now (local edits may
 * have bumped its rev since the send), following LiveError's table.
 * sent is the rev that went out; fails counts network errors and 5xx
 * in a row before this one.
 */
export function handleResult(link: LiveLinkRecord, sent: number, reply: Reply, fails: number, online: boolean): Step {
  const step: Step = { link, wait: 0, fails: 0, offline: false, fault: null, halt: false };
  switch (reply.r) {
    case "ok":
      return { ...step, link: { ...link, sentRev: Math.max(link.sentRev, reply.rev ?? sent) } };
    case "stale": {
      const server = reply.rev ?? sent;
      // Only this browser writes, and every edit gets a new rev: the same rev means the server already has the latest.
      if (server === link.rev) return { ...step, link: { ...link, sentRev: Math.max(link.sentRev, server) } };
      return { ...step, link: { ...link, rev: Math.max(link.rev, server + 1) } };
    }
    case "slow":
      return { ...step, wait: LIVE_SEND_EVERY_MS / 2, fails };
    case "forbidden":
    case "gone":
    case "limit":
    case "too_big":
      return { ...step, link: { ...link, on: false, stopped: reply.r }, fault: reply.r };
    case "bad":
      return { ...step, fault: "bad", halt: true };
    default:
      // network or unavailable.
      return { ...step, wait: retryDelay(fails), fails: fails + 1, offline: reply.r === "network" || !online };
  }
}

/**
 * Whether a flush may go with keepalive: only with something unsent
 * that is not already out (unless the page is going, which cancels
 * plain requests), one at a time, and small enough for the 64 KiB a
 * page gets for all of its keepalive bodies. A bigger one waits for the
 * send when the page comes back.
 */
export function keepaliveAllowed(k: { link: LiveLinkRecord; inFlightRev: number; busy: boolean; bytes: number; unloading: boolean }): boolean {
  if (k.busy || !sendable(k.link) || k.link.rev <= k.link.sentRev) return false;
  if (!k.unloading && k.link.rev <= k.inFlightRev) return false;
  return k.bytes <= LIVE_KEEPALIVE_MAX_BYTES;
}

/** What the engine knows about a match beyond its stored record. */
export type LiveNet = { offline: boolean; halted: boolean; fault: LiveFault | null; mode: "starting" | "stopping" | null };

export function syncState(link: LiveLinkRecord | null, net: LiveNet | undefined): LiveSyncState {
  if (!link || link.stopped === "off") return net?.fault && net.fault !== "not_off" ? "error" : "off";
  if (!link.on || net?.halted) return "error";
  if (link.rev <= link.sentRev) return "synced";
  return net?.offline ? "offline" : "sending";
}

/** Everything the UI shows about one match's link. on: followers get this match's updates. */
export type LiveInfo = { link: LiveLinkRecord | null; on: boolean; state: LiveSyncState; fault: LiveFault | null; mode: LiveNet["mode"] };

export function liveInfo(link: LiveLinkRecord | null, net: LiveNet | undefined): LiveInfo {
  const refused = link && !link.on && link.stopped && link.stopped !== "off" ? link.stopped : null;
  return { link, on: sendable(link), state: syncState(link, net), fault: net?.fault ?? refused, mode: net?.mode ?? null };
}

/** The dot on the scorer's LIVE pill, or null for no pill. */
export function pillTone(info: LiveInfo): "green" | "amber" | "red" | null {
  if (info.mode === "starting") return "amber";
  if (info.state === "synced") return "green";
  if (info.state === "sending" || info.state === "offline") return "amber";
  return info.state === "error" ? "red" : null;
}

/** Whether Setup offers to move this link to the next match. */
export function canKeepLink(link: LiveLinkRecord | null | undefined, now: number): boolean {
  return sendable(link) && now - link.createdAt < KEEP_LINK_MS;
}

export function makeSecret(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** tapturf.in/live/xxxxxxxxxxxx, as people read it. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

/** The follower link for a code, on this site. Browser only. */
export function linkUrl(code: string): string {
  return liveUrl(window.location.origin, code);
}

/* ------------------------------------------------------------------ */
/* The engine                                                          */
/* ------------------------------------------------------------------ */

export type LiveIo = {
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (t: unknown) => void;
  online: () => boolean;
  /** Rejects on a network error or timeout. */
  request: (method: "POST" | "PUT" | "DELETE", url: string, body: string | null, keepalive: boolean) => Promise<{ status: number; body: unknown }>;
  links: () => Record<string, LiveLinkRecord>;
  saveLink: (id: string, rec: LiveLinkRecord | null) => void;
  /** The match as stored now. */
  match: (id: string) => unknown;
  secret: () => string;
  /** Something the UI shows changed. */
  emit: () => void;
};

export type LiveSnapshot = { links: Record<string, LiveLinkRecord>; net: Record<string, LiveNet> };

type Run = LiveNet & {
  /** The page's own send is out. A flush may go alongside it. */
  busy: boolean;
  inFlightRev: number;
  lastStart: number;
  lastDone: number;
  retryAt: number;
  fails: number;
  timer: unknown;
  /** shapeOf the latest local edit, and of the last match the server took. */
  shape: string | null;
  sentShape: string | null;
};

const putBody = (link: LiveLinkRecord, match: unknown) => JSON.stringify({ secret: link.secret, match, rev: link.rev } satisfies LivePutBody);
const stopBody = (link: LiveLinkRecord) => JSON.stringify({ secret: link.secret } satisfies LiveStopBody);
/** ok, or the link is already off or not ours: either way it is off for this browser. */
const stopTook = (reply: Reply) => reply.r === "ok" || reply.r === "gone" || reply.r === "forbidden";
const byteLength = (s: string) => new TextEncoder().encode(s).length;

export type LiveSync = ReturnType<typeof createLiveSync>;

export function createLiveSync(io: LiveIo) {
  const runs = new Map<string, Run>();
  let keepaliveOut = false;
  let alive = true;

  const run = (id: string): Run => {
    let r = runs.get(id);
    if (!r) {
      r = { offline: false, halted: false, fault: null, mode: null, busy: false, inFlightRev: 0, lastStart: 0, lastDone: 0, retryAt: 0, fails: 0, timer: null, shape: null, sentShape: null };
      runs.set(id, r);
    }
    return r;
  };
  const linkOf = (id: string): LiveLinkRecord | null => io.links()[id] ?? null;
  const cancel = (r: Run) => {
    if (r.timer !== null) io.clearTimer(r.timer);
    r.timer = null;
  };

  const call = async (method: "PUT" | "DELETE", code: string, body: string, keepalive: boolean): Promise<Reply> => {
    try {
      const res = await io.request(method, `/api/live/${code}`, body, keepalive);
      return readReply(res.status, res.body);
    } catch {
      return { r: "network" };
    }
  };

  /** Send the link's latest rev if it has one, now or once the throttle, gap or backoff allows. now: a lifecycle event, skip the throttle and backoff. */
  const pump = (id: string, now = false) => {
    if (!alive) return;
    const r = run(id);
    if (now) r.retryAt = 0;
    if (r.busy || r.halted || r.mode === "stopping") return;
    const link = linkOf(id);
    cancel(r);
    if (!sendable(link) || link.rev <= link.sentRev) return;
    const wait = sendWait({ now: io.now(), lastStart: r.lastStart, lastDone: r.lastDone, retryAt: r.retryAt, urgent: now || r.shape !== r.sentShape });
    if (wait > 0) {
      r.timer = io.setTimer(() => {
        r.timer = null;
        pump(id);
      }, wait);
      return;
    }
    const match = io.match(id);
    if (match) void put(id, link, putBody(link, match), false);
  };

  const put = async (id: string, link: LiveLinkRecord, body: string, keepalive: boolean) => {
    const r = run(id);
    const own = !r.busy;
    const shape = r.shape;
    if (own) {
      r.busy = true;
      r.inFlightRev = link.rev;
      r.lastStart = io.now();
    }
    if (keepalive) keepaliveOut = true;
    io.emit();
    const reply = await call("PUT", link.code, body, keepalive);
    if (keepalive) keepaliveOut = false;
    if (own) {
      r.busy = false;
      r.inFlightRev = 0;
      r.lastDone = io.now();
    }
    settle(id, link, shape, reply);
  };

  /** shape: what the send carried. It counts as sent only once the server has it, so a failed innings end stays urgent. */
  const settle = (id: string, sent: LiveLinkRecord, shape: string | null, reply: Reply) => {
    const r = run(id);
    const link = linkOf(id);
    // Turned off, moved to another match or replaced while the send was out: the answer is not this link's.
    if (!link || link.code !== sent.code || link.secret !== sent.secret) {
      io.emit();
      return;
    }
    const step = handleResult(link, sent.rev, reply, r.fails, io.online());
    if (step.link !== link) io.saveLink(id, step.link);
    if (step.link.sentRev >= sent.rev) r.sentShape = shape;
    r.fails = step.fails;
    r.retryAt = step.wait ? io.now() + step.wait : 0;
    r.offline = step.offline;
    r.halted = step.halt;
    if (step.fault || r.fault !== "not_off") r.fault = step.fault;
    io.emit();
    pump(id);
  };

  /** A stop that has not reached the server yet (the match was deleted while live). Tried again on wake. */
  const finishStop = async (id: string, keepalive: boolean) => {
    const r = run(id);
    const link = linkOf(id);
    if (r.mode || !link?.on || link.stopped !== "off") return;
    r.mode = "stopping";
    const reply = await call("DELETE", link.code, stopBody(link), keepalive);
    r.mode = null;
    if (stopTook(reply) && linkOf(id)?.code === link.code) io.saveLink(id, null);
    io.emit();
  };

  /** Keepalive send of what is unsent, if keepaliveAllowed. unloading: pagehide, which cancels plain requests. */
  const flush = (id: string, unloading = false) => {
    const r = run(id);
    const link = linkOf(id);
    if (!sendable(link) || r.halted || r.mode === "stopping") return;
    const match = io.match(id);
    if (!match) return;
    const body = putBody(link, match);
    if (!keepaliveAllowed({ link, inFlightRev: r.inFlightRev, busy: keepaliveOut, bytes: byteLength(body), unloading })) return;
    cancel(r);
    void put(id, link, body, true);
  };

  return {
    /** A local edit to this match, already saved. */
    changed(id: string, view: { status: MatchView["status"]; innings: readonly unknown[] }) {
      const r = run(id);
      r.shape = shapeOf(view);
      const link = linkOf(id);
      if (!sendable(link)) return;
      io.saveLink(id, { ...link, rev: nextRev(link.rev, io.now()) });
      pump(id);
      io.emit();
    },

    /** Get a code, make the secret, send. Resolves to why it failed, or null. */
    async start(id: string): Promise<LiveFault | null> {
      const r = run(id);
      if (r.mode || sendable(linkOf(id))) return null;
      r.mode = "starting";
      r.fault = null;
      io.emit();
      let fault: LiveFault | null = null;
      try {
        const res = await io.request("POST", "/api/live/new", null, false);
        const got = readNew(res.status, res.body);
        if ("code" in got) {
          const t = io.now();
          io.saveLink(id, { code: got.code, secret: io.secret(), on: true, rev: nextRev(0, t), sentRev: 0, createdAt: t });
        } else fault = got.fault;
      } catch {
        fault = "offline";
      }
      Object.assign(r, { mode: null, fault, halted: false, offline: false, fails: 0, retryAt: 0 });
      io.emit();
      if (!fault) pump(id, true);
      return fault;
    },

    /** Turn the link off. Resolves false if the server could not be told; the link then stays on. */
    async stop(id: string): Promise<boolean> {
      const r = run(id);
      const link = linkOf(id);
      if (!sendable(link)) return true;
      if (r.mode) return false;
      r.mode = "stopping";
      r.fault = null;
      cancel(r);
      io.emit();
      const reply = await call("DELETE", link.code, stopBody(link), false);
      const done = stopTook(reply);
      const cur = linkOf(id);
      if (done && cur?.code === link.code) io.saveLink(id, { ...cur, on: false, stopped: "off" });
      Object.assign(r, done ? { mode: null, fault: null, halted: false, offline: false, fails: 0 } : { mode: null, fault: "not_off" });
      io.emit();
      if (!done) pump(id);
      return done;
    },

    /** The same link for the next match: followers move over. false if from has no live link. */
    move(from: string, to: string): boolean {
      const link = linkOf(from);
      if (from === to || !sendable(link)) return false;
      cancel(run(from));
      io.saveLink(to, { ...link, rev: nextRev(link.rev, io.now()) });
      io.saveLink(from, null);
      pump(to, true);
      io.emit();
      return true;
    },

    /**
     * The match is being deleted (call before it goes from storage).
     * Live: turn its link off, and drop the record once the server has
     * it. Done: the final card stays up; send what is unsent and drop it.
     */
    remove(id: string, matchLive: boolean) {
      cancel(run(id));
      const link = linkOf(id);
      if (!link) return;
      if (sendable(link) && matchLive) {
        io.saveLink(id, { ...link, stopped: "off" });
        void finishStop(id, true);
      } else if (!link.on || !link.stopped) {
        if (sendable(link)) flush(id);
        io.saveLink(id, null);
      }
      io.emit();
    },

    flush,

    /** Hidden or leaving: flush every link with something unsent, newest first (one keepalive fits at a time). */
    flushAll(unloading: boolean) {
      const waiting = Object.entries(io.links())
        .filter(([, l]) => sendable(l) && l.rev > l.sentRev)
        .sort((a, b) => b[1].rev - a[1].rev);
      for (const [id] of waiting) flush(id, unloading);
    },

    /** Mount, online, pageshow, visible: send what waits at once, and finish stops that did not get through. */
    wake() {
      for (const [id, link] of Object.entries(io.links())) {
        if (link.on && link.stopped === "off") void finishStop(id, false);
        else if (sendable(link) && link.rev > link.sentRev) pump(id, true);
      }
      io.emit();
    },

    snapshot(): LiveSnapshot {
      const net: Record<string, LiveNet> = {};
      for (const [id, r] of runs) net[id] = { offline: r.offline, halted: r.halted, fault: r.fault, mode: r.mode };
      return { links: io.links(), net };
    },

    /** Stop scheduling. Answers still out are written to storage when they land. */
    dispose() {
      alive = false;
      for (const r of runs.values()) cancel(r);
    },
  };
}

/* ------------------------------------------------------------------ */
/* The hook                                                            */
/* ------------------------------------------------------------------ */

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  // Older Android WebViews.
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

const browserIo: Omit<LiveIo, "emit"> = {
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  online: () => navigator.onLine !== false,
  request: async (method, url, body, keepalive) => {
    const res = await fetch(url, {
      method,
      body,
      keepalive,
      cache: "no-store",
      headers: body === null ? undefined : { "Content-Type": "application/json" },
      signal: timeoutSignal(LIVE_SEND_TIMEOUT_MS),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  },
  links: () => loadLinks().links,
  saveLink,
  match: loadMatch,
  secret: () => makeSecret(crypto.getRandomValues(new Uint8Array(32))),
};

const NO_LINKS: LiveSnapshot = { links: {}, net: {} };

/**
 * Live links for LiveScorer, which stays mounted while the scorer opens
 * and closes. Off (enabled false): no listeners and no requests.
 */
export function useLiveSync(enabled: boolean) {
  const [snap, setSnap] = useState<LiveSnapshot>(NO_LINKS);
  const ref = useRef<LiveSync | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const sync: LiveSync = createLiveSync({ ...browserIo, emit: () => setSnap(sync.snapshot()) });
    ref.current = sync;
    const wake = () => sync.wake();
    const onVisibility = () => (document.visibilityState === "hidden" ? sync.flushAll(false) : sync.wake());
    const onPageHide = () => sync.flushAll(true);
    // Another tab changed a link: show it. Never a send from here.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIVE_LINKS_KEY || e.key === null) setSnap(sync.snapshot());
    };
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    // Whatever the last visit left unsent goes now; also fills the UI.
    sync.wake();
    return () => {
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      sync.flushAll(false);
      sync.dispose();
      ref.current = null;
    };
  }, [enabled]);

  return {
    info: (id: string): LiveInfo => liveInfo(snap.links[id] ?? null, snap.net[id]),
    /** Call from persist(), after the match is saved. */
    changed: (id: string, view: MatchView) => ref.current?.changed(id, view),
    start: async (id: string): Promise<LiveFault | null> => (ref.current ? ref.current.start(id) : "unavailable"),
    stop: async (id: string): Promise<boolean> => (ref.current ? ref.current.stop(id) : false),
    move: (from: string, to: string): boolean => ref.current?.move(from, to) ?? false,
    flush: (id: string) => ref.current?.flush(id),
    remove: (id: string, matchLive: boolean) => ref.current?.remove(id, matchLive),
  };
}
