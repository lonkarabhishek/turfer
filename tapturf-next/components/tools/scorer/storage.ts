// Relative, not "@/", so live.test.ts compiles on its own (npm run test:scorer).
import { restoreMatch, type Match, type MatchView } from "../../../lib/cricket/scoring";

/**
 * Where the live scorer keeps matches: this browser only. Each match is
 * its own key, so saving after every ball writes one small JSON string,
 * and a short index lists them for the Matches screen. Every call is
 * wrapped: private mode or blocked storage just means nothing persists.
 */

const INDEX = "tapturf_scorer_v1";
const matchKey = (id: string) => `tapturf_scorer_m_${id}`;
export const MAX_SAVED = 25;

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

/** Save a match and make it the current one. Returns the new index, and the ids of old matches dropped to make room. */
export function saveMatch(m: Match, meta: MatchMeta): { index: ScorerIndex; dropped: string[] } {
  const ix = loadIndex();
  let list = [meta, ...ix.list.filter((x) => x.id !== m.id)];
  // Keep the newest few; drop the oldest beyond that.
  const dropped = list.slice(MAX_SAVED).map((d) => d.id);
  if (dropped.length) {
    list = list.slice(0, MAX_SAVED);
    for (const id of dropped) removeKey(matchKey(id));
  }
  const next: ScorerIndex = { v: 1, current: m.id, list };
  try {
    localStorage.setItem(matchKey(m.id), JSON.stringify(m));
  } catch {
    /* storage full or blocked: the match still works for this visit */
  }
  writeIndex(next);
  return { index: next, dropped };
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

export { loadLinks, saveLink } from "./links";
