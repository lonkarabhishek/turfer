import { agoWords, instant, istDayNumber } from "../games/when";
import { timeLabel } from "./format";
import type { Resolved } from "./standings";

/**
 * The words of the tournament page's "about" strip, at the foot of its
 * masthead (the site owner, 23 Nov 2026: "who started it, when etc etc
 * nicely"): when it was started, how long it has been running, how many
 * matches were scored live and when it last changed, all from what the
 * page already has (tournament_get's created_at and updated_at, the
 * settings' dates, the fixtures). India's clock and calendar whatever the
 * device's. Nothing is said that the data doesn't say: no "running for"
 * for one that is finished, has its own dates or has gone quiet, no
 * "updated" for one never changed, and no number that isn't a count of
 * its own fixtures. Pure, relative imports only, tested in about.test.ts
 * (npm run test:tournament).
 */

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Said to be running only while it was changed this recently. */
export const QUIET_AFTER_DAYS = 14;

const india = (ms: number) => new Date(ms + IST_MS);

/** India's calendar date at an instant, "2026-11-16". */
export function indiaDate(ms: number): string {
  return india(ms).toISOString().slice(0, 10);
}

/** "16 Nov"; with the year when it is not `now`'s: "16 Nov 2025". */
function dateWords(ms: number, now: number): string {
  const d = india(ms);
  const y = d.getUTCFullYear();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${y === india(now).getUTCFullYear() ? "" : ` ${y}`}`;
}

/** An instant as India read it, in the page's own style: "Sun 22 Nov, 9:14 pm" (with the year when it is not `now`'s). */
export function stampWords(ms: number, now: number): string {
  const d = india(ms);
  return `${WEEKDAYS[d.getUTCDay()]} ${dateWords(ms, now)}, ${timeLabel(`${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`)}`;
}

/**
 * "Started": the day the tournament was put on TapTurf. When the
 * organiser gave it a start date of its own on another day (shown beside
 * it), that day is when it starts and this one is when it was "Set up".
 */
export function startVerb(createdMs: number, starts: string | null): "Started" | "Set up" {
  return starts && starts !== indiaDate(createdMs) ? "Set up" : "Started";
}

/** "today", "yesterday", "16 Nov", "16 Nov 2025". A clock a little behind the server's is today. */
export function startedDay(createdMs: number, now: number): string {
  const days = istDayNumber(now) - istDayNumber(createdMs);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return dateWords(createdMs, now);
}

export type RunningInput = { createdMs: number; updatedMs: number; starts: string | null; ends: string | null; played: number; total: number };

/**
 * "Running for 7 days", "Running for 3 weeks", "Running for 2 months", or
 * null. Said only of a tournament that is running: it has a result and
 * matches still to play, it was changed in the last QUIET_AFTER_DAYS days,
 * it started at least 2 days ago (India's days), and the organiser set no
 * dates of their own (the page shows those instead).
 */
export function runningWords(x: RunningInput, now: number): string | null {
  if (x.starts || x.ends) return null;
  if (x.played <= 0 || x.played >= x.total) return null;
  if (istDayNumber(now) - istDayNumber(x.updatedMs) > QUIET_AFTER_DAYS) return null;
  const days = istDayNumber(now) - istDayNumber(x.createdMs);
  if (days < 2) return null;
  if (days < 14) return `Running for ${days} days`;
  if (days < 60) return `Running for ${Math.floor(days / 7)} weeks`;
  return `Running for ${Math.floor(days / 30)} months`;
}

/** "4 of 4 matches played", "1 of 1 match played", "No matches yet". */
export function progressWords(played: number, total: number): string {
  if (total <= 0) return "No matches yet";
  return `${Math.max(0, Math.min(played, total))} of ${total} ${total === 1 ? "match" : "matches"} played`;
}

/** How many fixtures were scored ball by ball on the Live Cricket Scorer: finished from their live scorecard (or with its result kept), or being scored now. */
export function scoredLiveCount(fixtures: readonly Pick<Resolved, "fixture" | "state" | "source">[]): number {
  return fixtures.filter((r) => r.state === "live" || (r.state === "done" && (r.source === "live" || !!r.fixture.liveResult))).length;
}

/** "3 scored live"; "All 4 scored live" when every match is played and each was; null for none. */
export function scoredLiveWords(n: number, played: number, total: number): string | null {
  if (n <= 0 || total <= 0) return null;
  if (total > 1 && played >= total && n >= total) return `All ${total} scored live`;
  return `${Math.min(n, total)} scored live`;
}

export type Updated = { text: string; stamp: string | null; iso: string };

/**
 * "Updated 2 h ago" with "Sun 22 Nov, 9:14 pm" behind it; from a week on
 * the day says it all: "Updated Mon 9 Nov, 3:40 pm". null for a
 * tournament not changed since it was made (within a minute of it).
 */
export function updatedWords(createdMs: number, updatedMs: number, now: number): Updated | null {
  if (updatedMs - createdMs < 60_000) return null;
  const iso = new Date(updatedMs).toISOString();
  const stamp = stampWords(updatedMs, now);
  if (now - updatedMs >= DAY_MS && istDayNumber(now) - istDayNumber(updatedMs) > 6) return { text: `Updated ${stamp}`, stamp: null, iso };
  return { text: `Updated ${agoWords(updatedMs, now)}`, stamp, iso };
}

export type About = {
  /** "Started 16 Nov", "Started today", "Set up 10 Nov". */
  started: string;
  /** The same before a name: "Started 16 Nov by". */
  startedBy: string;
  startedIso: string;
  /** "Mon 16 Nov, 6:02 pm": the tooltip of the day. */
  startedStamp: string;
  running: string | null;
  scoredLive: string | null;
  updated: Updated | null;
  /** "4 of 4 matches played" */
  progress: string;
};

export type AboutInput = { createdAt: string; updatedAt: string; starts: string | null; ends: string | null; played: number; total: number; scoredLive: number };

/** Everything the strip says, for one moment. null when the tournament's own times can't be read (it then says nothing). */
export function aboutOf(x: AboutInput, now: number): About | null {
  const createdMs = instant(x.createdAt);
  if (createdMs === null) return null;
  const updatedMs = instant(x.updatedAt) ?? createdMs;
  const started = `${startVerb(createdMs, x.starts)} ${startedDay(createdMs, now)}`;
  return {
    started,
    startedBy: `${started} by`,
    startedIso: new Date(createdMs).toISOString(),
    startedStamp: stampWords(createdMs, now),
    running: runningWords({ createdMs, updatedMs, starts: x.starts, ends: x.ends, played: x.played, total: x.total }, now),
    scoredLive: scoredLiveWords(x.scoredLive, x.played, x.total),
    updated: updatedWords(createdMs, updatedMs, now),
    progress: progressWords(x.played, x.total),
  };
}

/** The strip's facts in order, without the day when a name's line already says it: ["Started 16 Nov", "Running for 7 days", "3 scored live"]. */
export function aboutFacts(a: About, named: boolean): string[] {
  return [named ? null : a.started, a.running, a.scoredLive].filter((x): x is string => !!x);
}
