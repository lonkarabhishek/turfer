import { readDay, readInnings, readResult, readSettings, readTime } from "./payload";
import type { Fixture, LiveResult, MineItem, Op, Slot, Stage, Team, Tournament } from "./types";

/** A change as tournament_update takes it: its name and its data, in the database's words. */
export function opData(op: Op): { p_op: string; p_data: Record<string, unknown> } {
  switch (op.op) {
    case "live_link":
      return { p_op: op.op, p_data: { id: op.id, live_code: op.liveCode, home: op.home ?? null, away: op.away ?? null } };
    case "remove":
      return { p_op: op.op, p_data: {} };
    default: {
      const { op: name, ...rest } = op;
      return { p_op: name, p_data: rest };
    }
  }
}

/**
 * The database's answers (20261102_live_tournaments.sql) in the app's
 * terms, rebuilt field by field: tournament_get's tournament, a kept live
 * result, tournament_mine's list and the change functions' answers. A row
 * that is not well formed throws, so a bad read is never cached as "not
 * found". Pure, relative imports only, tested in read.test.ts
 * (npm run test:tournament).
 */

const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const iso = (x: unknown): string => {
  const t = typeof x === "string" ? Date.parse(x) : NaN;
  if (!Number.isFinite(t)) throw new Error("tournament read: bad time");
  return new Date(t).toISOString();
};
const STAGES: readonly Stage[] = ["league", "semi", "final"];
const SLOTS: readonly Slot[] = ["s1", "s2", "f"];

/** A kept live result, or null when there is none or it is not one. */
export function toLiveResult(x: unknown): LiveResult | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const side = (v: unknown) => {
    const inn = readInnings(v);
    const name = str((v as { name?: unknown } | null)?.name, 40);
    return inn && name ? { ...inn, name } : null;
  };
  const a = side(o.a);
  const b = side(o.b);
  const outcome = o.outcome === "a" || o.outcome === "b" || o.outcome === "tie" || o.outcome === "nr" ? o.outcome : null;
  if (!a || !b || !outcome) return null;
  return { a, b, outcome, battedFirst: o.battedFirst === "b" ? "b" : "a", text: str(o.text, 120) };
}

/** tournament_get's answer: the tournament, or null for none. Throws on a row that is not one. */
export function toTournament(data: unknown): Tournament | null {
  if (data == null) return null;
  const d = (typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (d.r === "unavailable") throw new Error("tournament read: unavailable");
  const code = str(d.code, 12);
  const rev = Number(d.rev);
  if (!/^[a-z0-9]{12}$/.test(code) || !Number.isSafeInteger(rev)) throw new Error("tournament read: unexpected row");
  if (d.status === "removed") {
    const at = iso(d.updated_at);
    return { code, status: "removed", name: "", settings: readSettings({ format: "league" }, 0)!, teams: [], fixtures: [], rev, createdAt: at, updatedAt: at };
  }
  if (d.status !== "on" || !Array.isArray(d.teams) || !Array.isArray(d.fixtures)) throw new Error("tournament read: unexpected row");
  const teams: Team[] = d.teams.map((t) => {
    const o = (t ?? {}) as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id)) throw new Error("tournament read: bad team");
    return { id, name: str(o.name, 30), short: typeof o.short === "string" && o.short ? o.short.slice(0, 4) : null };
  });
  const settings = readSettings(d.settings, teams.length);
  if (!settings) throw new Error("tournament read: bad settings");
  const fixtures: Fixture[] = d.fixtures.map((f) => {
    const o = (f ?? {}) as Record<string, unknown>;
    const id = Number(o.id);
    const stage = STAGES.find((s) => s === o.stage);
    if (!Number.isInteger(id) || !stage) throw new Error("tournament read: bad fixture");
    const team = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
    return {
      id,
      stage,
      slot: SLOTS.find((s) => s === o.slot) ?? null,
      round: Number(o.round) || 1,
      seq: Number(o.seq) || 0,
      home: team(o.home),
      away: team(o.away),
      day: readDay(o.day),
      time: readTime(o.time),
      result: o.result == null ? null : readResult(o.result),
      live: typeof o.live === "string" && /^[a-z0-9]{12}$/.test(o.live) ? o.live : null,
      liveResult: toLiveResult(o.live_result),
    };
  });
  return { code, status: "on", name: str(d.name, 60), settings, teams, fixtures, rev, createdAt: iso(d.created_at), updatedAt: iso(d.updated_at) };
}

/** tournament_mine's list. */
export function toMine(data: unknown): MineItem[] {
  const list = Array.isArray((data as { list?: unknown } | null)?.list) ? ((data as { list: unknown[] }).list as Record<string, unknown>[]) : [];
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return list
    .filter((x) => x && typeof x.code === "string" && /^[a-z0-9]{12}$/.test(x.code))
    .map((x) => ({
      code: x.code as string,
      name: str(x.name, 60),
      format: x.format === "bilateral" || x.format === "tri" ? x.format : "league",
      status: x.status === "removed" ? "removed" : "on",
      teams: n(x.teams),
      fixtures: n(x.fixtures),
      played: n(x.played),
      createdAt: typeof x.created_at === "string" ? x.created_at : "",
      updatedAt: typeof x.updated_at === "string" ? x.updated_at : "",
    }));
}
