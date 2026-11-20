/**
 * Milestone medals: each one earned from real games, reviews and uses of
 * the free tools only, never given. A locked medal says what it takes
 * ("2 more games for Regular"). The art is drawn in code
 * (components/profile/MedalArt.tsx) from `art`. Pure. Relative imports
 * only (npm run test:profile).
 *
 * Tool medals (the site owner, 20 Nov 2026: "give medals for using tools,
 * scorecards etc") are earned only from uses made while signed in: a
 * guest's use has no account in the log (lib/profile/toolUses.ts), and
 * each locked one says so. They are easier to earn than playing, so they
 * stay in tiers 1 and 2, come after the playing medals in the catalog and
 * never lead a playing medal (bestFirst): the medal on a player's photo
 * and at the top of their story is a tool medal only when tool medals are
 * all they have.
 */

/** What a playing medal counts: games, hosting, places, sports and reviews. */
export type PlayTrack = "games" | "hosted" | "turfs" | "cities" | "sports" | "reviews";

/**
 * What a tool medal counts, from the signed-in uses of the free tools:
 * scored (matches scored to the end on the Live Cricket Scorer or the Live
 * Scoreboard), cards (scorecards made), tossDays (different days a toss
 * was flipped: a flip is one tap, so days are counted, not taps), teams
 * (team splits), results (results added to a tournament table), live
 * (matches scored to the end with a live link on) and kit (different
 * tools used).
 */
export type ToolTrack = "scored" | "cards" | "tossDays" | "teams" | "results" | "live" | "kit";

export type MedalTrack = PlayTrack | ToolTrack | "streak";

export const TOOL_TRACKS: readonly ToolTrack[] = ["scored", "cards", "tossDays", "teams", "results", "live", "kit"];

export type MedalGlyph =
  | "flag" | "ball" | "boot" | "trophy" | "crown" | "megaphone" | "people" | "pin" | "compass" | "plane" | "target" | "pen" | "binoculars" | "star" | "flame" | "calendar"
  // The tool medals'.
  | "tally" | "tv" | "sheet" | "newspaper" | "coins" | "clover" | "clipboard" | "podium" | "radio" | "bag" | "shirt";

export type MedalArt = {
  shape: "round" | "shield" | "hex" | "rosette";
  tone: "bronze" | "silver" | "gold" | "teal" | "coral" | "violet" | "sky";
  glyph: MedalGlyph;
};

/** tier: how hard it is to get, 1 to 4 (the best earned medal leads on a profile). */
export type MedalDef = { id: string; name: string; track: MedalTrack; goal: number; tier: 1 | 2 | 3 | 4; blurb: string; art: MedalArt };

