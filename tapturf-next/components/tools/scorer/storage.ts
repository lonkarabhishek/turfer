// Relative, not "@/", so live.test.ts compiles on its own (npm run test:scorer).
import { restoreMatch, type Match, type MatchView } from "../../../lib/cricket/scoring";
import { LIVE_CODE_RE, LIVE_LINKS_KEY, LIVE_SECRET_RE, type LiveLinkRecord, type LiveLinks } from "../../../lib/live/types";

/**
 * Where the live scorer keeps matches: this browser only. Each match is
 * its own key, so saving after every ball writes one small JSON string,
 * and a short index lists them for the Matches screen. Every call is
 * wrapped: private mode or blocked storage just means nothing persists.
 */

const INDEX = "tapturf_scorer_v1";
const matchKey = (id: string) => `tapturf_scorer_m_${id}`;
const MAX_SAVED = 25;

export type MatchMeta = {
  id: string;
  teamA: string;
  teamB: string;
  /** Score line or result, for the list. */
  headline: string;
  status: "live" | "done";
  createdAt: number;
  updatedAt: number;
};

export type ScorerIndex = { v: 1; current: string | null; list: MatchMeta[] };

const emptyIndex = (): ScorerIndex => ({ v: 1, current: null, list: [] });

export function loadIndex(): ScorerIndex {
  try {
    const raw = localStorage.getItem(INDEX);
    if (!raw) return emptyIndex();
    const x = JSON.parse(raw) as Partial<ScorerIndex>;
    if (!x || x.v !== 1 || !Array.isArray(x.list)) return emptyIndex();
    const list = x.list.filter((m): m is MatchMeta => !!m && typeof m.id === "string" && typeof m.updatedAt === "number");
    return { v: 1, current: typeof x.current === "string" ? x.current : null, list };
  } catch {
    return emptyIndex();
  }
}

function writeIndex(ix: ScorerIndex) {
  try {
    localStorage.setItem(INDEX, JSON.stringify(ix));
  } catch {
    /* storage full or blocked */
  }
}

export function loadMatch(id: string): Match | null {
  try {
    return restoreMatch(localStorage.getItem(matchKey(id)));
  } catch {
    return null;
  }
}

export function metaOf(m: Match, view: MatchView, now: number): MatchMeta {
  return { id: m.id, teamA: view.setup.teamA, teamB: view.setup.teamB, headline: view.headline, status: view.status, createdAt: m.createdAt, updatedAt: now };
}

/** Save a match and make it the current one. Returns the new index. */
export function saveMatch(m: Match, meta: MatchMeta): ScorerIndex {
  const ix = loadIndex();
  let list = [meta, ...ix.list.filter((x) => x.id !== m.id)];
  // Keep the newest few; drop the oldest beyond that.
  if (list.length > MAX_SAVED) {
    const drop = list.slice(MAX_SAVED);
    list = list.slice(0, MAX_SAVED);
    for (const d of drop) removeKey(matchKey(d.id));
  }
  const next: ScorerIndex = { v: 1, current: m.id, list };
  try {
    localStorage.setItem(matchKey(m.id), JSON.stringify(m));
  } catch {
    /* storage full or blocked: the match still works for this visit */
  }
  writeIndex(next);
  return next;
}

export function setCurrent(id: string | null): ScorerIndex {
  const ix = loadIndex();
  const next = { ...ix, current: id };
  writeIndex(next);
  return next;
}

export function deleteMatch(id: string): ScorerIndex {
  const ix = loadIndex();
  removeKey(matchKey(id));
  const next: ScorerIndex = { v: 1, current: ix.current === id ? null : ix.current, list: ix.list.filter((x) => x.id !== id) };
  writeIndex(next);
  return next;
}

function removeKey(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Live links                                                          */
/* ------------------------------------------------------------------ */

/** Plenty for a season of match days. Past it the oldest go; their links stop taking writes 36 hours in anyway. */
const MAX_LINKS = 40;
const STOPPED = new Set<LiveLinkRecord["stopped"]>(["off", "gone", "forbidden", "limit", "too_big"]);
const LINK_ID = /^[a-z0-9]{1,24}$/i;

/** A stored record rebuilt field by field, or null if it does not look like one. */
function readLink(x: unknown): LiveLinkRecord | null {
  if (!x || typeof x !== "object") return null;
  const l = x as Partial<LiveLinkRecord>;
  if (typeof l.code !== "string" || !LIVE_CODE_RE.test(l.code) || typeof l.secret !== "string" || !LIVE_SECRET_RE.test(l.secret)) return null;
  if (typeof l.on !== "boolean" || !Number.isSafeInteger(l.rev) || !Number.isSafeInteger(l.sentRev) || typeof l.createdAt !== "number" || !Number.isFinite(l.createdAt)) return null;
  const rec: LiveLinkRecord = { code: l.code, secret: l.secret, on: l.on, rev: l.rev as number, sentRev: l.sentRev as number, createdAt: l.createdAt };
  if (l.stopped && STOPPED.has(l.stopped)) rec.stopped = l.stopped;
  return rec;
}

/**
 * The scorer's live link records, per match id, under their own key
 * (lib/live/types.ts says why), so dropping old matches never loses a
 * link's secret.
 */
export function loadLinks(): LiveLinks {
  const links: Record<string, LiveLinkRecord> = {};
  try {
    const raw = localStorage.getItem(LIVE_LINKS_KEY);
    const x = raw ? (JSON.parse(raw) as Partial<LiveLinks>) : null;
    if (x && x.v === 1 && x.links && typeof x.links === "object") {
      for (const [id, l] of Object.entries(x.links)) {
        const rec = LINK_ID.test(id) ? readLink(l) : null;
        if (rec) links[id] = rec;
      }
    }
  } catch {
    /* blocked or broken: no links */
  }
  return { v: 1, links };
}

/** Save one match's record, or drop it with null. Reads the others fresh, so another tab's links are kept. */
export function saveLink(id: string, rec: LiveLinkRecord | null) {
  const { links } = loadLinks();
  const rest = Object.entries(links).filter(([k]) => k !== id);
  const list = rec ? [[id, rec] as const, ...rest] : rest;
  const kept = list.sort((a, b) => b[1].createdAt - a[1].createdAt).slice(0, MAX_LINKS);
  try {
    localStorage.setItem(LIVE_LINKS_KEY, JSON.stringify({ v: 1, links: Object.fromEntries(kept) } satisfies LiveLinks));
  } catch {
    /* storage full or blocked: the link works for this visit */
  }
}
