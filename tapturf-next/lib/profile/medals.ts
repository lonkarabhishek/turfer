/**
 * Milestone medals: each one earned from real games and reviews only,
 * never given. A locked medal says what it takes ("2 more games for
 * Regular"). The art is drawn in code (components/profile/MedalArt.tsx)
 * from `art`. Pure. Relative imports only (npm run test:profile).
 */

export type MedalTrack = "games" | "hosted" | "turfs" | "cities" | "sports" | "reviews" | "streak";

export type MedalGlyph = "flag" | "ball" | "boot" | "trophy" | "crown" | "megaphone" | "people" | "pin" | "compass" | "plane" | "target" | "pen" | "binoculars" | "star" | "flame" | "calendar";

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
];

/** The first three to aim for, before a first game: play one, host one, review one. */
export const STARTER_MEDALS: readonly string[] = ["first-game", "first-host", "first-review"];

/** How far each track has got, and the day each count was first reached (index n-1: the day of the n-th). */
export type MedalProgress = Record<Exclude<MedalTrack, "streak">, { have: number; days: string[] }> & {
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
  }
}

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
    const t = p[m.track];
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

/** What a locked medal takes, under its own name on its tile: "2 more games". */
export function toGo(m: Pick<Medal, "need" | "name">): string | null {
  return m.need ? m.need.replace(` for ${m.name}`, "") : null;
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

/** Best first: the hardest tier, then the catalog's order. For a profile's top medal. */
export function bestFirst<T extends { id: string }>(medals: readonly T[]): T[] {
  const tier = (id: string) => MEDALS[order.get(id) ?? -1]?.tier ?? 0;
  return [...medals].sort((a, b) => tier(b.id) - tier(a.id) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * The locked medals the Me tab shows, so it isn't a wall of grey: the
 * "Next up" one on its own, then the `n` closest to done, the rest behind
 * "See all". Before a first game: no "Next up", and the three starters.
 * `rest` keeps the catalog's order.
 */
export function lockedShortlist(medals: readonly Medal[], played: number, n = 3): { next: Medal | null; shown: Medal[]; rest: Medal[] } {
  const locked = medals.filter((m) => !m.earned);
  let next: Medal | null = null;
  let shown: Medal[];
  if (played === 0) {
    shown = STARTER_MEDALS.map((id) => locked.find((m) => m.id === id)).filter((m): m is Medal => !!m);
  } else {
    next = nextMedal(medals);
    shown = locked
      .filter((m) => m !== next)
      .map((m, i) => ({ m, i }))
      .sort((a, b) => b.m.progress - a.m.progress || a.i - b.i)
      .slice(0, n)
      .map((x) => x.m);
  }
  return { next, shown, rest: locked.filter((m) => m !== next && !shown.includes(m)) };
}
