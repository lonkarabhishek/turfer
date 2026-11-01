import { dayNumber, istDay, playedGames, type GameRow, type PlayedGame, type ReviewRow, type TurfRef } from "./history";
import { bestFirst, medalsOf, type Medal, type MedalArt } from "./medals";
import { streakOf, streakReachedOn, type Streak } from "./streak";
import { gameSportPage } from "../utils/gameVenue";
import { sportLabel } from "../utils/sport";

/**
 * A player's passport, worked out from their history: the numbers they
 * can flaunt, a stamp for each turf, city and sport they played, the
 * medals, the turfs they reviewed and the ones they played at but have not
 * reviewed yet. The Me tab shows all of it (to its owner only); the public
 * profile shows publicPassport: counts, earned medals and reviewed turfs,
 * never where or when they played. Pure. Relative imports only
 * (npm run test:profile).
 */

export type PassportNumbers = {
  /** Games played (hosted ones included). */
  games: number;
  hosted: number;
  turfs: number;
  cities: number;
  sports: number;
  /** Turfs they reviewed (live player reviews). */
  reviews: number;
  /** When the account was made (ISO), as the profile has it. */
  since: string | null;
};

export type TurfStamp = {
  turfId: string;
  slug: string | null;
  name: string;
  city: string | null;
  cityLabel: string | null;
  /** India's dates of the first and the latest game there. */
  first: string;
  last: string;
  games: number;
  /** The sport played there most (the first one played, on a tie), for the stamp's glyph. */
  sport: string | null;
};

/** A city or a sport: key (the city id, or the sport's page slug, else its label in lower case), what to call it, the first game's date and how many. */
export type PlaceStamp = { key: string; label: string; first: string; games: number };

export type ReviewedTurf = { turfId: string; slug: string | null; name: string; cityLabel: string | null; rating: number; day: string | null };

export type Passport = {
  numbers: PassportNumbers;
  streak: Streak;
  medals: Medal[];
  stamps: { turfs: TurfStamp[]; cities: PlaceStamp[]; sports: PlaceStamp[] };
  /** Newest first. */
  reviewed: ReviewedTurf[];
  /** Played there, no review yet: the latest game first. */
  reviewMore: TurfStamp[];
};

export type PassportInput = {
  userId: string;
  /** The games they were in: a participant, or the host. */
  games: readonly GameRow[];
  turfs: readonly TurfRef[];
  reviews: readonly ReviewRow[];
  since: string | null;
  now: number;
};

/**
 * One sport however the game stored it: its sport page, by the slug and
 * named as the page is ("Football", "5v5 Football", "7v7 Football" and
 * "football" are all Football; Box Cricket has its own page), else its
 * label ("Kabaddi"). Formats of one sport are never more sports.
 */
function sportOf(raw: string): { key: string; label: string } {
  const page = gameSportPage(raw);
  if (page) return { key: page.slug, label: page.name };
  const label = sportLabel(raw);
  return { key: label.toLowerCase(), label };
}

/** Each review once per turf (the newest), newest first. */
function reviewsByTurf(reviews: readonly ReviewRow[]): ReviewRow[] {
  const at = (r: ReviewRow) => Date.parse(r.created_at ?? "") || 0;
  const newest = new Map<string, ReviewRow>();
  for (const r of reviews) {
    const had = newest.get(r.turf_id);
    if (!had || at(r) > at(had)) newest.set(r.turf_id, r);
  }
  return [...newest.values()].sort((a, b) => at(b) - at(a) || (a.turf_id < b.turf_id ? -1 : 1));
}

