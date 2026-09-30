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
}

export const SPORT_PAGES: SportPage[] = [
  {
    slug: "football",
    name: "Football",
    icon: "⚽",
    labels: ["Football"],
    blurb: "5-a-side, 7-a-side and full-size football turfs, with floodlights for night games.",
  },
  {
    slug: "box-cricket",
    name: "Box Cricket",
    icon: "🏏",
    labels: ["Box Cricket"],
    blurb: "Netted box cricket turfs for 6 to 8 a side, underarm or overarm, day or night.",
  },
  {
    slug: "cricket",
    name: "Cricket",
    icon: "🏏",
    labels: ["Cricket", "Cricket Nets"],
    blurb: "Cricket grounds and practice nets for matches, coaching and net sessions.",
  },
  {
    slug: "badminton",
    name: "Badminton",
    icon: "🏸",
    labels: ["Badminton"],
    blurb: "Indoor badminton courts with proper flooring and lighting.",
  },
  {
    slug: "pickleball",
    name: "Pickleball",
    icon: "🏓",
    labels: ["Pickleball"],
    blurb: "Pickleball courts for the fastest growing racquet sport.",
  },
  {
    slug: "volleyball",
    name: "Volleyball",
    icon: "🏐",
    labels: ["Volleyball"],
    blurb: "Volleyball courts at multi-sport turfs and arenas.",
  },
  {
    slug: "basketball",
    name: "Basketball",
    icon: "🏀",
    labels: ["Basketball"],
    blurb: "Basketball courts, indoor and outdoor.",
  },
  {
    slug: "tennis",
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
