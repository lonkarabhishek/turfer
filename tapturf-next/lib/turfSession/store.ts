import { normalizeRules } from "../cricket/scoring";
import type { Innings } from "../cricket/nrr";
import type { Venue } from "../tournament/types";
import { MAX_MATCHES, MAX_PLAN } from "./plan";
import { NAME_MAX, PLAYERS_MAX, SIDE_NAME_MAX, type GameAsk } from "./names";
import { emptyLive } from "./session";
import type { BatLine, BowlLine, LiveError, LiveState, MatchResult, Session, SessionMatch, Side, SideKey } from "./types";

/**
 * Where turf sessions are kept: this browser's localStorage, read back
 * field by field (anything that does not look right is left out, never
 * thrown). STORE_KEY does not start with "tapturf_scorer", so the Live
 * Cricket Scorer's storage listener leaves it alone. ASK_KEY is the game
 * page's hand-off ("Score this game"). Pure but for the storage wrappers
 * at the end (which never throw); relative imports only, tested in
 * store.test.ts (npm run test:session).
 */

export const STORE_KEY = "tapturf_turf_session_v1";
export const ASK_KEY = "tapturf_turf_session_ask_v1";
export const MAX_SESSIONS = 10;
/** The game page's hand-off is taken within this long, for the same game only. */
export const ASK_FOR_MS = 30 * 60_000;

export type SessionStore = { v: 1; current: string | null; list: Session[] };

