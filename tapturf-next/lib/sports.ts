/**
 * The sport pages that exist on the site (/sport/<slug>), in the order
 * we link them. Each page lists turfs whose `sports` include one of
 * `labels` (exact, case-insensitive match on the stored sport label),
 * so "Cricket" doesn't swallow "Box Cricket" and "Tennis" doesn't
 * swallow "Table Tennis".
 *
 * Box cricket is the second most listed sport (142 turfs) and had no
 * page, so Google had nothing to show for it.
 */
export interface SportPage {
  slug: string;
  name: string;
  icon: string;
  labels: string[];
  blurb: string;
  /** What people call the place they play it: a turf (football, cricket) or a court (racquet and ball-court sports). */
  venue: "turf" | "court";
}

export const SPORT_PAGES: SportPage[] = [
  {
    slug: "football",
    venue: "turf",
    name: "Football",
    icon: "⚽",
    labels: ["Football"],
    blurb: "5-a-side, 7-a-side and full-size football turfs, with floodlights for night games.",
  },
  {
    slug: "box-cricket",
    venue: "turf",
    name: "Box Cricket",
    icon: "🏏",
    labels: ["Box Cricket"],
    blurb: "Netted box cricket turfs for 6 to 8 a side, underarm or overarm, day or night.",
  },
  {
    slug: "cricket",
    venue: "turf",
    name: "Cricket",
    icon: "🏏",
    labels: ["Cricket", "Cricket Nets"],
    blurb: "Cricket grounds and practice nets for matches, coaching and net sessions.",
  },
  {
    slug: "badminton",
    venue: "court",
    name: "Badminton",
    icon: "🏸",
    labels: ["Badminton"],
    blurb: "Indoor badminton courts with proper flooring and lighting.",
  },
  {
    slug: "pickleball",
    venue: "court",
    name: "Pickleball",
    icon: "🏓",
    labels: ["Pickleball"],
    blurb: "Pickleball courts for the fastest growing racquet sport.",
  },
  {
    slug: "volleyball",
    venue: "court",
    name: "Volleyball",
    icon: "🏐",
    labels: ["Volleyball"],
    blurb: "Volleyball courts at multi-sport arenas, indoor and outdoor.",
  },
  {
    slug: "basketball",
    venue: "court",
    name: "Basketball",
    icon: "🏀",
    labels: ["Basketball"],
    blurb: "Basketball courts, indoor and outdoor.",
  },
  {
    slug: "tennis",
    venue: "court",
    name: "Tennis",
    icon: "🎾",
    labels: ["Tennis"],
    blurb: "Tennis courts for practice and matches.",
  },
];

const BY_SLUG = new Map(SPORT_PAGES.map((s) => [s.slug, s]));
const BY_LABEL = new Map(
  SPORT_PAGES.flatMap((s) => s.labels.map((l) => [l.toLowerCase(), s] as const)),
);

export function sportBySlug(slug: string): SportPage | undefined {
  return BY_SLUG.get(slug);
}

/** The sport page for a stored sport label ("Box Cricket" -> box-cricket), if one exists. */
export function sportPageForLabel(label: string): SportPage | undefined {
  return BY_LABEL.get(label.trim().toLowerCase());
}

export function turfPlaysSport(turfSports: string[], sport: SportPage): boolean {
  const wanted = new Set(sport.labels.map((l) => l.toLowerCase()));
  return turfSports.some((s) => wanted.has(s.trim().toLowerCase()));
}

/** "turf" / "turfs" or "court" / "courts" for this sport. */
export function venueWord(sport: SportPage, count = 2): string {
  return count === 1 ? sport.venue : `${sport.venue}s`;
}

/** "Football turfs", "Pickleball courts". Pass `title` for "Pickleball Courts". */
export function sportVenues(sport: SportPage, opts: { title?: boolean } = {}): string {
  const word = venueWord(sport);
  return `${sport.name} ${opts.title ? word[0].toUpperCase() + word.slice(1) : word}`;
}

/**
 * "Badminton Court" or "Badminton & Pickleball Courts" for a venue
 * whose listed sports with a page are all court sports; null if it
 * lists a turf sport (or nothing we have a page for).
 */
export function courtType(labels: string[]): string | null {
  const pages = [...new Set(labels.map((l) => sportPageForLabel(l)).filter((p): p is SportPage => !!p))];
  if (pages.length === 0 || pages.some((p) => p.venue === "turf")) return null;
  const names = pages.slice(0, 2).map((p) => p.name);
  return names.length === 1 ? `${names[0]} Court` : `${names.join(" & ")} Courts`;
}
