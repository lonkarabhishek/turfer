import { medalOf } from "../profile/playerBadge";
import type { TournamentHost } from "./types";

/**
 * Who started a live tournament (the site owner, 23 Nov 2026: "can we
 * also give info of who started it, when etc etc nicely"). The page names
 * the organiser only when they were signed in AND have a public profile
 * right now ("Let others find and tag me" on): the database answers for
 * nobody else and asks that switch again on every read
 * (public.tournament_host, 20261123_tournament_host.sql). This file reads
 * that answer and has the words of the organiser's own line about it.
 * Pure, relative imports only, tested in host.test.ts
 * (npm run test:tournament).
 */

/** What the server's read came to. known false: it could not be asked (no function yet, or the read failed), so nobody is named. */
export type HostRead = { known: boolean; host: TournamentHost | null };

/** Could not be asked: nobody is named, and the organiser's line says nothing. */
export const HOST_UNKNOWN: HostRead = { known: false, host: null };
const NOBODY: HostRead = { known: true, host: null };

// lib/profile/playedWith.ts USERNAME_RE.
const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
export const HOST_NAME_MAX = 60;
const PHOTO_MAX = 900;

/** A name as one line: control characters and runs of space become one space. */
const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * public.tournament_host's answer ({u, name, photo, verified, m, n}, or
 * null) in the app's terms. Anything that is not a public organiser names
 * nobody, never a guess: null (no account, no public profile, taken down,
 * no such tournament), a username that can't be a profile, no name. A
 * refusal ({r}) or something that is no answer at all is "could not be
 * asked". A medal this build doesn't know, or one without a count, is no
 * medal; the person is still named.
 */
export function toHostRead(data: unknown): HostRead {
  if (data === null || data === undefined) return NOBODY;
  if (typeof data !== "object" || Array.isArray(data)) return HOST_UNKNOWN;
  const o = data as Record<string, unknown>;
  if ("r" in o) return HOST_UNKNOWN;
  const name = typeof o.name === "string" ? oneLine(o.name).slice(0, HOST_NAME_MAX).trim() : "";
  if (typeof o.u !== "string" || !USERNAME_RE.test(o.u) || !name) return NOBODY;
  const photo = typeof o.photo === "string" && o.photo.length <= PHOTO_MAX && /^(https:\/\/|\/avatars\/)/.test(o.photo) ? o.photo : null;
  const medal = typeof o.m === "string" ? medalOf(o.m) : null;
  const n = o.n;
  const counted = !!medal && typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 99;
  return { known: true, host: { username: o.u, name, photo, verified: o.verified === true, medal: counted ? medal.id : null, medals: counted ? (n as number) : 0 } };
}

/**
 * How old the server's shared copy of the answer may be and still be
 * shown. Next's data cache hands back a copy past its 30 seconds while it
 * fetches a new one behind it, however long nobody has asked; a name must
 * not come from one of those. A copy older than this is asked again
 * before anything is shown, so a profile switched off is gone from the
 * page's next load within this long, whether or not anyone opened it in
 * between.
 */
export const HOST_COPY_MAX_MS = 90_000;

/** Whether a copy made at `at` may still be shown at `now` (a time that is not one, or one from a clock ahead of ours, may not). */
export function hostCopyFresh(at: unknown, now: number): boolean {
  return typeof at === "number" && Number.isFinite(at) && at <= now + 5_000 && now - at <= HOST_COPY_MAX_MS;
}

/** Whether two answers show the same thing (an open page takes a poll's answer only when it differs). */
export function sameHost(a: TournamentHost | null | undefined, b: TournamentHost | null | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a === null || b === null) return a === b;
  return a.username === b.username && a.name === b.name && a.photo === b.photo && a.verified === b.verified && a.medal === b.medal && a.medals === b.medals;
}

/** Where "Let others find and tag me" is, and where a username is picked. */
export const HOST_LINKS = { switch: "/dashboard?tab=profile#find-and-tag", username: "/dashboard?tab=profile#username" } as const;
/** The switch, by the name the Me tab gives it. */
export const HOST_SWITCH_NAME = "Let others find and tag me";

/** The organiser's own line: what the page shows of them, then (when there is something they can do) a link. */
export type HostNote = { text: string; link: { href: string; label: string } | null };

/**
 * The one line in the organiser's controls about their name on the page.
 * host: what the page was served (undefined: it could not be asked, so
 * there is no line at all). me: the person signed in on this device, if
 * anyone. It says what is shown and why, and where the switch is; there is
 * no setting here.
 */
export function hostNote(host: TournamentHost | null | undefined, me: { username?: string | null; taggable?: boolean | null } | null): HostNote | null {
  if (host === undefined) return null;
  if (host) {
    if (me?.username && me.username === host.username)
      return { text: `Your name and photo show on this page, linked to your profile, because your profile is public. To hide them, turn off “${HOST_SWITCH_NAME}”.`, link: { href: HOST_LINKS.switch, label: "Open that switch" } };
    return { text: `This page says ${host.name} started it, because that profile is public.`, link: null };
  }
  if (!me) return { text: "This page shows no name for who started it. If you sign in and your profile is public, it will show yours.", link: null };
  if (!me.username) return { text: "This page shows no name for who started it: you have no public profile.", link: { href: HOST_LINKS.username, label: "Pick a username" } };
  if (me.taggable === false) return { text: `This page shows no name for who started it, because your profile isn’t public (“${HOST_SWITCH_NAME}” is off).`, link: { href: HOST_LINKS.switch, label: "Open that switch" } };
  return { text: "This page shows no name for who started it.", link: null };
}