const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const int = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi ? x : null);
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const str = (x: unknown, max: number): string => (typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max) : "");
const side = (x: unknown): SideKey | null => (x === "a" || x === "b" ? x : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{1,2}:\d{2}(:\d{2})?$/;
const CODE = /^[a-z0-9]{12}$/;
const SECRET = /^[0-9a-f]{64}$/;
const ID = /^[a-z0-9]{1,40}$/i;

function innings(x: unknown): Innings | null {
  const o = obj(x);
  if (!o) return null;
  const runs = int(o.runs, 0, 999);
  const wickets = int(o.wickets, 0, 30);
  const balls = int(o.balls, 0, 600);
  return runs === null || wickets === null || balls === null ? null : { runs, wickets, balls, allOut: o.allOut === true };
}

function result(x: unknown): MatchResult | null {
  const o = obj(x);
  if (!o) return null;
  const a = innings(o.a);
  const b = innings(o.b);
  const outcome = o.outcome === "a" || o.outcome === "b" || o.outcome === "tie" || o.outcome === "nr" ? o.outcome : null;
  return a && b && outcome ? { a, b, outcome, text: str(o.text, 120) } : null;
}

function lines<T>(x: unknown, read: (row: unknown[]) => T | null): T[] {
  if (!Array.isArray(x)) return [];
  const out: T[] = [];
  for (const row of x.slice(0, 120)) if (Array.isArray(row)) {
    const r = read(row);
    if (r) out.push(r);
  }
  return out;
}

const batLine = (r: unknown[]): BatLine | null => {
  const s = side(r[1]);
  const runs = int(r[2], 0, 999);
  const balls = int(r[3], 0, 600);
  const name = str(r[0], NAME_MAX);
  return name && s && runs !== null && balls !== null ? [name, s, runs, balls, r[4] === true] : null;
};
const bowlLine = (r: unknown[]): BowlLine | null => {
  const s = side(r[1]);
  const w = int(r[2], 0, 30);
  const runs = int(r[3], 0, 999);
  const balls = int(r[4], 0, 600);
  const name = str(r[0], NAME_MAX);
  return name && s && w !== null && runs !== null && balls !== null ? [name, s, w, runs, balls] : null;
};

function match(x: unknown): SessionMatch | null {
  const o = obj(x);
  if (!o) return null;
  const n = int(o.n, 1, MAX_MATCHES);
  const kind = o.kind === "balls" || o.kind === "final" ? o.kind : null;
  const matchId = typeof o.matchId === "string" && ID.test(o.matchId) ? o.matchId : null;
  const battedFirst = side(o.battedFirst);
  const overs = int(o.overs, 1, 100);
  const pps = int(o.playersPerSide, 2, 30);
  if (n === null || !kind || !battedFirst || overs === null || pps === null) return null;
  if (kind === "balls" && !matchId) return null;
  const r = o.result == null ? null : result(o.result);
  if (kind === "final" && !r) return null;
  return {
    n,
    kind,
    matchId: kind === "balls" ? matchId : null,
    battedFirst,
    overs,
    playersPerSide: pps,
    lastManStands: o.lastManStands === true,
    result: r,
    bat: lines(o.bat, batLine),
    bowl: lines(o.bowl, bowlLine),
    balls: int(o.balls, 0, 1200) ?? 0,
    at: num(o.at) ?? 0,
  };
}

function sideOf(x: unknown): Side | null {
  const o = obj(x);
  const name = str(o?.name, SIDE_NAME_MAX).trim();
  if (!o || !name) return null;
  const players = Array.isArray(o.players) ? o.players.map((p) => str(p, NAME_MAX).trim()).filter(Boolean).slice(0, PLAYERS_MAX) : [];
  return { name, players };
}

export function readVenue(x: unknown): Venue | null {
  const o = obj(x);
  if (!o || typeof o.id !== "string" || !UUID.test(o.id)) return null;
  const name = str(o.name, 80).trim();
  if (!name) return null;
  const slug = typeof o.slug === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(o.slug) ? o.slug : null;
  return { id: o.id.toLowerCase(), slug, name, area: str(o.area, 60).trim() || null };
}

const ERRORS: readonly LiveError[] = ["login", "taken", "not_in_game", "limit", "busy", "stopped", "failed"];

function live(x: unknown): LiveState {
  const o = obj(x);
  if (!o) return emptyLive();
  const pushed: Record<string, string> = {};
  const p = obj(o.pushed);
  if (p) for (const [k, v] of Object.entries(p)) if (/^\d{1,2}$/.test(k) && typeof v === "string" && v.length <= 200) pushed[k] = v;
  return {
    want: o.want === true,
    secret: typeof o.secret === "string" && SECRET.test(o.secret) ? o.secret : null,
    code: typeof o.code === "string" && CODE.test(o.code) ? o.code : null,
    pushed,
    teamsPushed: typeof o.teamsPushed === "string" ? o.teamsPushed.slice(0, 80) : null,
    ended: o.ended === true,
    error: ERRORS.find((e) => e === o.error) ?? null,
    follow: typeof o.follow === "string" && CODE.test(o.follow) ? o.follow : null,
  };
}

/** One stored session, or null when it does not look like one. */
export function readSession(x: unknown): Session | null {
  const o = obj(x);
  if (!o || o.v !== 1 || typeof o.id !== "string" || !ID.test(o.id)) return null;
  const createdAt = num(o.createdAt);
  const updatedAt = num(o.updatedAt);
  const format = o.format === "box" || o.format === "cricket" ? o.format : null;
  const day = typeof o.day === "string" && DAY.test(o.day) ? o.day : null;
  const overs = int(o.overs, 1, 50);
  const pps = int(o.playersPerSide, 2, 30);
  const s = obj(o.sides);
  const a = sideOf(s?.a);
  const b = sideOf(s?.b);
  const firstBat = side(o.firstBat);
  if (createdAt === null || updatedAt === null || !format || !day || overs === null || pps === null || !a || !b || !firstBat) return null;
  const g = obj(o.game);
  const game = g && typeof g.id === "string" && UUID.test(g.id) ? { id: g.id.toLowerCase(), start: typeof g.start === "string" && TIME.test(g.start) ? g.start : "", end: typeof g.end === "string" && TIME.test(g.end) ? g.end : "", ...(g.local === true ? { local: true as const } : {}) } : null;
  const matches = Array.isArray(o.matches)
    ? o.matches
        .slice(0, MAX_MATCHES)
        .map(match)
        .filter((m): m is SessionMatch => !!m)
        .map((m, i) => (m.n === i + 1 ? m : { ...m, n: i + 1 }))
    : [];
  return {
    v: 1,
    id: o.id,
    createdAt,
    updatedAt,
    format,
    venue: str(o.venue, 48).trim(),
    turf: readVenue(o.turf),
    day,
    overs,
    playersPerSide: pps,
    rules: normalizeRules(obj(o.rules)),
    pick: o.pick === true,
    sides: { a, b },
    firstBat,
    plan: int(o.plan, 1, MAX_PLAN),
    matches,
    ended: num(o.ended),
    game,
    live: live(o.live),
  };
}

const EMPTY = (): SessionStore => ({ v: 1, current: null, list: [] });

/** The store as kept; anything malformed is left out. */
export function readSessions(raw: string | null): SessionStore {
  if (!raw) return EMPTY();
  try {
    const o = obj(JSON.parse(raw));
    if (!o || o.v !== 1 || !Array.isArray(o.list)) return EMPTY();
    const list = o.list.map(readSession).filter((s): s is Session => !!s);
    const current = typeof o.current === "string" && list.some((s) => s.id === o.current) ? o.current : null;
    return { v: 1, current, list: list.sort((x, y) => y.updatedAt - x.updatedAt).slice(0, MAX_SESSIONS) };
  } catch {
    return EMPTY();
  }
}

/** The store with this session kept (or changed), newest first, 10 at most. The current one is never dropped. */
export function keep(store: SessionStore, s: Session, makeCurrent = true): SessionStore {
  const current = makeCurrent ? s.id : store.current;
  const list = [s, ...store.list.filter((x) => x.id !== s.id)].sort((x, y) => y.updatedAt - x.updatedAt);
  const kept = list.slice(0, MAX_SESSIONS);
  const cur = current ? list.find((x) => x.id === current) : null;
  if (cur && !kept.includes(cur)) kept.splice(MAX_SESSIONS - 1, 1, cur);
  return { v: 1, current, list: kept };
}

export function forget(store: SessionStore, id: string): SessionStore {
  return { v: 1, current: store.current === id ? null : store.current, list: store.list.filter((x) => x.id !== id) };
}

/** The game page's hand-off, for this game and within ASK_FOR_MS; else null. */
export function readAsk(raw: string | null, gameId: string, now: number): GameAsk | null {
  if (!raw) return null;
  try {
    const o = obj(JSON.parse(raw));
    if (!o || o.v !== 1 || typeof o.at !== "number" || now < o.at || now - o.at > ASK_FOR_MS) return null;
    const g = obj(o.game);
    if (!g || typeof g.id !== "string" || g.id.toLowerCase() !== gameId.toLowerCase()) return null;
    const v = obj(o.venue);
    return {
      game: {
        id: g.id.toLowerCase(),
        sport: str(g.sport, 40),
        date: typeof g.date === "string" && DAY.test(g.date) ? g.date : "",
        start: typeof g.start === "string" && TIME.test(g.start) ? g.start : "",
        end: typeof g.end === "string" && TIME.test(g.end) ? g.end : "",
        spots: int(g.spots, 0, 100) ?? 0,
      },
      venue: { name: str(v?.name, 80).trim(), turf: readVenue(v?.turf) },
      names: Array.isArray(o.names) ? o.names.map((n) => str(n, 60).trim()).filter(Boolean).slice(0, 40) : [],
    };
  } catch {
    return null;
  }
}

export const askBody = (ask: GameAsk, now: number) => JSON.stringify({ v: 1, at: now, ...ask });

/* ------------------------------------------------------------------ */
/* Browser storage                                                     */
/* ------------------------------------------------------------------ */

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string): boolean => {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};

export const loadSessions = (): SessionStore => (typeof window === "undefined" ? EMPTY() : readSessions(get(STORE_KEY)));
/** Kept: false when the browser would not save it (private mode, storage full). */
export const saveSessions = (store: SessionStore): boolean => set(STORE_KEY, JSON.stringify(store));
export const loadAsk = (gameId: string, now: number): GameAsk | null => readAsk(get(ASK_KEY), gameId, now);
export const saveAsk = (ask: GameAsk, now: number) => set(ASK_KEY, askBody(ask, now));
export const clearAsk = () => {
  try {
    localStorage.removeItem(ASK_KEY);
  } catch {
    /* ignore */
  }
};

/** Whether this browser keeps what is written: a test write and read. */
export function canStore(): boolean {
  try {
    const k = "tapturf_turf_session_probe";
    localStorage.setItem(k, "1");
    const ok = localStorage.getItem(k) === "1";
    localStorage.removeItem(k);
    return ok;
  } catch {
    return false;
  }
}

/** The session kept for a game on this phone, if any (the newest; a "Score on this phone instead" one too). */
export function sessionForGame(store: SessionStore, gameId: string): Session | null {
  const id = gameId.toLowerCase();
  return store.list.find((s) => s.game?.id === id) ?? null;
}
