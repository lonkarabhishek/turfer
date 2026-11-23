/**
 * The Me tab's Games lists (the site owner, 23 Nov 2026: "Games section
 * have hosted and joined give a total as well"): All, Hosted and Joined,
 * and each one's count. A host is a player of their own game (the game is
 * made with them in it), so a hosted game is in the joined list too: All
 * counts each game once. Upcoming first (soonest first), then past (latest
 * first), as the two lists always were. Pure, no imports, tested in
 * tabs.test.ts (npm run test:matches).
 */

export type GamesView = "all" | "created" | "joined";

export const GAMES_VIEWS: readonly GamesView[] = ["all", "created", "joined"];
export const VIEW_LABEL: Record<GamesView, string> = { all: "All", created: "Hosted", joined: "Joined" };

type Row = { id: string };

/** Every game of theirs, each once: the hosted ones, then the joined ones not among them. */
export function allGames<T extends Row>(hosted: readonly T[], joined: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const g of [...hosted, ...joined]) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}

export function gamesOf<T extends Row>(view: GamesView, hosted: readonly T[], joined: readonly T[]): T[] {
  return view === "all" ? allGames(hosted, joined) : view === "created" ? [...hosted] : [...joined];
}

/** "All (12)", "Hosted (6)", "Joined (8)". */
export function viewLabel<T extends Row>(view: GamesView, hosted: readonly T[], joined: readonly T[]): string {
  return `${VIEW_LABEL[view]} (${gamesOf(view, hosted, joined).length})`;
}

type Timed = Row & { date: string; start_time: string };

/** Upcoming by the soonest start, past by the latest. */
export function splitGames<T extends Timed>(games: readonly T[], isPast: (g: T) => boolean): { upcoming: T[]; past: T[] } {
  const at = (g: T) => `${g.date}T${g.start_time}`;
  const upcoming = games.filter((g) => !isPast(g)).sort((a, b) => at(a).localeCompare(at(b)));
  const past = games.filter((g) => isPast(g)).sort((a, b) => at(b).localeCompare(at(a)));
  return { upcoming, past };
}

/** Said on a row of a list that mixes both: the games they host say so, the others name their host. */
export const YOU_HOST = "You host";

/** With nothing in a list. */
export const EMPTY_GAMES: Record<GamesView, { title: string; line: string }> = {
  all: { title: "No games yet", line: "Host one for your crew, or find one to join" },
  created: { title: "No games yet", line: "Host your first game — invite the crew" },
  joined: { title: "You haven't joined a game", line: "Find one that fits your squad" },
};
