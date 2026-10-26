import { isWhen, type PlayedWhen, type Score } from "./catalog";
import { parseAspects } from "./payload";
import type { Aspects, ReportChannel } from "./types";

/**
 * A report in progress, kept on this phone after every tap
 * ("tt_report_draft:<turf id>"), so closing the sheet, losing the
 * connection or going off to log in loses nothing. Storage can be missing
 * or full (a private window): every read and write is guarded, and the
 * sheet works the same without it.
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
  /** Signed out at Post: post on its own once the login brings them back. */
  waiting: boolean;
  /** When the sheet was first opened for this report (ms), for the time to post. */
  startedAt: number;
  savedAt: number;
};

const KEY = (turfId: string) => `tt_report_draft:${turfId}`;
/** A draft older than this is a different game. */
const MAX_AGE_MS = 14 * 86_400_000;

export function emptyDraft(now = Date.now()): Draft {
  return {
    v: 1, stars: 0, sport: null, when: null, aspects: {}, playAgain: null, price: null, priceOther: "", comment: "",
    noteOpen: false, note: "", showName: false, step: 1, channel: "turf_page", waiting: false, startedAt: now, savedAt: now,
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
      waiting: o.waiting === true,
      startedAt: typeof o.startedAt === "number" ? o.startedAt : now,
      savedAt: o.savedAt,
    };
  } catch {
    return null;
  }
}

export function loadDraft(turfId: string): Draft | null {
  try {
    return readDraft(localStorage.getItem(KEY(turfId)));
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
