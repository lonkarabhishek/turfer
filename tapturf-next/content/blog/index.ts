import type { Post } from "./types";

// Re-export everything for consumers.
export type { Post, Block, PostCategory, PostCity } from "./types";

// One import per post keeps the graph explicit + tree-shakeable.
import { post as bestCricketTurfsNashik2026 } from "./posts/best-cricket-turfs-nashik-2026";
import { post as bestFootballTurfsNashik } from "./posts/best-football-turfs-nashik";
import { post as bestTurfsPuneCricket } from "./posts/best-turfs-pune-cricket";
import { post as bestTurfsPuneFootball } from "./posts/best-turfs-pune-football";
import { post as howToBookTurfNashik } from "./posts/how-to-book-turf-nashik";
import { post as turfRulesEveryPlayerShouldKnow } from "./posts/turf-rules-every-player-should-know";
import { post as boxCricketVsFullCricket } from "./posts/box-cricket-vs-full-cricket";
import { post as howToHostATurfMatch } from "./posts/how-to-host-a-turf-match";
import { post as bestTimeToBookATurf } from "./posts/best-time-to-book-a-turf";
import { post as turfEtiquette } from "./posts/turf-etiquette";
import { post as footballOnTurfVsGrass } from "./posts/football-on-turf-vs-grass";
import { post as splitTurfCostsWithSquad } from "./posts/split-turf-costs-with-squad";
import { post as beginnersGuideBoxCricket } from "./posts/beginners-guide-box-cricket";
import { post as corporateCricketEvents } from "./posts/corporate-cricket-events";
import { post as turfBookingMistakes } from "./posts/turf-booking-mistakes";

// Ordered newest-first, but the listing page sorts by publishedAt anyway.
export const ALL_POSTS: Post[] = [
  bestCricketTurfsNashik2026,
  bestFootballTurfsNashik,
  bestTurfsPuneCricket,
  bestTurfsPuneFootball,
  howToBookTurfNashik,
  turfRulesEveryPlayerShouldKnow,
  boxCricketVsFullCricket,
  howToHostATurfMatch,
  bestTimeToBookATurf,
  turfEtiquette,
  footballOnTurfVsGrass,
  splitTurfCostsWithSquad,
  beginnersGuideBoxCricket,
  corporateCricketEvents,
  turfBookingMistakes,
];

export function getPostBySlug(slug: string): Post | undefined {
  return ALL_POSTS.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return ALL_POSTS.map((p) => p.slug);
}

export function getSortedPosts(): Post[] {
  // Newest first.
  return [...ALL_POSTS].sort((a, b) =>
    (b.publishedAt || "").localeCompare(a.publishedAt || "")
  );
}

export function getRelatedPosts(slug: string, count = 3): Post[] {
  const current = getPostBySlug(slug);
  if (!current) return [];
  const others = ALL_POSTS.filter((p) => p.slug !== slug);
  // Prefer same city, then same category, then anything.
  const sameCity = others.filter((p) => current.city && p.city === current.city);
  const sameCategory = others.filter(
    (p) => p.category === current.category && !sameCity.includes(p)
  );
  const rest = others.filter(
    (p) => !sameCity.includes(p) && !sameCategory.includes(p)
  );
  return [...sameCity, ...sameCategory, ...rest].slice(0, count);
}
