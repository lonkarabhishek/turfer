/**
 * The admin's view of how the map is used (admin_map_usage,
 * supabase/migrations/20261102_map_views.sql): today, the last 7 and 30
 * India days, every one of the last 30 days, and the signed-in people who
 * used it. Read defensively: a field that is missing or not a number is 0,
 * a person without an id is left out; an answer that isn't one at all is
 * null. Never a phone number or an email (the database sends none). Pure,
 * no imports (npm run test:list).
 */

/** One stretch's numbers. visitors: one per browser per India day, added up. signedPeople: accounts that used it in the stretch. */
export type MapCounts = { views: number; visitors: number; signedViews: number; signedPeople: number; taps: number; minis: number };
export type MapDay = { day: string; views: number; visitors: number; signedViews: number; taps: number; minis: number };
export type MapPerson = {
  id: string;
  name: string | null;
  username: string | null;
  views: number;
  taps: number;
  minis: number;
  /** On how many India days. */
  days: number;
  firstAt: number | null;
  lastAt: number | null;
};
export type MapUsage = {
  /** India's day the numbers were read on ("2026-11-02"). */
  today: string;
  /** The first day anything was counted; null before the first. */
  since: string | null;
  totals: { today: MapCounts; d7: MapCounts; d30: MapCounts };
  /** The last 30 days, oldest first, a day with none as 0. */
  daily: MapDay[];
  /** The signed-in people, most recent use first (at most as many as were asked for). */
  people: MapPerson[];
  /** How many signed-in people used it in all (more than people.length when the list was cut short). */
  peopleTotal: number;
};

/** One person's use of the map, for the people list ("Used the map"). */
export type MapUse = Pick<MapPerson, "views" | "taps" | "minis" | "days" | "firstAt" | "lastAt">;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const num = (x: unknown): number => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};
const str = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);
const time = (x: unknown): number | null => {
  const t = typeof x === "string" ? Date.parse(x) : NaN;
  return Number.isFinite(t) ? t : null;
};
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

function counts(x: unknown): MapCounts {
  const o = obj(x);
  const views = num(o.views);
  return {
    views,
    visitors: Math.min(num(o.visitors), views),
    signedViews: Math.min(num(o.signed_views), views),
    signedPeople: num(o.signed_people),
    taps: num(o.taps),
    minis: num(o.minis),
  };
}

/** admin_map_usage's answer, or null when it isn't one. */
export function toMapUsage(data: unknown): MapUsage | null {
  const d = obj(data);
  const today = str(d.today);
  if (!today || !DAY_RE.test(today) || !d.totals || typeof d.totals !== "object") return null;
  const t = obj(d.totals);
  const daily = (Array.isArray(d.daily) ? d.daily : [])
    .map((x) => {
      const o = obj(x);
      const day = str(o.day);
      if (!day || !DAY_RE.test(day)) return null;
      const views = num(o.views);
      return { day, views, visitors: Math.min(num(o.visitors), views), signedViews: Math.min(num(o.signed_views), views), taps: num(o.taps), minis: num(o.minis) };
    })
    .filter((x): x is MapDay => x !== null)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const people = (Array.isArray(d.people) ? d.people : [])
    .map((x): MapPerson | null => {
      const o = obj(x);
      const id = str(o.user_id);
      if (!id) return null;
      return { id: id.toLowerCase(), name: str(o.name), username: str(o.username), views: num(o.views), taps: num(o.taps), minis: num(o.minis), days: num(o.days), firstAt: time(o.first_at), lastAt: time(o.last_at) };
    })
    .filter((x): x is MapPerson => x !== null);
  const since = str(d.since);
  return {
    today,
    since: since && DAY_RE.test(since) ? since : null,
    totals: { today: counts(t.today), d7: counts(t.d7), d30: counts(t.d30) },
    daily,
    people,
    peopleTotal: Math.max(num(d.people_total), people.length),
  };
}

/**
 * Each account's use of the map, for the people list: their numbers, null
 * for someone who never used it (said only when the list holds everyone
 * who did), and no entry at all (undefined) when it can't say.
 */
export function mapUseById(usage: MapUsage | null): { get: (id: string) => MapUse | null | undefined } {
  if (!usage) return { get: () => undefined };
  const by = new Map(usage.people.map((p) => [p.id, p]));
  const whole = usage.people.length >= usage.peopleTotal;
  return {
    get: (id) => {
      const p = by.get(id.toLowerCase());
      if (p) return { views: p.views, taps: p.taps, minis: p.minis, days: p.days, firstAt: p.firstAt, lastAt: p.lastAt };
      return whole ? null : undefined;
    },
  };
}

const n = (x: number) => x.toLocaleString("en-IN");
const count = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

/** The Map fold's line while closed. */
export function mapLine(u: MapUsage): string {
  if (!u.since) return "Counting views of the map from today";
  const { today, d7 } = u.totals;
  return `${count(today.views, "view")} today · ${n(d7.views)} in 7 days · ${count(d7.signedPeople, "person", "people")} signed in this week`;
}

/** What one person did on the map, in a few words: "3 views, 1 card opened, 1 turf page map". */
export function mapUseText(m: Pick<MapUse, "views" | "taps" | "minis">): string {
  const parts = [m.views ? count(m.views, "view") : null, m.taps ? count(m.taps, "card opened", "cards opened") : null, m.minis ? count(m.minis, "turf page map") : null].filter(Boolean);
  return parts.length ? parts.join(", ") : "Opened it";
}