export function buildPassport(input: PassportInput): Passport {
  const played = playedGames(input.userId, input.games, input.now);
  const turfById = new Map(input.turfs.map((t) => [t.id, t]));

  const turfStamps = new Map<string, TurfStamp>();
  const cities = new Map<string, PlaceStamp>();
  const sports = new Map<string, PlaceStamp>();
  const days = { games: [] as string[], hosted: [] as string[], turfs: [] as string[], cities: [] as string[], sports: [] as string[], reviews: [] as string[] };
  const turfIds = new Set<string>();
  // Games per sport at each turf, in the order first played (the stamp's sport).
  const turfSports = new Map<string, Map<string, { label: string; n: number }>>();

  for (const g of played) {
    days.games.push(g.day);
    if (g.hosted) days.hosted.push(g.day);
    if (g.turfId && !turfIds.has(g.turfId)) {
      turfIds.add(g.turfId);
      days.turfs.push(g.day);
    }
    const turf = g.turfId ? turfById.get(g.turfId) : undefined;
    if (turf) {
      const s = turfStamps.get(turf.id);
      if (s) {
        s.games++;
        s.last = g.day;
      } else {
        turfStamps.set(turf.id, { turfId: turf.id, slug: turf.slug, name: turf.name, city: turf.city, cityLabel: turf.cityLabel, first: g.day, last: g.day, games: 1, sport: null });
      }
      if (g.sport) {
        const at = turfSports.get(turf.id) ?? new Map<string, { label: string; n: number }>();
        turfSports.set(turf.id, at);
        const sp = sportOf(g.sport);
        const had = at.get(sp.key);
        if (had) had.n++;
        else at.set(sp.key, { label: sp.label, n: 1 });
      }
      if (turf.city) {
        const c = cities.get(turf.city);
        if (c) c.games++;
        else {
          cities.set(turf.city, { key: turf.city, label: turf.cityLabel ?? turf.city, first: g.day, games: 1 });
          days.cities.push(g.day);
        }
      }
    }
    if (g.sport) {
      const sp = sportOf(g.sport);
      const s = sports.get(sp.key);
      if (s) s.games++;
      else {
        sports.set(sp.key, { key: sp.key, label: sp.label, first: g.day, games: 1 });
        days.sports.push(g.day);
      }
    }
  }

  const reviewRows = reviewsByTurf(input.reviews);
  days.reviews = reviewRows
    .map((r) => (r.created_at ? istDay(Date.parse(r.created_at)) : null))
    .filter((d): d is string => !!d && !Number.isNaN(dayNumber(d)))
    .sort();
  const reviewed: ReviewedTurf[] = [];
  for (const r of reviewRows) {
    const t = turfById.get(r.turf_id);
    if (!t) continue;
    const ms = Date.parse(r.created_at ?? "");
    reviewed.push({ turfId: t.id, slug: t.slug, name: t.name, cityLabel: t.cityLabel, rating: r.rating, day: Number.isNaN(ms) ? null : istDay(ms) });
  }
  const reviewedIds = new Set(reviewRows.map((r) => r.turf_id));

  const streak = streakOf(played, input.now);
  const medals = medalsOf({
    games: { have: played.length, days: days.games },
    hosted: { have: days.hosted.length, days: days.hosted },
    turfs: { have: turfIds.size, days: days.turfs },
    cities: { have: cities.size, days: days.cities },
    sports: { have: sports.size, days: days.sports },
    reviews: { have: reviewRows.length, days: days.reviews },
    streak: { best: streak.best, current: streak.current, reachedOn: (goal) => streakReachedOn(played, goal) },
  });

  const stampList = [...turfStamps.values()];
  for (const st of stampList) {
    let top: { label: string; n: number } | null = null;
    for (const x of turfSports.get(st.turfId)?.values() ?? []) if (!top || x.n > top.n) top = x;
    st.sport = top?.label ?? null;
  }
  return {
    numbers: {
      games: played.length,
      hosted: days.hosted.length,
      turfs: turfIds.size,
      cities: cities.size,
      sports: sports.size,
      reviews: reviewRows.length,
      since: input.since,
    },
    streak,
    medals,
    stamps: { turfs: stampList, cities: [...cities.values()], sports: [...sports.values()] },
    reviewed,
    reviewMore: stampList.filter((s) => !reviewedIds.has(s.turfId)).sort((a, b) => dayNumber(b.last) - dayNumber(a.last) || (a.name < b.name ? -1 : 1)),
  };
}

/**
 * What the public profile may show: counts, the best streak, earned medals
 * (best first: the first one leads the profile) and reviewed turfs. No
 * dates and no places played.
 */
export type PublicPassport = {
  numbers: Omit<PassportNumbers, "since"> & { bestStreak: number };
  medals: { id: string; name: string; blurb: string; art: MedalArt }[];
  reviewed: { turfId: string; slug: string | null; name: string; cityLabel: string | null; rating: number }[];
};

export function publicPassport(p: Passport): PublicPassport {
  const { games, hosted, turfs, cities, sports, reviews } = p.numbers;
  return {
    numbers: { games, hosted, turfs, cities, sports, reviews, bestStreak: p.streak.best },
    medals: bestFirst(p.medals.filter((m) => m.earned)).map(({ id, name, blurb, art }) => ({ id, name, blurb, art })),
    reviewed: p.reviewed.map(({ turfId, slug, name, cityLabel, rating }) => ({ turfId, slug, name, cityLabel, rating })),
  };
}

/** The day of the latest game they played at each turf (India's date). */
export function latestPlayedByTurf(played: readonly PlayedGame[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of played) {
    if (!g.turfId) continue;
    const had = out[g.turfId];
    if (!had || dayNumber(g.day) > dayNumber(had)) out[g.turfId] = g.day;
  }
  return out;
}
