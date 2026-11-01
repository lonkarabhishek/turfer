import { TOURNAMENT_CODE_RE, TOURNAMENT_SECRET_RE } from "./types";

/**
 * The organiser's record of their live tournaments, in this browser's
 * localStorage under TOURNAMENTS_KEY: per code, the secret that lets this
 * browser change it, its name (for the Me tab), when it was kept here, and
 * the account it was last kept with (acct), so it is offered to the
 * account once. And the hand-off "Score live" leaves for the Live Cricket
 * Scorer (SCORE_HANDOFF_KEY): which fixture, its teams and overs, and,
 * once the scorer has made its match, that match and the live code linked.
 * Pure but for the storage wrappers at the end (which never throw);
 * relative imports only, tested in store.test.ts (npm run test:tournament).
 */

export const TOURNAMENTS_KEY = "tapturf_tournaments_v1";
export const SCORE_HANDOFF_KEY = "tapturf_tournament_score_v1";
/** Kept here at most; the oldest go first. */
export const STORE_MAX = 30;
/** A "Score live" hand-off is taken by the scorer within this long, or not at all. */
export const HANDOFF_FOR_MS = 30 * 60_000;

export type StoreEntry = { secret: string; name: string; at: number; acct?: string };
export type Store = { v: 1; list: Record<string, StoreEntry> };

const EMPTY: Store = { v: 1, list: {} };

/** The record as stored; anything malformed is left out, never thrown. */
export function readStore(raw: string | null): Store {
  if (!raw) return { v: 1, list: {} };
  try {
    const o = JSON.parse(raw) as { list?: unknown };
    const list: Record<string, StoreEntry> = {};
    if (o && typeof o === "object" && o.list && typeof o.list === "object") {
      for (const [code, v] of Object.entries(o.list as Record<string, unknown>)) {
        const e = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
        if (!TOURNAMENT_CODE_RE.test(code) || typeof e.secret !== "string" || !TOURNAMENT_SECRET_RE.test(e.secret)) continue;
        list[code] = {
          secret: e.secret,
          name: typeof e.name === "string" ? e.name.slice(0, 60) : "",
          at: typeof e.at === "number" && Number.isFinite(e.at) ? e.at : 0,
          ...(typeof e.acct === "string" && e.acct.length <= 64 ? { acct: e.acct } : {}),
        };
      }
    }
    return { v: 1, list };
  } catch {
    return { v: 1, list: {} };
  }
}

/** The record with this tournament kept (or changed), the newest STORE_MAX only. */
export function keep(s: Store, code: string, e: StoreEntry): Store {
  const all = Object.entries({ ...s.list, [code]: e })
    .sort((x, y) => y[1].at - x[1].at)
    .slice(0, STORE_MAX);
  return { v: 1, list: Object.fromEntries(all) };
}

/** What "Score live" hands the Live Cricket Scorer. */
export type ScoreHandoff = {
  code: string;
  fixture: number;
  /** The tournament's name and the match's number, for the scorer's title. */
  title: string;
  teamA: string;
  teamB: string;
  overs: number;
  venue: string;
  /** The teams to pin on the fixture when it is linked (a playoff filled from the table). */
  home: number | null;
  away: number | null;
  at: number;
  /** Set by the scorer: the match it made for this fixture, and the live code once the fixture is linked to it. */
  matchId?: string;
  linked?: string;
};

export function readHandoff(raw: string | null): ScoreHandoff | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
    const team = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 16 ? x : null);
    if (typeof o.code !== "string" || !TOURNAMENT_CODE_RE.test(o.code)) return null;
    if (typeof o.fixture !== "number" || !Number.isInteger(o.fixture) || o.fixture < 1) return null;
    if (typeof o.at !== "number" || !Number.isFinite(o.at)) return null;
    const teamA = str(o.teamA, 40);
    const teamB = str(o.teamB, 40);
    if (!teamA || !teamB) return null;
    const overs = typeof o.overs === "number" && Number.isInteger(o.overs) && o.overs >= 1 && o.overs <= 50 ? o.overs : 6;
    return {
      code: o.code,
      fixture: o.fixture,
      title: str(o.title, 60),
      teamA,
      teamB,
      overs,
      venue: str(o.venue, 48),
      home: team(o.home),
      away: team(o.away),
      at: o.at,
      ...(typeof o.matchId === "string" && o.matchId.length <= 40 ? { matchId: o.matchId } : {}),
      ...(typeof o.linked === "string" && /^[a-z0-9]{12}$/.test(o.linked) ? { linked: o.linked } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * The hand-off the scorer should take for ?tournament=<code>&fixture=<id>:
 * the one kept for that fixture, made within HANDOFF_FOR_MS and not yet
 * given a match. Anything else is not for this visit.
 */
export function takeHandoff(h: ScoreHandoff | null, code: string | null, fixture: number | null, now: number): ScoreHandoff | null {
  if (!h || !code || fixture === null) return null;
  if (h.code !== code || h.fixture !== fixture || h.matchId) return null;
  return now >= h.at && now - h.at < HANDOFF_FOR_MS ? h : null;
}

/** The scorer's ?tournament=<code>&fixture=<id>, and the query string without them. */
export function readScoreAsk(search: string): { code: string | null; fixture: number | null; rest: string } {
  const q = new URLSearchParams(search);
  const code = q.get("tournament");
  const f = Number(q.get("fixture"));
  q.delete("tournament");
  q.delete("fixture");
  const rest = q.toString();
  return { code: code && TOURNAMENT_CODE_RE.test(code) ? code : null, fixture: Number.isInteger(f) && f >= 1 && f <= 300 ? f : null, rest: rest ? `?${rest}` : "" };
}

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
const set = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage blocked: this visit still works, it just will not remember */
  }
};

export const loadStore = (): Store => (typeof window === "undefined" ? EMPTY : readStore(get(TOURNAMENTS_KEY)));
export const saveEntry = (code: string, e: StoreEntry) => set(TOURNAMENTS_KEY, JSON.stringify(keep(loadStore(), code, e)));
export const secretFor = (code: string): string | null => loadStore().list[code]?.secret ?? null;
export const loadHandoff = (): ScoreHandoff | null => readHandoff(get(SCORE_HANDOFF_KEY));
export const saveHandoff = (h: ScoreHandoff) => set(SCORE_HANDOFF_KEY, JSON.stringify(h));

/** 32 random bytes as hex: a new organiser secret. */
export function newSecret(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
