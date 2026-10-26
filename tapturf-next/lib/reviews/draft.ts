import { isWhen, type PlayedWhen, type Score } from "./catalog";
import { parseAspects } from "./payload";
import type { Aspects, ReportChannel } from "./types";

/**
 * A report in progress, kept on this phone after every tap
 * ("tt_report_draft:<turf id>"), so closing the sheet, losing the
 * connection or going off to log in loses nothing. A draft belongs to the
 * account that wrote it (by; null when signed out): a phone can be shared,
 * so a signed-in viewer picks up only their own, or one written signed out
 * in the last 30 minutes (the login they just did from the sheet). Sign-out
 * clears them all. "Log in to post" leaves a mark in this tab only
 * (sessionStorage), good for 30 minutes, so the report posts by itself
 * only when that login comes straight back. Storage can be missing or full
 * (a private window): every read and write is guarded, and the sheet works
 * the same without it.
 */

export type Step = 1 | 2 | 3;

export type Draft = {
  v: 1;
  stars: number;
  sport: string | null;
  when: PlayedWhen | null;
  aspects: Aspects;
  playAgain: Score | null;
  /** The chip picked, or null. */
  price: number | null;
  /** What was typed after "Other". */
  priceOther: string;
  comment: string;
  noteOpen: boolean;
  note: string;
  showName: boolean;
  step: Step;
  channel: ReportChannel;
  /** The account that wrote it; null when signed out. */
  by: string | null;
  /** When the sheet was first opened for this report (ms), for the time to post. */
  startedAt: number;
  savedAt: number;
};

const PREFIX = "tt_report_draft:";
const KEY = (turfId: string) => `${PREFIX}${turfId}`;
const WAITING_KEY = "tt_report_waiting";
/** A draft older than this is a different game. */
const MAX_AGE_MS = 14 * 86_400_000;
/** How long a draft written signed out, and the "Log in to post" mark, last for the login that follows. */
export const HANDOFF_MS = 30 * 60_000;

export function emptyDraft(now = Date.now()): Draft {
  return {
    v: 1, stars: 0, sport: null, when: null, aspects: {}, playAgain: null, price: null, priceOther: "", comment: "",
    noteOpen: false, note: "", showName: false, step: 1, channel: "turf_page", by: null, startedAt: now, savedAt: now,
  };
}

/** Anything worth asking "Leave your report?" about. */
export function hasAnswers(d: Draft): boolean {
  return d.stars > 0 || Object.keys(d.aspects).length > 0 || !!d.comment.trim() || !!d.note.trim() || d.playAgain !== null || d.price !== null;
}

/** A stored draft, checked field by field; null when there is none, it is old, or storage can't be read. */
export function readDraft(raw: string | null, now = Date.now()): Draft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Draft>;
    if (!o || o.v !== 1 || typeof o.savedAt !== "number" || now - o.savedAt > MAX_AGE_MS) return null;
    const base = emptyDraft(now);
    const when = isWhen(o.when) ? o.when : null;
    const sport = typeof o.sport === "string" ? o.sport : null;
    const aspects = parseAspects(o.aspects, sport, when);
    const score = (x: unknown): Score | null => (x === -1 || x === 0 || x === 1 ? x : null);
    return {
      ...base,
      stars: typeof o.stars === "number" && o.stars >= 1 && o.stars <= 5 ? Math.round(o.stars) : 0,
      sport,
      when,
      aspects: aspects && aspects !== "bad" ? aspects : {},
      playAgain: score(o.playAgain),
      price: typeof o.price === "number" && o.price >= 100 && o.price <= 20_000 ? o.price : null,
      priceOther: typeof o.priceOther === "string" ? o.priceOther.slice(0, 6) : "",
      comment: typeof o.comment === "string" ? o.comment.slice(0, 600) : "",
      noteOpen: o.noteOpen === true,
      note: typeof o.note === "string" ? o.note.slice(0, 500) : "",
      showName: o.showName === true,
      step: o.step === 2 || o.step === 3 ? o.step : 1,
      channel: o.channel === "link" || o.channel === "edit" ? o.channel : "turf_page",
      by: typeof o.by === "string" && o.by ? o.by : null,
      startedAt: typeof o.startedAt === "number" ? o.startedAt : now,
      savedAt: o.savedAt,
    };
  } catch {
    return null;
  }
}

/** The draft this viewer may pick up: their own, or one written signed out in the last 30 minutes when they are now signed in. */
export function draftFor(d: Draft | null, userId: string | null, now = Date.now()): Draft | null {
  if (!d) return null;
  if (d.by === userId) return d;
  if (d.by === null && userId !== null && now - d.savedAt <= HANDOFF_MS) return d;
  return null;
}

export function loadDraft(turfId: string, userId: string | null): Draft | null {
  try {
    return draftFor(readDraft(localStorage.getItem(KEY(turfId))), userId);
  } catch {
    return null;
  }
}

export function saveDraft(turfId: string, d: Draft): void {
  try {
    localStorage.setItem(KEY(turfId), JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch {
    /* storage full or blocked: the sheet still works, the draft just isn't kept */
  }
}

export function clearDraft(turfId: string): void {
  try {
    localStorage.removeItem(KEY(turfId));
  } catch {
    /* nothing to clear */
  }
}

/** "Log in to post": this tab waits to post this turf's draft when the login brings it back. */
export function markWaiting(turfId: string, now = Date.now()): void {
  try {
    sessionStorage.setItem(WAITING_KEY, JSON.stringify({ turf: turfId, at: now }));
  } catch {
    /* no session storage: they tap Post again after the login */
  }
}

/** Whether a stored mark is for this turf and still fresh. Pure. */
export function waitingFresh(raw: string | null, turfId: string, now = Date.now()): boolean {
  if (!raw) return false;
  try {
    const o = JSON.parse(raw) as { turf?: unknown; at?: unknown };
    return o?.turf === turfId && typeof o.at === "number" && now - o.at >= 0 && now - o.at <= HANDOFF_MS;
  } catch {
    return false;
  }
}

/** Whether this tab has a fresh mark for this turf (it stays). */
export function hasWaiting(turfId: string): boolean {
  try {
    return waitingFresh(sessionStorage.getItem(WAITING_KEY), turfId);
  } catch {
    return false;
  }
}

/** The mark for this turf, used up: true only when it was left in this tab in the last 30 minutes. */
export function takeWaiting(turfId: string): boolean {
  try {
    const raw = sessionStorage.getItem(WAITING_KEY);
    if (!raw) return false;
    let forThis = true;
    try {
      forThis = (JSON.parse(raw) as { turf?: unknown } | null)?.turf === turfId;
    } catch {
      /* unreadable: used up all the same */
    }
    if (forThis) sessionStorage.removeItem(WAITING_KEY);
    return forThis && waitingFresh(raw, turfId);
  } catch {
    return false;
  }
}

/** Sign-out: every report draft on this phone goes, so whoever signs in next never picks one up. */
export function clearAllDrafts(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* storage blocked: nothing was kept */
  }
  try {
    sessionStorage.removeItem(WAITING_KEY);
  } catch {
    /* nothing to clear */
  }
}
