// Relative, not "@/", so logic.test.ts compiles on its own.
import { sanitizeBoard } from "../../../lib/board";
import { BOARD_SPORTS, type Board, type BoardSport, type BoardView } from "../../../lib/board/types";

/**
 * Where the Live Scoreboard keeps boards: this browser only, apart from
 * the cricket scorer's matches. Each board is its own key, so saving after
 * every point writes one small JSON string, and a short index lists them.
 * Every call is wrapped: private mode or blocked storage just means
 * nothing persists. Live link records stay with the cricket scorer's
 * (LIVE_LINKS_KEY), keyed by id; board ids start with "b", matches "m".
 */

const INDEX = "tapturf_board_v1";
const boardKey = (id: string) => `tapturf_board_b_${id}`;
/** UI-only choices per board (Swap sides, ask for player names): never part of the board, never sent. */
const PREFS = "tapturf_board_ui_v1";
export const MAX_SAVED = 25;

export type BoardMeta = {
  id: string;
  sport: BoardSport;
  teamA: string;
  teamB: string;
  /** Score line or result, for the list. */
  headline: string;
  status: "live" | "done";
  createdAt: number;
  updatedAt: number;
};

export type BoardIndex = { v: 1; current: string | null; list: BoardMeta[] };

/** swap: side b shows on the left (the players changed ends). names: offer "Add player" after basketball points and fouls. */
export type BoardPrefs = { swap: boolean; names: boolean };
export const DEFAULT_PREFS: BoardPrefs = { swap: false, names: false };

const emptyIndex = (): BoardIndex => ({ v: 1, current: null, list: [] });
const isSport = (x: unknown): x is BoardSport => (BOARD_SPORTS as readonly unknown[]).includes(x);

export function loadIndex(): BoardIndex {
  try {
    const raw = localStorage.getItem(INDEX);
    if (!raw) return emptyIndex();
    const x = JSON.parse(raw) as Partial<BoardIndex>;
    if (!x || x.v !== 1 || !Array.isArray(x.list)) return emptyIndex();
    const list = x.list.filter((m): m is BoardMeta => !!m && typeof m.id === "string" && typeof m.updatedAt === "number" && isSport(m.sport));
    return { v: 1, current: typeof x.current === "string" ? x.current : null, list };
  } catch {
    return emptyIndex();
  }
}

function writeIndex(ix: BoardIndex) {
  try {
    localStorage.setItem(INDEX, JSON.stringify(ix));
  } catch {
    /* storage full or blocked */
  }
}

/** A saved board, rebuilt by sanitizeBoard like anything read back from outside the page. */
export function loadBoard(id: string): Board | null {
  try {
    const raw = localStorage.getItem(boardKey(id));
    return raw ? sanitizeBoard(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function metaOf(b: Board, view: BoardView, now: number): BoardMeta {
  return { id: b.id, sport: b.sport, teamA: view.teams.a.name, teamB: view.teams.b.name, headline: view.headline, status: view.status, createdAt: b.createdAt, updatedAt: now };
}

/** Save a board and make it the current one. Returns the new index, and the ids of old boards dropped to make room. */
export function saveBoard(b: Board, meta: BoardMeta): { index: BoardIndex; dropped: string[] } {
  const ix = loadIndex();
  let list = [meta, ...ix.list.filter((x) => x.id !== b.id)];
  // Keep the newest few; drop the oldest beyond that.
  const dropped = list.slice(MAX_SAVED).map((d) => d.id);
  if (dropped.length) {
    list = list.slice(0, MAX_SAVED);
    for (const id of dropped) removeKey(boardKey(id));
    dropPrefs(dropped);
  }
  const next: BoardIndex = { v: 1, current: b.id, list };
  try {
    localStorage.setItem(boardKey(b.id), JSON.stringify(b));
  } catch {
    /* storage full or blocked: the board still works for this visit */
  }
  writeIndex(next);
  return { index: next, dropped };
}

export function setCurrent(id: string | null): BoardIndex {
  const ix = loadIndex();
  const next = { ...ix, current: id };
  writeIndex(next);
  return next;
}

export function deleteBoard(id: string): BoardIndex {
  const ix = loadIndex();
  removeKey(boardKey(id));
  dropPrefs([id]);
  const next: BoardIndex = { v: 1, current: ix.current === id ? null : ix.current, list: ix.list.filter((x) => x.id !== id) };
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
/* UI prefs                                                            */
/* ------------------------------------------------------------------ */

function readPrefs(): Record<string, BoardPrefs> {
  try {
    const x = JSON.parse(localStorage.getItem(PREFS) ?? "null") as unknown;
    if (!x || typeof x !== "object" || Array.isArray(x)) return {};
    const out: Record<string, BoardPrefs> = {};
    for (const [id, p] of Object.entries(x as Record<string, Partial<BoardPrefs> | null>)) {
      if (p && typeof p === "object") out[id] = { swap: p.swap === true, names: p.names === true };
    }
    return out;
  } catch {
    return {};
  }
}

function writePrefs(all: Record<string, BoardPrefs>) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(all));
  } catch {
    /* storage full or blocked: the choice lasts this visit */
  }
}

export function loadPrefs(id: string): BoardPrefs {
  return readPrefs()[id] ?? DEFAULT_PREFS;
}

export function savePrefs(id: string, prefs: BoardPrefs) {
  const all = readPrefs();
  all[id] = { swap: prefs.swap, names: prefs.names };
  // Only boards still saved keep theirs, so the record cannot grow past the list.
  const kept = new Set(loadIndex().list.map((m) => m.id));
  kept.add(id);
  writePrefs(Object.fromEntries(Object.entries(all).filter(([k]) => kept.has(k))));
}

function dropPrefs(ids: string[]) {
  const all = readPrefs();
  if (!ids.some((id) => id in all)) return;
  for (const id of ids) delete all[id];
  writePrefs(all);
}
