import type { SpotlightTurf } from "@/components/turf/TrendingSpotlight";
import { byDistanceFrom, isKnownCity, resolveCityScope, type CityScope } from "@/lib/city";
import type { HeroCity, HomeCityRow, HomeData, HomeGame, HomeHeroProps, HomeTile } from "./types";

export type HomeScope = CityScope;

export type ScopedHome = {
  scope: HomeScope;
  hero: {
    total: number;
    cityCount: number;
    sportCount: number;
    topCities: HomeHeroProps["topCities"];
    city: (HeroCity & { id: string }) | null;
  };
  strip: { tiles: HomeTile[]; n: number; curated: boolean };
  spotlight: SpotlightTurf | null;
  games: { rows: HomeGame[]; inScope: number; total: number };
  /** inCity false: the national grid (all-India view, or a city with no indexable sport page). */
  sports: { primary: { slug: string; name: string; count: number }[]; more: { slug: string; name: string }[]; inCity: boolean };
  cityList: { rows: (HomeCityRow & { km: number | null })[]; total: number };
  /** Ask sheet pills, india scope only. */
  askCities: { id: string; label: string; n: number }[];
  askCityCount: number;
};

/**
 * The slices of the shaped home snapshot that one page variant needs:
 * one city (with the nearest live city standing in for a city that has
 * no turfs yet) or all of India. Pure, so the per-city ISR pages share
 * one cached snapshot and only the HTML multiplies.
 */
export function scopeHome(d: HomeData, requested: string | null): ScopedHome {
  const scope = resolveCityScope(requested, d.cityRows);
  const heroBase = {
    total: d.hero.total,
    cityCount: d.hero.cityCount,
    sportCount: d.hero.sportCount,
    topCities: d.hero.topCities,
  };
  const askCityCount = d.cityRows.filter((r) => isKnownCity(r.id)).length;

  if (scope.kind === "city") {
    const id = scope.id;
    const hc = d.hero.cities[id];
    const strip = d.strips.find((s) => s.id === id);
    const counts = d.sportsByCity[id] ?? {};
    const primary = d.sports
      .filter((s) => counts[s.slug] != null)
      .map((s) => ({ slug: s.slug, name: s.name, count: counts[s.slug] }))
      .sort((a, b) => b.count - a.count);
    const primarySlugs = new Set(primary.map((p) => p.slug));
    return {
      scope,
      hero: { ...heroBase, city: hc ? { id, ...hc } : null },
      strip: strip ? { tiles: strip.tiles, n: strip.n, curated: strip.curated } : { tiles: [], n: hc?.n ?? 0, curated: false },
      spotlight: d.spotlights.find((s) => s.city === id) ?? null,
      games: { rows: d.gamesByCity[id] ?? [], inScope: d.openGamesByCity[id] ?? 0, total: d.openGamesTotal },
      sports:
        primary.length > 0
          ? {
              primary,
              more: d.sports.filter((s) => !primarySlugs.has(s.slug)).map((s) => ({ slug: s.slug, name: s.name })),
              inCity: true,
            }
          : { primary: d.sports, more: [], inCity: false },
      cityList: { rows: byDistanceFrom(id, d.cityRows.filter((r) => r.id !== id)), total: d.cityRows.length - 1 },
      askCities: [],
      askCityCount,
    };
  }

  return {
    scope,
    hero: { ...heroBase, city: null },
    strip: { tiles: d.nationalTiles, n: d.total, curated: true },
    spotlight: null,
    games: { rows: d.games, inScope: d.openGamesTotal, total: d.openGamesTotal },
    sports: { primary: d.sports, more: [], inCity: false },
    cityList: { rows: d.cityRows.map((r) => ({ ...r, km: null })), total: d.cityRows.length },
    askCities: d.hero.topCities.filter((c) => isKnownCity(c.id)).slice(0, 8),
    askCityCount,
  };
}
