import { byesIn } from "./fixtures";
import type { Resolved } from "./standings";
import type { Fixture, Team } from "./types";

/**
 * Words for the tournament page: days and times as India writes them, a
 * fixture's name, the fixtures grouped by day (when the organiser set
 * days) or by round, and the share text. Pure, relative imports only,
 * tested in format.test.ts (npm run test:tournament).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const parts = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  return { wd: DAYS[d.getUTCDay()], d: d.getUTCDate(), m: MONTHS[d.getUTCMonth()], y: d.getUTCFullYear() };
};

/** "Sat 8 Nov" */
export function dayLabel(day: string): string {
  const p = parts(day);
  return `${p.wd} ${p.d} ${p.m}`;
}

/** "7:30 pm", "12 noon" for 12:00. */
export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  if (h === 12 && m === 0) return "12 noon";
  const ap = h >= 12 ? "pm" : "am";
  const hh = ((h + 11) % 12) + 1;
  return m ? `${hh}:${String(m).padStart(2, "0")} ${ap}` : `${hh} ${ap}`;
}

/** "8 to 15 Nov", "28 Nov to 3 Dec", "From 8 Nov", "Until 15 Nov", or null. */
export function rangeLabel(starts: string | null, ends: string | null): string | null {
  if (starts && ends && starts !== ends) {
    const a = parts(starts);
    const b = parts(ends);
    return a.m === b.m && a.y === b.y ? `${a.d} to ${b.d} ${b.m}` : `${a.d} ${a.m} to ${b.d} ${b.m}`;
  }
  if (starts) return ends ? `${parts(starts).d} ${parts(starts).m}` : `From ${parts(starts).d} ${parts(starts).m}`;
  return ends ? `Until ${parts(ends).d} ${parts(ends).m}` : null;
}

/** A fixture's name: "Match 3" (its place among the league matches), "Semi-final 1", "Final". */
export function fixtureTitle(f: Pick<Fixture, "id" | "stage" | "slot">, all: Pick<Fixture, "id" | "stage" | "seq">[]): string {
  if (f.stage === "final") return "Final";
  if (f.stage === "semi") return f.slot === "s2" ? "Semi-final 2" : "Semi-final 1";
  const league = all.filter((x) => x.stage === "league").sort((a, b) => a.seq - b.seq || a.id - b.id);
  return `Match ${league.findIndex((x) => x.id === f.id) + 1}`;
}

export type Group = { key: string; title: string; items: Resolved[]; byes: number[] };

/**
 * The fixtures in groups for the Matches list: by day when any has one
 * (days in order, those without one last), else by round (a series is
 * one list), the playoffs after the league. Each group keeps the
 * organiser's order. byes: teams with no league match in that round.
 */
export function groupFixtures(list: Resolved[], teams: Team[], series: boolean): Group[] {
  const ids = teams.map((t) => t.id);
  const fixtures = list.map((r) => r.fixture);
  const groups = new Map<string, Group>();
  const add = (key: string, title: string, r: Resolved, byes: number[] = []) => {
    const g = groups.get(key) ?? { key, title, items: [], byes };
    g.items.push(r);
    groups.set(key, g);
  };
  const dated = list.some((r) => r.fixture.day);
  for (const r of list) {
    const f = r.fixture;
    if (dated) add(f.day ? `d:${f.day}` : "d:~", f.day ? dayLabel(f.day) : "Date to be set", r);
    else if (f.stage === "semi") add("p:semi", "Semi-finals", r);
    else if (f.stage === "final") add("p:final", "Final", r);
    else if (series) add("r:all", "Matches", r);
    else add(`r:${String(f.round).padStart(3, "0")}`, `Round ${f.round}`, r, byesIn(fixtures, f.round, ids));
  }
  const rank = (k: string) => (k.startsWith("p:semi") ? "y" : k.startsWith("p:final") ? "z" : k);
  return [...groups.values()].sort((a, b) => (rank(a.key) < rank(b.key) ? -1 : rank(a.key) > rank(b.key) ? 1 : 0));
}

/** What Share sends: names the tournament, says what is there, ends with the link. */
export function shareText(name: string, url: string): string {
  return `Follow ${name} on TapTurf: the points table, fixtures, results and live scores.\n${url}`;
}
