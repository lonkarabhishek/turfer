import type { Innings, ResultChoice } from "../cricket/nrr";
import { allowedPlayoffs, makeFixtures, type NewFixture } from "./fixtures";
import {
  DEFAULT_TOURNAMENT_POINTS,
  LIVE_LINK_CODE_RE,
  MAX_FIXTURES,
  MAX_OVERS,
  MAX_ROUND,
  MAX_SERIES,
  MAX_TEAMS,
  MAX_WICKETS,
  MIN_TEAMS,
  NAME_MAX,
  SHORT_MAX,
  TEAM_MAX,
  TOURNAMENT_SECRET_RE,
  type ManualResult,
  type Op,
  type Settings,
  type Slot,
  type Stage,
  type Venue,
} from "./types";

/**
 * What a tournament's create and change requests may carry, read field by
 * field from a whitelist, the same in the organiser's browser (to say
 * what is wrong before sending) and in the routes (which trust nothing
 * else). The database checks the same limits again
 * (20261102_live_tournaments.sql). Pure, relative imports only, tested in
 * payload.test.ts (npm run test:tournament).
 */

/** Control characters out, spaces single, trimmed and cut: anything typed by anyone. */
export function cleanText(x: unknown, max: number): string {
  return String(typeof x === "string" ? x : "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const int = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isInteger(x) && x >= lo && x <= hi ? x : null);

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
const SHORT_RE = /^[A-Z0-9]{1,4}$/;

/** A real day as YYYY-MM-DD, between 2020 and 2100; else null. */
export function readDay(x: unknown): string | null {
  if (typeof x !== "string" || !DAY_RE.test(x)) return null;
  const d = new Date(`${x}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x && x >= "2020-01-01" && x <= "2100-12-31" ? x : null;
}

export const readTime = (x: unknown): string | null => (typeof x === "string" && TIME_RE.test(x) ? x : null);

/** A short code as typed: letters and digits, upper case, up to four; empty is none. */
export function readShort(x: unknown): string | null {
  const s = cleanText(x, 12).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, SHORT_MAX);
  return SHORT_RE.test(s) ? s : null;
}

function readVenue(x: unknown): Venue | null {
  if (!x || typeof x !== "object") return null;
  const v = x as Record<string, unknown>;
  const id = typeof v.id === "string" && UUID_RE.test(v.id) ? v.id.toLowerCase() : null;
  const name = cleanText(v.name, 80);
  if (!id || !name) return null;
  const slug = typeof v.slug === "string" && SLUG_RE.test(v.slug) ? v.slug : null;
  return { id, slug, name, area: cleanText(v.area, 60) || null };
}

/** Settings, every field filled in and within limits, or null for a format it does not know. teams: how many, for the playoffs it allows. */
export function readSettings(x: unknown, teams: number): Settings | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown>;
  const format = s.format === "league" || s.format === "bilateral" || s.format === "tri" ? s.format : null;
  if (!format) return null;
  const p = (s.points && typeof s.points === "object" ? s.points : {}) as Record<string, unknown>;
  const pts = (k: keyof typeof DEFAULT_TOURNAMENT_POINTS) => int(p[k], 0, 99) ?? DEFAULT_TOURNAMENT_POINTS[k];
  const playoffs = s.playoffs === "final" || s.playoffs === "semis" ? s.playoffs : "none";
  const starts = readDay(s.starts);
  const ends = readDay(s.ends);
  return {
    format,
    legs: s.legs === 2 ? 2 : 1,
    matches: format === "bilateral" ? (int(s.matches, 1, MAX_SERIES) ?? 3) : 0,
    playoffs: allowedPlayoffs({ format }, teams).includes(playoffs) ? playoffs : "none",
    overs: s.overs === null ? null : (int(s.overs, 1, MAX_OVERS) ?? 6),
    points: { win: pts("win"), tie: pts("tie"), nr: pts("nr"), loss: pts("loss") },
    venue: readVenue(s.venue),
    starts,
    ends: ends && (!starts || ends >= starts) ? ends : null,
  };
}

/** How many teams a format takes. */
export function teamRange(format: Settings["format"]): [number, number] {
  return format === "bilateral" ? [2, 2] : format === "tri" ? [3, 3] : [3, MAX_TEAMS];
}

const key = (s: string) => s.toLowerCase();

/** The teams as typed: names cleaned, none blank or twice (any case), short codes upper case. */
export function readTeams(x: unknown): { ok: { name: string; short: string | null }[] } | { error: "teams" | "team_names" } {
  if (!Array.isArray(x) || x.length < MIN_TEAMS || x.length > MAX_TEAMS) return { error: "teams" };
  const out = x.map((t) => {
    const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
    return { name: cleanText(o.name, TEAM_MAX), short: readShort(o.short) };
  });
  if (out.some((t) => !t.name) || new Set(out.map((t) => key(t.name))).size !== out.length) return { error: "team_names" };
  return { ok: out };
}

/** One side's runs, wickets and legal balls (and whether it was bowled out), within what a match can hold. */
export function readInnings(x: unknown): Innings | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const runs = int(o.runs, 0, 999);
  const wickets = int(o.wickets, 0, MAX_WICKETS);
  const balls = int(o.balls, 0, MAX_OVERS * 6 * 2);
  if (runs === null || wickets === null || balls === null) return null;
  return { runs, wickets, balls, allOut: o.allOut === true };
}

const CHOICES: readonly ResultChoice[] = ["auto", "a", "b", "tie", "nr"];

export function readResult(x: unknown): ManualResult | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const a = readInnings(o.a);
  const b = readInnings(o.b);
  const result = CHOICES.find((c) => c === o.result);
  if (!a || !b || !result) return null;
  // The sender's words for the margin, when there are any (lib/tournament/types.ts ManualResult).
  const text = cleanText(o.text, 120);
  return { a, b, result, battedFirst: o.battedFirst === "b" ? "b" : "a", ...(text ? { text } : {}) };
}

const STAGES: readonly Stage[] = ["league", "semi", "final"];
const SLOTS: readonly Slot[] = ["s1", "s2", "f"];
const teamOrNull = (x: unknown, teams: number) => (x === null || x === undefined ? null : int(x, 1, teams));

/** Fixtures as the organiser's browser made them: ids 1 up, each once; league ones with two different teams. */
export function readFixtures(x: unknown, teams: number): NewFixture[] | null {
  if (!Array.isArray(x) || x.length > MAX_FIXTURES) return null;
  const seen = new Set<number>();
  const out: NewFixture[] = [];
  for (const raw of x) {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const id = int(o.id, 1, MAX_FIXTURES);
    const stage = STAGES.find((s) => s === o.stage);
    const slot = o.slot === null || o.slot === undefined ? null : (SLOTS.find((s) => s === o.slot) ?? undefined);
    const round = int(o.round, 1, MAX_ROUND);
    const seq = int(o.seq, 0, 999);
    const home = teamOrNull(o.home, teams);
    const away = teamOrNull(o.away, teams);
    if (id === null || seen.has(id) || !stage || slot === undefined || round === null || seq === null) return null;
    if ((o.home != null && home === null) || (o.away != null && away === null)) return null;
    if (home !== null && home === away) return null;
    if (stage === "league" && (home === null || away === null)) return null;
    const result = o.result == null ? null : readResult(o.result);
    if (o.result != null && !result) return null;
    seen.add(id);
    out.push({ id, stage, slot: stage === "league" ? null : slot, round, seq, home, away, day: readDay(o.day), time: readTime(o.time), result });
  }
  return out;
}

export type CreateInput = { secret: string; name: string; settings: Settings; teams: { name: string; short: string | null }[]; fixtures: NewFixture[] };

/** A create request, or the field that is wrong. Without fixtures, they are made from the settings. */
export function readCreate(x: unknown): { ok: CreateInput } | { error: "bad"; field: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const bad = (field: string) => ({ error: "bad" as const, field });
  const secret = typeof o.secret === "string" && TOURNAMENT_SECRET_RE.test(o.secret) ? o.secret : null;
  if (!secret) return bad("secret");
  const name = cleanText(o.name, NAME_MAX);
  if (!name) return bad("name");
  const teams = readTeams(o.teams);
  if ("error" in teams) return bad(teams.error);
  const settings = readSettings(o.settings, teams.ok.length);
  if (!settings) return bad("settings");
  const [lo, hi] = teamRange(settings.format);
  if (teams.ok.length < lo || teams.ok.length > hi) return bad("teams");
  const ids = teams.ok.map((_, i) => i + 1);
  const fixtures = o.fixtures === undefined ? makeFixtures(settings, ids) : readFixtures(o.fixtures, ids.length);
  if (!fixtures || fixtures.length === 0) return bad("fixtures");
  return { ok: { secret, name, settings, teams: teams.ok, fixtures } };
}

/** A change request's secret and change, or the field that is wrong. teams: the tournament's team count, when known (the database checks again). */
export function readOp(x: unknown, teams = MAX_TEAMS): { ok: { secret: string; op: Op } } | { error: "bad"; field: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const bad = (field: string) => ({ error: "bad" as const, field });
  const secret = typeof o.secret === "string" && TOURNAMENT_SECRET_RE.test(o.secret) ? o.secret : null;
  if (!secret) return bad("secret");
  const ok = (op: Op) => ({ ok: { secret, op } });
  const id = int(o.id, 1, MAX_FIXTURES);
  const pin = () => {
    const home = teamOrNull(o.home, teams);
    const away = teamOrNull(o.away, teams);
    if ((o.home != null && home === null) || (o.away != null && away === null) || (home !== null && home === away)) return null;
    return { home, away };
  };
  switch (o.op) {
    case "settings": {
      const name = cleanText(o.name, NAME_MAX);
      const settings = readSettings(o.settings, teams);
      if (!name) return bad("name");
      return settings ? ok({ op: "settings", name, settings }) : bad("settings");
    }
    case "team": {
      const tid = int(o.id, 1, MAX_TEAMS);
      const name = cleanText(o.name, TEAM_MAX);
      if (tid === null) return bad("id");
      return name ? ok({ op: "team", id: tid, name, short: readShort(o.short) }) : bad("name");
    }
    case "fixture_add":
    case "fixture_edit": {
      const round = int(o.round, 1, MAX_ROUND);
      const p = pin();
      if (round === null) return bad("round");
      if (!p) return bad("teams");
      const when = { day: readDay(o.day), time: readTime(o.time) };
      if (o.op === "fixture_edit") return id === null ? bad("id") : ok({ op: "fixture_edit", id, round, ...p, ...when });
      const stage = STAGES.find((s) => s === o.stage) ?? "league";
      const slot = stage === "league" ? null : (SLOTS.find((s) => s === o.slot) ?? null);
      if (stage === "league" && (p.home === null || p.away === null)) return bad("teams");
      return ok({ op: "fixture_add", stage, slot, round, ...p, ...when });
    }
    case "fixture_remove":
      return id === null ? bad("id") : ok({ op: "fixture_remove", id });
    case "live_unlink":
      return id === null ? bad("id") : ok({ op: "live_unlink", id });
    case "fixture_order": {
      const ids = Array.isArray(o.ids) ? o.ids.map((v) => int(v, 1, MAX_FIXTURES)) : [];
      if (!ids.length || ids.length > MAX_FIXTURES || ids.some((v) => v === null) || new Set(ids).size !== ids.length) return bad("ids");
      return ok({ op: "fixture_order", ids: ids as number[] });
    }
    case "result": {
      if (id === null) return bad("id");
      const result = o.result === null ? null : readResult(o.result);
      if (o.result !== null && !result) return bad("result");
      const p = pin();
      return p ? ok({ op: "result", id, result, ...p }) : bad("teams");
    }
    case "live_link": {
      if (id === null) return bad("id");
      const liveCode = typeof o.liveCode === "string" && LIVE_LINK_CODE_RE.test(o.liveCode) ? o.liveCode : null;
      const p = pin();
      if (!liveCode) return bad("liveCode");
      return p ? ok({ op: "live_link", id, liveCode, ...p }) : bad("teams");
    }
    case "remove":
      return ok({ op: "remove" });
    default:
      return bad("op");
  }
}
