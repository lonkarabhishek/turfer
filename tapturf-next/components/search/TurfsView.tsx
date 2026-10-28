import Link from "next/link";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { getAllActiveTurfs, getCardTurfs } from "@/lib/queries/turfs";
import { getTrendingPicks, toSpotlights } from "@/lib/queries/trending";
import { trendingFor } from "@/lib/queries/turfList";
import { getLiveCities } from "@/lib/queries/cities";
import { byDistanceFrom, cityPointsOf, resolveCityScope } from "@/lib/city";
import { cityLineFor } from "@/lib/cityLine";
import { CityLine } from "@/components/city/CityLine";
import { TurfListingClient } from "./TurfListingClient";
import { TurfIndex, byName, type IndexGroup } from "./TurfIndex";
import { Fold } from "@/components/ui/Fold";
import { plural } from "@/lib/home/format";
import { DEFAULT_FILTERS, FIRST_PAGE, availableSports, pageOf } from "@/lib/turfList/query";
import { LIST_PREPAINT_JS } from "@/lib/turfList/client";

const PILL =
  "h-11 px-4 inline-flex items-center gap-1.5 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-medium text-primary-900 press-tight focus-neon";

/**
 * /turfs for one city or all of India. `requested` is the city from the
 * URL the proxy rewrote to (app/c/[city]/turfs), or null for the public
 * all-India page (crawlers and ?q= searches). The page renders the first
 * FIRST_PAGE cards of the default list (top rated, trending pick first);
 * "Show more", a search, a sport or a sort fetch batches from
 * GET /api/turfs/list, ranked from the same rows by the same code
 * (lib/turfList/query.ts). Until 28 Oct every turf in scope went to the
 * browser as props (all of India: 4.7 MB of HTML). Every turf in scope
 * still has a plain link, A to Z, at the bottom (TurfIndex), and the other
 * cities, nearest first, after it. Every live city counts and gets a link,
 * curated or not. Never reads cookies, headers or the query string: the
 * listing reads the URL's filters in the browser.
 */
export async function TurfsView({ requested }: { requested: string | null }) {
  const live = await getLiveCities();
  const scope = resolveCityScope(requested, live);
  const cityId = scope.kind === "city" ? scope.id : null;
  const [cards, picks] = await Promise.all([getCardTurfs(cityId), getTrendingPicks()]);
  const turfs = cards.turfs;

  const pick = cityId ? picks[cityId] : undefined;
  // The spotlight reads the full row (photos past the card's four), as before.
  const spotlight = cityId && pick ? (toSpotlights({ [cityId]: pick }, await getAllActiveTurfs(cityId))[0] ?? null) : null;
  const trending = trendingFor(cityId, picks);
  const first = pageOf(turfs, { ...DEFAULT_FILTERS, at: null }, trending, 0, FIRST_PAGE, cards.v);
  const n = turfs.length;

  const sorted = [...turfs].sort(byName);
  let groups: IndexGroup[];
  if (cityId) {
    groups = [{ label: null, turfs: sorted }];
  } else {
    // Biggest city first, as the city links below; a turf in no live city last.
    const byCity = new Map<string, IndexGroup>(live.map((c) => [c.id, { label: c.label, turfs: [] }]));
    const rest: IndexGroup = { label: "Other places", turfs: [] };
    for (const t of sorted) ((t.city && byCity.get(t.city)) || rest).turfs.push(t);
    groups = [...byCity.values(), rest];
  }
  // Nearest first, curated or not (each city placed by cityPoint: its
  // curated centroid, else its turfs' median from the live rows).
  const others = cityId ? byDistanceFrom(cityId, live.filter((c) => c.id !== cityId), cityPointsOf(live)) : live;
  const indexTitle = cityId
    ? `All ${n.toLocaleString("en-IN")} ${n === 1 ? "turf" : "turfs"} in ${scope.kind === "city" ? scope.label : ""}, A to Z`
    : `All ${n.toLocaleString("en-IN")} turfs, by city, A to Z`;

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
            <span className="tabular-nums">{n.toLocaleString("en-IN")}</span> {n === 1 ? "sports turf" : "sports turfs"} in {scope.label} with prices, ratings and
            directions.
          </>
        ) : (
          <>
            <span className="tabular-nums">{n.toLocaleString("en-IN")}</span> {n === 1 ? "sports turf" : "sports turfs"} across{" "}
            {plural(live.length, "city", "cities")} with prices, ratings and directions.
          </>
        )}
      </p>

      {/* Before the first paint: a URL with a search, sport or sort dims these cards until the right ones arrive. */}
      <script dangerouslySetInnerHTML={{ __html: LIST_PREPAINT_JS }} />
      <TurfListingClient
        initial={first}
        sports={availableSports(turfs)}
        scope={scope}
        spotlight={spotlight}
      />

      <TurfIndex title={indexTitle} groups={groups} withArea={!!cityId} />

      {/* Crawlable links to every city page. In a city view: the other
          cities, nearest first; otherwise biggest first. Folded: about
          180 links is a wall on a phone, but every one stays in the
          server HTML for crawlers. */}
      {others.length > 0 && (
        <Fold
          id="turfs-by-city"
          className="mt-6"
          title={cityId ? "Turfs in other cities" : "Turfs by city"}
          sub={cityId ? `${plural(others.length, "city", "cities")}, nearest first` : `${plural(others.length, "city", "cities")}, biggest first`}
        >
          <ul className="flex flex-wrap gap-2">
            {others.map((c) => (
              <li key={c.id}>
                <Link href={`/${c.id}`} className={PILL}>
                  Turfs in {c.label}
                  {c.n > 0 && <span className="text-primary-500 tabular-nums">{c.n}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </div>
  );
}
