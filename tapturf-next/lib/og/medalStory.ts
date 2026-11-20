import { initialsOf } from "../account/avatar";
import { MEDALS, type MedalArt } from "../profile/medals";
import type { PublicPassport } from "../profile/passport";
import { clip, drawable, hash36, ogText } from "./gameCard";
import { medalStoryPath } from "./medalStoryUrl";

export { medalStoryFile, medalStoryPath } from "./medalStoryUrl";

/**
 * A player's medals as a picture for an Instagram story
 * (GET /api/og/medals/<username>, 1080 x 1920; drawn by
 * lib/og/medalStoryDesign.tsx, served by lib/og/medalStoryImage.tsx): what
 * it says, the version its URL carries, that URL, and what the route
 * answers. The owner opens it from "Flaunt my medals"
 * (components/profile/FlauntMedals.tsx) and posts it themselves.
 *
 * - Only what the public profile (/u/<username>) already shows, from
 *   publicPassport: the name, the username, the counts, the best streak
 *   and the earned medals. Never where or when they played, or who with,
 *   and no photo. Only for a profile that is public (the page's own
 *   check); no earned medal, no picture.
 * - Drawn as the game's share card is (lib/og/gameCard.ts): only in the
 *   font next/og bundles, so every line goes through ogText first. A name
 *   the font cannot draw whole (one in Devanagari, say) is left off, never
 *   drawn in part: the username, always plain letters, stands in for it.
 * - A story is not a link: the profile's address is written on it as
 *   text, with one inviting line. Nothing counts down and no number is
 *   made up.
 * - The version is a hash of every line and medal drawn and of the
 *   template, so a URL names one picture. The route draws a URL's picture
 *   only while its version is current (any other redirects to the
 *   current one), so a kept copy is never out of date (STORY_CACHE).
 *
 * Pure (relative imports), so node --test runs it (npm run test:seo).
 */

/** Bump when the drawing changes, so every story URL changes with it. */
export const MEDAL_STORY_TEMPLATE = 1;

/** An Instagram story: 9:16. */
export const MEDAL_STORY_SIZE = { width: 1080, height: 1920 } as const;

/** Instagram's own controls cover about this much of a story, top and bottom: nothing to read is drawn there. */
export const STORY_SAFE = { top: 250, bottom: 340 } as const;

/** The most cells the medal grid has (two rows of five); with more medals than that the last cell says "+N more". */
export const STORY_GRID_MAX = 10;

export type StoryMedal = { id: string; name: string; blurb: string; art: MedalArt };

export type MedalStoryFacts = {
  /** The player's name, or "@asha" when the font cannot draw the name whole. */
  title: string;
  /** "@asha" under a drawn name; null when the username is the title. */
  handle: string | null;
  /** "AR", for the drawn avatar (never their photo: nothing is fetched). */
  initials: string;
  /** Their best medal (publicPassport lists them best first), drawn large. */
  top: StoryMedal;
  /** "TOP MEDAL", or "FIRST MEDAL" when it is the only one. Capitals made here, never by the renderer. */
  topLabel: string;
  /** "12 games · 5 turfs · 2 cities", as the profile's own line; "3 reviews" for someone who only reviewed. */
  brag: string | null;
  /** "Best streak: 6 weeks in a row", from 2 weeks. */
  streak: string | null;
  /** "7 of 16 medals". */
  count: string;
  /** The other earned medals the grid draws, best first. */
  others: StoryMedal[];
  /** "+6 more": earned medals the grid has no room for. */
  more: string | null;
  /** "tapturf.in/u/asha": the profile's address, as text. */
  address: string;
  /** "Earn yours on TapTurf". */
  invite: string;
};

const USERNAME = /^[A-Za-z][A-Za-z0-9_]{2,19}$/;
/** A username as the profile page takes it (any case; the stored one is lower case). */
export const isStoryUsername = (u: unknown): u is string => typeof u === "string" && USERNAME.test(u);

const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;

/** "5 games · 5 turfs · 2 cities", as /u/<username> says it; "3 reviews" with no game played; null with neither. */
export function storyBrag(n: PublicPassport["numbers"]): string | null {
  if (n.games > 0) {
    return [many(n.games, "game", "games"), n.turfs ? many(n.turfs, "turf", "turfs") : null, n.cities ? many(n.cities, "city", "cities") : null].filter(Boolean).join(" · ");
  }
  return n.reviews > 0 ? many(n.reviews, "review", "reviews") : null;
}

/** How many cells each row of the grid has: one row up to four, else two, the first the longer ("7" is 4 and 3). */
export function storyRows(cells: number): number[] {
  const n = Math.max(0, Math.min(STORY_GRID_MAX, Math.floor(cells)));
  if (n === 0) return [];
  if (n <= 4) return [n];
  const first = Math.ceil(n / 2);
  return [first, n - first];
}

/**
 * Everything the story draws, each line already drawable in the bundled
 * font. null when there is no earned medal (no picture is made), or the
 * username is not one.
 */