export const MEDALS: readonly MedalDef[] = [
  { id: "first-game", name: "First Whistle", track: "games", goal: 1, tier: 1, blurb: "First game played", art: { shape: "round", tone: "teal", glyph: "flag" } },
  { id: "games-5", name: "Regular", track: "games", goal: 5, tier: 1, blurb: "5 games played", art: { shape: "round", tone: "bronze", glyph: "ball" } },
  { id: "games-10", name: "Double Digits", track: "games", goal: 10, tier: 2, blurb: "10 games played", art: { shape: "shield", tone: "silver", glyph: "boot" } },
  { id: "games-25", name: "Turf Veteran", track: "games", goal: 25, tier: 3, blurb: "25 games played", art: { shape: "shield", tone: "gold", glyph: "trophy" } },
  { id: "games-50", name: "Half Century", track: "games", goal: 50, tier: 4, blurb: "50 games played", art: { shape: "rosette", tone: "gold", glyph: "crown" } },
  { id: "first-host", name: "Captain", track: "hosted", goal: 1, tier: 1, blurb: "First game hosted", art: { shape: "hex", tone: "coral", glyph: "megaphone" } },
  { id: "hosted-5", name: "Matchmaker", track: "hosted", goal: 5, tier: 2, blurb: "5 games hosted", art: { shape: "hex", tone: "gold", glyph: "people" } },
  { id: "turfs-3", name: "Explorer", track: "turfs", goal: 3, tier: 2, blurb: "Played at 3 turfs", art: { shape: "round", tone: "sky", glyph: "pin" } },
  { id: "turfs-10", name: "Groundhopper", track: "turfs", goal: 10, tier: 3, blurb: "Played at 10 turfs", art: { shape: "shield", tone: "sky", glyph: "compass" } },
  { id: "cities-3", name: "Away Days", track: "cities", goal: 3, tier: 3, blurb: "Played in 3 cities", art: { shape: "rosette", tone: "violet", glyph: "plane" } },
  { id: "sports-3", name: "All-Rounder", track: "sports", goal: 3, tier: 2, blurb: "Played 3 sports", art: { shape: "hex", tone: "violet", glyph: "target" } },
  { id: "first-review", name: "First Word", track: "reviews", goal: 1, tier: 1, blurb: "First review", art: { shape: "round", tone: "teal", glyph: "pen" } },
  { id: "reviews-5", name: "Scout", track: "reviews", goal: 5, tier: 2, blurb: "5 reviews written", art: { shape: "shield", tone: "teal", glyph: "binoculars" } },
  { id: "reviews-10", name: "Chief Scout", track: "reviews", goal: 10, tier: 3, blurb: "10 reviews written", art: { shape: "rosette", tone: "teal", glyph: "star" } },
  { id: "streak-4", name: "On a Roll", track: "streak", goal: 4, tier: 2, blurb: "4 weeks in a row", art: { shape: "round", tone: "coral", glyph: "flame" } },
  { id: "streak-12", name: "Season Ticket", track: "streak", goal: 12, tier: 3, blurb: "12 weeks in a row", art: { shape: "rosette", tone: "coral", glyph: "calendar" } },
  // The free tools, used signed in. After every playing medal, tiers 1 and 2 only (see the note at the top).
  { id: "tool-scored-1", name: "Keeping Score", track: "scored", goal: 1, tier: 1, blurb: "First match scored", art: { shape: "hex", tone: "sky", glyph: "tally" } },
  { id: "tool-scored-10", name: "Third Umpire", track: "scored", goal: 10, tier: 2, blurb: "10 matches scored", art: { shape: "shield", tone: "violet", glyph: "tv" } },
  { id: "tool-card-1", name: "Match Report", track: "cards", goal: 1, tier: 1, blurb: "First scorecard", art: { shape: "hex", tone: "silver", glyph: "sheet" } },
  { id: "tool-card-5", name: "Press Box", track: "cards", goal: 5, tier: 2, blurb: "5 scorecards made", art: { shape: "shield", tone: "bronze", glyph: "newspaper" } },
  { id: "tool-toss-1", name: "Heads or Tails", track: "tossDays", goal: 1, tier: 1, blurb: "First toss", art: { shape: "round", tone: "silver", glyph: "coins" } },
  { id: "tool-toss-5", name: "Lucky Coin", track: "tossDays", goal: 5, tier: 2, blurb: "Tossed on 5 days", art: { shape: "round", tone: "gold", glyph: "clover" } },
  { id: "tool-teams-1", name: "Team Sheet", track: "teams", goal: 1, tier: 1, blurb: "First teams split", art: { shape: "hex", tone: "teal", glyph: "clipboard" } },
  { id: "tool-table-3", name: "Table Topper", track: "results", goal: 3, tier: 1, blurb: "3 results tabled", art: { shape: "round", tone: "violet", glyph: "podium" } },
  { id: "tool-live-1", name: "On Air", track: "live", goal: 1, tier: 1, blurb: "Match scored live", art: { shape: "shield", tone: "coral", glyph: "radio" } },
  { id: "tool-kit-3", name: "Kit Bag", track: "kit", goal: 3, tier: 1, blurb: "Used 3 free tools", art: { shape: "hex", tone: "bronze", glyph: "bag" } },
  { id: "tool-kit-5", name: "Kit Manager", track: "kit", goal: 5, tier: 2, blurb: "Used 5 free tools", art: { shape: "rosette", tone: "bronze", glyph: "shirt" } },
];

const toolTracks = new Set<string>(TOOL_TRACKS);

/** A medal of the free tools (not of games, reviews or the streak). */
export function isToolMedal(m: { track: MedalTrack }): boolean {
  return toolTracks.has(m.track);
}

/** The first three to aim for, before a first game: play one, host one, review one. */
export const STARTER_MEDALS: readonly string[] = ["first-game", "first-host", "first-review"];

/** How far a track has got, and the day each count was first reached (index n-1: the day of the n-th). */
export type TrackCount = { have: number; days: string[] };

/**
 * How far each track has got. The tool tracks may be left out (the log
 * could not be read, or the database has no read for it yet): their medals
 * are then locked at zero, and nothing else changes.
 */
