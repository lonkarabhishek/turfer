import { getOpenGamesCached } from "@/lib/queries/games.server";
import { getLiveCities } from "@/lib/queries/cities";
import { CITY_IDS, guessCityFromAddress, isCity, isKnownCity, labelFor, resolveCityScope } from "@/lib/city";
import { cityLineFor } from "@/lib/cityLine";
import { gamesJsonLd } from "@/lib/seo/pageMetadata";
import { CityAsk } from "@/components/city/CityAsk";
import { GamesListingClient } from "./GamesListingClient";
import type { Game } from "@/types/game";

function cityOf(g: Game): string | null {
  return g.turfs?.city ?? guessCityFromAddress(g.turfs?.address);
}

/** Cities with at least one open game, biggest city first; "across India" when none. */
function gameCitiesLine(games: Game[]): string {
  const rank = new Map(CITY_IDS.map((id, i) => [id, i]));
  const ids = new Set<string>();
  for (const g of games) {
    const c = cityOf(g);
    if (isCity(c)) ids.add(c);
  }
  const labels = [...ids]
    .sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999))
    .map(labelFor);
  if (labels.length === 0) return "across India";
  if (labels.length === 1) return `in ${labels[0]}`;
  return `in ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/**
 * /games for one city or all of India, with the games in the HTML (no
 * client fetch, no skeleton). `requested` is the city from the URL the
 * proxy rewrote to (app/c/[city]/games), or null for the public page.
 * City view: that city's games, then "Open games in other cities".
 * Never reads cookies, headers or searchParams.
 */
export async function GamesView({ requested }: { requested: string | null }) {
  const [games, liveAll] = await Promise.all([getOpenGamesCached(), getLiveCities()]);
  const live = liveAll.filter((c) => isKnownCity(c.id));
  const scope = resolveCityScope(requested, live);
  const id = scope.kind === "city" ? scope.id : null;
  const mine = id ? games.filter((g) => cityOf(g) === id) : games;
  const others = id
    ? games.filter((g) => {
        const c = cityOf(g);
        return Boolean(c && c !== id);
      })
    : [];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(gamesJsonLd(games)) }} />
      {/* SEO: a plain, crawler-visible list of every open game, whichever
          city the visible list below is scoped to. */}
      <div className="sr-only" aria-hidden>
        <h1>Open sports games {gameCitiesLine(games)}</h1>
        {games.length > 0 && (
          <ul>
            {games.map((g) => (
              <li key={g.id}>
                <a href={`/game/${g.id}`}>
                  {g.sport} at {g.turfs?.name || "a local turf"}, {g.date} {g.start_time}
                  {" "}
                  {g.turfs?.address ? `, ${g.turfs.address}` : ""}
                  {" "}
                  {g.price_per_player > 0 ? `₹${g.price_per_player} per player` : "Free"}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div id="tt-scope" data-scope={requested ?? ""} hidden />
      <GamesListingClient
        initialGames={mine}
        otherGames={others}
        scope={scope}
        line={cityLineFor(scope, "/#all-cities", "/games")}
        ask={
          requested === null ? (
            <CityAsk
              cities={live.slice(0, 8).map((c) => ({ id: c.id, label: c.label, n: c.n }))}
              cityCount={live.length}
              page="/games"
              changeHref="/#all-cities"
            />
          ) : null
        }
      />
      {requested === null && <div className="city-ask-spacer" aria-hidden />}
    </>
  );
}