export function medalStoryFacts(p: { username: string; name: string | null; passport: PublicPassport }): MedalStoryFacts | null {
  if (!isStoryUsername(p.username)) return null;
  const u = p.username.toLowerCase();
  // A medal whose name or blurb the font could not draw is left out (none today: the catalog is plain English).
  const medals = p.passport.medals.filter((m) => drawable(m.name) === m.name && drawable(m.blurb) === m.blurb);
  const top = medals[0];
  if (!top) return null;
  const rest = medals.slice(1);
  const others = rest.length > STORY_GRID_MAX ? rest.slice(0, STORY_GRID_MAX - 1) : rest;
  const left = rest.length - others.length;
  const name = drawable(p.name);
  const letters = name ? ogText(initialsOf(name)) : null;
  const best = p.passport.numbers.bestStreak;
  const pick = ({ id, name: n, blurb, art }: StoryMedal): StoryMedal => ({ id, name: n, blurb, art });
  return {
    title: name ? clip(name, 44) : `@${u}`,
    handle: name ? `@${u}` : null,
    initials: letters && !letters.lost && letters.text ? letters.text : u[0].toUpperCase(),
    top: pick(top),
    topLabel: medals.length === 1 ? "FIRST MEDAL" : "TOP MEDAL",
    brag: storyBrag(p.passport.numbers),
    streak: best >= 2 ? `Best streak: ${best} weeks in a row` : null,
    count: `${medals.length} of ${MEDALS.length} medals`,
    others: others.map(pick),
    more: left > 0 ? `+${left} more` : null,
    address: `tapturf.in/u/${u}`,
    invite: "Earn yours on TapTurf",
  };
}

/** The story's version: a hash of what is drawn (each medal's own name, blurb and art among it) and the template. */
export function medalStoryVersion(f: MedalStoryFacts): string {
  return hash36(JSON.stringify([MEDAL_STORY_TEMPLATE, f.title, f.handle, f.initials, f.top, f.topLabel, f.brag, f.streak, f.count, f.others, f.more, f.address, f.invite]));
}

/**
 * How long each answer is kept. The picture: a minute on the CDN, as its
 * profile page (app/u/[username]/page.tsx revalidates in 60 s), so a
 * profile that is switched off stops being served as soon as its page
 * does, not a day later as the game card's cache would have it; an hour
 * in the browser that already has it (its URL never shows anything else),
 * so the owner opening the sheet again draws nothing. Redirects and "no
 * such profile": a minute. Not a username at all: a day.
 */
export const STORY_CACHE = {
  image: "public, max-age=3600, s-maxage=60",
  minute: "public, max-age=60, s-maxage=60",
  day: "public, max-age=86400, s-maxage=86400",
  none: "no-store",
} as const;

export type StoryDeps = {
  /** The profile as its page reads it (profile_get): public profiles only; where an old username moved to; else null. Throws when it cannot be read. */
  profile: (username: string) => Promise<{ profile: { u: string; name: string } } | { movedTo: string } | null>;
  /** publicPassport for that username; null when it cannot be read. */
  passport: (username: string) => Promise<PublicPassport | null>;
  /** The PNG for these facts, with these headers. */
  draw: (facts: MedalStoryFacts, headers: Record<string, string>) => Response | Promise<Response>;
};

const ROBOTS = { "X-Robots-Tag": "noindex" } as const;
const plain = (status: number, text: string, cache: string, more: Record<string, string> = {}) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": cache, ...ROBOTS, ...more } });
const redirect = (to: string) => new Response(null, { status: 307, headers: { Location: to, "Cache-Control": STORY_CACHE.minute, ...ROBOTS } });

/**
 * GET /api/og/medals/<username>[?v=<version>].
 * - Not a username: 404, kept a day. No public profile by that name (none,
 *   or its owner turned "Let others find and tag me" off), or no earned
 *   medal: 404, a minute.
 * - An old username: 307 to the current one's address.
 * - A URL whose version is not the current one (an older one, none, any
 *   other query, capitals in the name): 307 to the current one, a minute.
 * - The current URL: the picture.
 * - The database cannot be read: 503, never kept (an outage is never
 *   cached as "no such player").
 * Every answer says noindex.
 */
export async function medalStoryResponse(req: Request, raw: string, deps: StoryDeps): Promise<Response> {
  if (!isStoryUsername(raw)) return plain(404, "Not found", STORY_CACHE.day);
  let found: Awaited<ReturnType<StoryDeps["profile"]>>;
  try {
    found = await deps.profile(raw.toLowerCase());
  } catch {
    return plain(503, "Try again in a moment", STORY_CACHE.none, { "Retry-After": "30" });
  }
  if (!found) return plain(404, "Not found", STORY_CACHE.minute);
  if ("movedTo" in found) return isStoryUsername(found.movedTo) ? redirect(medalStoryPath(found.movedTo)) : plain(404, "Not found", STORY_CACHE.minute);
  const { u, name } = found.profile;
  const passport = await deps.passport(u);
  if (!passport) return plain(503, "Try again in a moment", STORY_CACHE.none, { "Retry-After": "30" });
  const facts = medalStoryFacts({ username: u, name, passport });
  if (!facts) return plain(404, "Not found", STORY_CACHE.minute);
  const path = medalStoryPath(u, medalStoryVersion(facts));
  const { pathname, search } = new URL(req.url);
  if (`${pathname}${search}` !== path) return redirect(path);
  return deps.draw(facts, { "Cache-Control": STORY_CACHE.image, ...ROBOTS });
}