export type MedalProgress = Record<PlayTrack, TrackCount> &
  Partial<Record<ToolTrack, TrackCount>> & {
    streak: { best: number; current: number; reachedOn: (goal: number) => string | null };
  };

export type Medal = MedalDef & {
  earned: boolean;
  /** India's date it was earned; null when locked. */
  earnedOn: string | null;
  /** The count so far (for the streak, the best run). */
  have: number;
  /** What it takes, for a locked medal; null when earned. */
  need: string | null;
  /** How far along, 0 to 1 (for the streak, the run going now). */
  progress: number;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * What a locked medal takes. A first one says what to do ("Host a game");
 * a bigger one with nothing yet says how many ("Write 5 reviews"), so
 * three medals of one track never read the same; then how many more.
 */
function needText(m: MedalDef, have: number, current: number): string {
  const tool = toolNeed(m, have);
  // "Score a match to the end, signed in, for Keeping Score": the commas keep "signed in" with what to do.
  if (tool) return tool.endsWith(SIGNED_IN) ? `${tool}, for ${m.name}` : `${tool} for ${m.name}`;
  const left = m.goal - have;
  const start = have === 0;
  switch (m.track) {
    case "games":
      if (start) return m.goal === 1 ? `Play your first game for ${m.name}` : `Play ${m.goal} games for ${m.name}`;
      return `${left} more ${plural(left, "game", "games")} for ${m.name}`;
    case "hosted":
      if (start) return m.goal === 1 ? `Host a game for ${m.name}` : `Host ${m.goal} games for ${m.name}`;
      return `Host ${left} more ${plural(left, "game", "games")} for ${m.name}`;
    case "turfs":
      return start ? `Play at ${m.goal} turfs for ${m.name}` : `${left} more ${plural(left, "turf", "turfs")} for ${m.name}`;
    case "cities":
      return start ? `Play in ${m.goal} cities for ${m.name}` : `${left} more ${plural(left, "city", "cities")} for ${m.name}`;
    case "sports":
      return start ? `Play ${m.goal} sports for ${m.name}` : `${left} more ${plural(left, "sport", "sports")} for ${m.name}`;
    case "reviews":
      if (start) return m.goal === 1 ? `Review a turf you played at for ${m.name}` : `Write ${m.goal} reviews for ${m.name}`;
      return `${left} more ${plural(left, "review", "reviews")} for ${m.name}`;
    case "streak": {
      // The run going now gets there soonest; without one, a fresh start.
      const more = m.goal - current;
      return current > 0 ? `${more} more ${plural(more, "week", "weeks")} in a row for ${m.name}` : `Play ${m.goal} weeks in a row for ${m.name}`;
    }
    default:
      // A tool track: toolNeed answered above.
      return m.blurb;
  }
}

/** Only a use made while signed in is in the log with an account, and every tool medal's ask says so. */
const SIGNED_IN = ", signed in";

/**
 * What a locked tool medal takes, without its name; null for any other
 * medal. The same three steps as the playing medals: what to do for a
 * first one, how many for a bigger one, then how many more. A live link
 * can only be turned on signed in, so that ask doesn't say it twice.
 */
function toolNeed(m: MedalDef, have: number): string | null {
  const left = m.goal - have;
  const start = have === 0;
  const first = m.goal === 1;
  switch (m.track) {
    case "scored":
      if (start) return (first ? "Score a match to the end" : `Score ${m.goal} matches to the end`) + SIGNED_IN;
      return `Score ${left} more ${plural(left, "match", "matches")}${SIGNED_IN}`;
    case "cards":
      if (start) return (first ? "Make a scorecard" : `Make ${m.goal} scorecards`) + SIGNED_IN;
      return `Make ${left} more ${plural(left, "scorecard", "scorecards")}${SIGNED_IN}`;
    case "tossDays":
      if (start) return (first ? "Flip the toss" : `Toss on ${m.goal} different days`) + SIGNED_IN;
      return `Toss on ${left} more ${plural(left, "day", "days")}${SIGNED_IN}`;
    case "teams":
      if (start) return (first ? "Split players into teams" : `Split teams ${m.goal} times`) + SIGNED_IN;
      return `Split teams ${left} more ${plural(left, "time", "times")}${SIGNED_IN}`;
    case "results":
      if (start) return (first ? "Add a result to a tournament table" : `Add ${m.goal} results to a tournament table`) + SIGNED_IN;
      return `Add ${left} more tournament ${plural(left, "result", "results")}${SIGNED_IN}`;
    case "live":
      if (start) return first ? "Finish a match with its live link on" : `Finish ${m.goal} matches with a live link on`;
      return `Finish ${left} more live ${plural(left, "match", "matches")}`;
    case "kit":
      if (start) return `Use ${m.goal} different tools${SIGNED_IN}`;
      return `Use ${left} more ${plural(left, "tool", "tools")}${SIGNED_IN}`;
    default:
      return null;
  }
}

const NOTHING: TrackCount = { have: 0, days: [] };

export function medalsOf(p: MedalProgress): Medal[] {
  return MEDALS.map((m) => {
    if (m.track === "streak") {
      const earned = p.streak.best >= m.goal;
      return {
        ...m,
        earned,
        earnedOn: earned ? p.streak.reachedOn(m.goal) : null,
        have: p.streak.best,
        need: earned ? null : needText(m, p.streak.best, p.streak.current),
        progress: earned ? 1 : Math.min(1, p.streak.current / m.goal),
      };
    }
    const t = p[m.track] ?? NOTHING;
    const earned = t.have >= m.goal;
    return {
      ...m,
      earned,
      earnedOn: earned ? (t.days[m.goal - 1] ?? null) : null,
      have: t.have,
      need: earned ? null : needText(m, t.have, 0),
      progress: Math.min(1, t.have / m.goal),
    };
  });
}

/** What a locked medal takes, under its own name on its tile: "2 more games", "Flip the toss, signed in". */
export function toGo(m: Pick<Medal, "need" | "name">): string | null {
  return m.need ? m.need.replace(` for ${m.name}`, "").replace(/,$/, "") : null;
}

/** The locked medal closest to done (the biggest share of its goal; the catalog's order breaks ties), or null when all are earned. */
export function nextMedal(medals: readonly Medal[]): Medal | null {
  let best: Medal | null = null;
  let bestShare = -1;
  for (const m of medals) {
    if (m.earned) continue;
    if (m.progress > bestShare) {
      best = m;
      bestShare = m.progress;
    }
  }
  return best;
}

const order = new Map(MEDALS.map((m, i) => [m.id, i]));

/**
 * Best first, for a profile's top medal: playing medals before tool
 * medals whatever their tier (a tool medal leads only when tool medals are
 * all there is), then the hardest tier, then the catalog's order.
 */
export function bestFirst<T extends { id: string }>(medals: readonly T[]): T[] {
  const def = (id: string) => MEDALS[order.get(id) ?? -1];
  const tier = (id: string) => def(id)?.tier ?? 0;
  const tool = (id: string) => {
    const d = def(id);
    return d && isToolMedal(d) ? 1 : 0;
  };
  return [...medals].sort((a, b) => tool(a.id) - tool(b.id) || tier(b.id) - tier(a.id) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** The `n` closest to done (the catalog's order breaks ties), and the others in the catalog's order. */
function closest(locked: readonly Medal[], n: number): { shown: Medal[]; rest: Medal[] } {
  const shown = locked
    .map((m, i) => ({ m, i }))
    .sort((a, b) => b.m.progress - a.m.progress || a.i - b.i)
    .slice(0, n)
    .map((x) => x.m);
  return { shown, rest: locked.filter((m) => !shown.includes(m)) };
}

/**
 * The locked medals the Me tab shows, so it isn't a wall of grey. The
 * playing medals: the "Next up" one on its own, then the `n` closest to
 * done, the rest behind "See all"; before a first game no "Next up", and
 * the three starters. The tool medals have a short list of their own
 * (`tools`: the `n` closest to done, the rest behind the same "See all"),
 * so an easy tool medal never takes the place of the next game's medal
 * and a player who never opened the tools still sees what they give.
 * Each `rest` keeps the catalog's order.
 */
export function lockedShortlist(
  medals: readonly Medal[],
  played: number,
  n = 3,
): { next: Medal | null; shown: Medal[]; rest: Medal[]; tools: { shown: Medal[]; rest: Medal[] } } {
  const play = medals.filter((m) => !isToolMedal(m));
  const locked = play.filter((m) => !m.earned);
  const tools = closest(medals.filter((m) => isToolMedal(m) && !m.earned), n);
  if (played === 0) {
    const shown = STARTER_MEDALS.map((id) => locked.find((m) => m.id === id)).filter((m): m is Medal => !!m);
    return { next: null, shown, rest: locked.filter((m) => !shown.includes(m)), tools };
  }
  const next = nextMedal(play);
  return { next, ...closest(locked.filter((m) => m !== next), n), tools };
}
