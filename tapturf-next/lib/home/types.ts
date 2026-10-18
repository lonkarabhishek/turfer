import type { SpotlightTurf } from "@/components/turf/TrendingSpotlight";

/**
 * Shapes the home page hands to its components. Everything here is
 * plain JSON built once on the server (lib/home/data.ts); the client
 * components only narrow by city, they never fetch.
 */

/** One photo tile in the "Top-rated in {City}" strip. */
export type HomeTile = {
  id: string;
  name: string;
  place: string;
  rating: number;
  reviews: number;
  /** Final URL, already sized for a card. */
  photo: string | null;
  /** First sport label that has a page, else sports[0]. */
  sport: string | null;
  /** summarisePrice label, only when the price is a listed (real) rate. */
  price: string | null;
  /** Set on all-India tiles, so the place line names the city. */
  cityLabel?: string;
};

export type HomeStrip = {
  id: string;
  label: string;
  n: number;
  /** True when at least three turfs pass the review threshold. */
  curated: boolean;
  tiles: HomeTile[];
};

/** A row in "Every city on TapTurf": the city link plus three turf links. */
export type HomeCityRow = {
  id: string;
  label: string;
  n: number;
  top: { id: string; name: string }[];
};

export type HomeGame = {
  id: string;
  sport: string;
  /** "Sat 25 Oct", built from the date string alone. */
  when: string;
  /** "7:00 PM" */
  time: string;
  turfName: string | null;
  place: string | null;
  city: string | null;
  spotsLeft: number;
  /** 0 when free or unknown. */
  price: number;
};

export type HomeSport = { slug: string; name: string; count: number };

export type HomePost = {
  slug: string;
  title: string;
  category: string;
  readMinutes: number;
  hero: { url: string; alt: string } | null;
};

export type HeroCity = {
  label: string;
  n: number;
  sports: number;
  area: string | null;
  /** True when the city has both football and box cricket turfs. */
  core: boolean;
  /** Sports with turfs here, biggest first, at most eight (the desktop aside). */
  bySport: { slug: string; name: string; n: number }[];
};

export type HomeHeroProps = {
  total: number;
  cityCount: number;
  sportCount: number;
  /** One entry per city with turfs. */
  cities: Record<string, HeroCity>;
  /** The eight biggest cities, n desc. */
  topCities: { id: string; label: string; n: number }[];
};

export type HomeData = {
  total: number;
  cityCount: number;
  sportCount: number;
  pins: number;
  hero: HomeHeroProps;
  strips: HomeStrip[];
  /** "Top-rated across India": six tiles, at most two per city. */
  nationalTiles: HomeTile[];
  cityRows: HomeCityRow[];
  sports: HomeSport[];
  /** sportsByCity[cityId][slug], present only when the count is indexable. */
  sportsByCity: Record<string, Record<string, number>>;
  spotlights: SpotlightTurf[];
  /** The three soonest open games anywhere, for the all-cities view. */
  games: HomeGame[];
  /** The three soonest open games per city, keyed by city slug. */
  gamesByCity: Record<string, HomeGame[]>;
  openGamesTotal: number;
  /** True per-city totals, so counts and empty states never undercount. */
  openGamesByCity: Record<string, number>;
  posts: HomePost[];
};
