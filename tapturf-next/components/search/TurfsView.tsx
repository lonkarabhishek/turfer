import Link from "next/link";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { getAllActiveTurfs } from "@/lib/queries/turfs";
import { getTrendingPicks, toSpotlights } from "@/lib/queries/trending";
import { getLiveCities } from "@/lib/queries/cities";
import { forCard } from "@/lib/utils/cardTurf";
import { byDistanceFrom, isKnownCity, resolveCityScope } from "@/lib/city";
import { cityLineFor } from "@/lib/cityLine";
import { CityLine } from "@/components/city/CityLine";
import { TurfListingClient } from "./TurfListingClient";

const PILL =
  "h-11 px-4 inline-flex items-center gap-1.5 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-medium text-primary-900 press-tight focus-neon";

/**
 * /turfs for one city or all of India. `requested` is the city from the
 * URL the proxy rewrote to (app/c/[city]/turfs), or null for the public
 * all-India page (crawlers and ?q= searches). A city page ships only that city's cards (one small
 * per-city query) and lists the other cities, nearest first, at the
 * bottom. Never reads cookies, headers or the query string.
 */
export async function TurfsView({ requested }: { requested: string | null }) {
  const live = (await getLiveCities()).filter((c) => isKnownCity(c.id));
  const scope = resolveCityScope(requested, live);
  const cityId = scope.kind === "city" ? scope.id : null;
  const [turfs, picks] = await Promise.all([getAllActiveTurfs(cityId), getTrendingPicks()]);

  const pick = cityId ? picks[cityId] : undefined;
  const spotlight = cityId ? (toSpotlights(pick ? { [cityId]: pick } : {}, turfs)[0] ?? null) : null;
  const trendingIds = cityId ? (pick ? [pick.turfId] : []) : Object.values(picks).map((p) => p!.turfId);
  const n = turfs.length.toLocaleString("en-IN");

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 md:py-10">
      <div id="tt-scope" data-scope={requested ?? ""} hidden />
      {/* Ask follows the city on screen (a fallback view shows a nearby one). */}
      <AskPageContext city={scope.kind === "city" ? scope.id : null} />
      <h1 className="text-[32px] md:text-[40px] text-primary-900 font-display leading-tight">Find your turf</h1>
      <CityLine {...cityLineFor(scope, "#turfs-by-city", "/turfs")} />
      <Link href="/turf-near-me" className="inline-block text-[15px] font-medium text-accent-600 hover:text-accent-700">
        Turfs near me, sorted by distance
      </Link>
      <p className="mt-1 mb-6 text-[15px] text-primary-600">
        {scope.kind === "city" ? (
          <>
            <span className="tabular-nums">{n}</span> sports turfs in {scope.label} with prices, ratings and directions.
          </>
        ) : (
          <>
            <span className="tabular-nums">{n}</span> sports turfs across {live.length.toLocaleString("en-IN")} cities with prices, ratings and
            directions.
          </>
        )}
      </p>

      <TurfListingClient turfs={turfs.map(forCard)} scope={scope} spotlight={spotlight} trendingIds={trendingIds} />

      {/* Crawlable links to every city page. In a city view: the other
          cities, nearest first; otherwise biggest first. */}
      {live.length > 0 && (
        <section id="turfs-by-city" className="mt-14" style={{ scrollMarginTop: "4.5rem" }}>
          <h2 className="text-[20px] font-display text-primary-900 mb-4">
            {cityId ? "Turfs in other cities" : "Turfs by city"}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {(cityId ? byDistanceFrom(cityId, live.filter((c) => c.id !== cityId)) : live).map((c) => (
              <li key={c.id}>
                <Link href={`/${c.id}`} className={PILL}>
                  Turfs in {c.label}
                  {c.n > 0 && <span className="text-primary-500 tabular-nums">{c.n}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
