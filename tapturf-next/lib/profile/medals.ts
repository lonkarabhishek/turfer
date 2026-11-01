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

export type MedalDef = { id: string; name: string; track: MedalTrack; goal: number; blurb: string; art: MedalArt };

export const MEDALS: readonly MedalDef[] = [
  { id: "first-game", name: "First Whistle", track: "games", goal: 1, blurb: "Played a first TapTurf game", art: { shape: "round", tone: "teal", glyph: "flag" } },
  { id: "games-5", name: "Regular", track: "games", goal: 5, blurb: "5 games played", art: { shape: "round", tone: "bronze", glyph: "ball" } },
  { id: "games-10", name: "Double Digits", track: "games", goal: 10, blurb: "10 games played", art: { shape: "shield", tone: "silver", glyph: "boot" } },
  { id: "games-25", name: "Turf Veteran", track: "games", goal: 25, blurb: "25 games played", art: { shape: "shield", tone: "gold", glyph: "trophy" } },
  { id: "games-50", name: "Half Century", track: "games", goal: 50, blurb: "50 games played", art: { shape: "rosette", tone: "gold", glyph: "crown" } },
  { id: "first-host", name: "Captain", track: "hosted", goal: 1, blurb: "Hosted a first game", art: { shape: "hex", tone: "coral", glyph: "megaphone" } },
  { id: "hosted-5", name: "Matchmaker", track: "hosted", goal: 5, blurb: "Hosted 5 games", art: { shape: "hex", tone: "gold", glyph: "people" } },
  { id: "turfs-3", name: "Explorer", track: "turfs", goal: 3, blurb: "Played at 3 turfs", art: { shape: "round", tone: "sky", glyph: "pin" } },
  { id: "turfs-10", name: "Groundhopper", track: "turfs", goal: 10, blurb: "Played at 10 turfs", art: { shape: "shield", tone: "sky", glyph: "compass" } },
  { id: "cities-3", name: "Away Days", track: "cities", goal: 3, blurb: "Played in 3 cities", art: { shape: "rosette", tone: "violet", glyph: "plane" } },
  { id: "sports-3", name: "All-Rounder", track: "sports", goal: 3, blurb: "Played 3 sports", art: { shape: "hex", tone: "violet", glyph: "target" } },
  { id: "first-review", name: "First Word", track: "reviews", goal: 1, blurb: "Wrote a first turf review", art: { shape: "round", tone: "teal", glyph: "pen" } },
  { id: "reviews-5", name: "Scout", track: "reviews", goal: 5, blurb: "5 turf reviews written", art: { shape: "shield", tone: "teal", glyph: "binoculars" } },
  { id: "reviews-10", name: "Chief Scout", track: "reviews", goal: 10, blurb: "10 turf reviews written", art: { shape: "rosette", tone: "teal", glyph: "star" } },
  { id: "streak-4", name: "On a Roll", track: "streak", goal: 4, blurb: "Played 4 weeks in a row", art: { shape: "round", tone: "coral", glyph: "flame" } },
  { id: "streak-12", name: "Season Ticket", track: "streak", goal: 12, blurb: "Played 12 weeks in a row", art: { shape: "rosette", tone: "coral", glyph: "calendar" } },
];

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

function needText(m: MedalDef, have: number, current: number): string {
  const left = m.goal - have;
  switch (m.track) {
    case "games":
      return have === 0 ? `Play your first game for ${m.name}` : `${left} more ${plural(left, "game", "games")} for ${m.name}`;
    case "hosted":
      return have === 0 ? `Host a game for ${m.name}` : `Host ${left} more ${plural(left, "game", "games")} for ${m.name}`;
    case "turfs":
      return `${left} more ${plural(left, "turf", "turfs")} for ${m.name}`;
    case "cities":
      return `${left} more ${plural(left, "city", "cities")} for ${m.name}`;
    case "sports":
      return `${left} more ${plural(left, "sport", "sports")} for ${m.name}`;
    case "reviews":
      return have === 0 ? `Review a turf you played at for ${m.name}` : `${left} more ${plural(left, "review", "reviews")} for ${m.name}`;
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
