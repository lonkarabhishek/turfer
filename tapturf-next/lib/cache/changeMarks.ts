// When a cached page's own content goes out of date on a clock, not on a
// write: an open game it lists passes kickoff + 30 minutes and drops off
// (lib/utils/game.ts gameExpiresAt), and nothing writes to the database
// then, so no purge comes. Such a page is kept no longer than the first
// mark at or after that moment (lib/queries/changeMark.ts lowers its
// revalidate to it), so it is rendered again once, just after.
// No "@/" imports so the unit test compiles it on its own (npm run test:cache).
//
// Each page's marks start at its old timer (before 10 Nov), so even a
// stream of games ending minute after minute renders it no more often than
// it used to be:
//   home     the home and its /c/<city> twins (an hour since 10 Nov, 10
//            minutes before): a started game stays on it at most 10 minutes,
//            as before
//   games    /games, its twins and a game page (10 minutes since 10 Nov, a
//            minute before; a game page used to render on every request): a
//            started game stays in the /games JSON-LD, or a played game's
//            page stays indexable, at most a few minutes
export const CHANGE_MARKS_S = {
  home: [600, 1200, 1800, 2400, 3000],
  games: [60, 120, 300],
} as const;

export type ChangeMarks = keyof typeof CHANGE_MARKS_S;

/** Every mark in use, once each, ascending. */
export const ALL_CHANGE_MARKS_S: readonly number[] = [...new Set(Object.values(CHANGE_MARKS_S).flat())].sort((a, b) => a - b);

/**
 * The mark to keep a page by when what it shows changes in `secondsUntil`
 * seconds: the smallest of `kind`'s marks at or after it, or null when the
 * change is further off than every mark (the page's own timer comes first).
 */
export function changeMarkFor(secondsUntil: number, kind: ChangeMarks): number | null {
  if (!Number.isFinite(secondsUntil)) return null;
  return CHANGE_MARKS_S[kind].find((s) => s >= secondsUntil) ?? null;
}
