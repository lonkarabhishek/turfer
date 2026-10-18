import { getOpenGamesCached } from "@/lib/queries/games.server";
import { getLiveCities } from "@/lib/queries/cities";
import { guessCityFromAddress, isKnownCity, resolveCityScope } from "@/lib/city";
import { cityLineFor } from "@/lib/cityLine";
import { gamesJsonLd } from "@/lib/seo/pageMetadata";
import { CityAsk } from "@/components/city/CityAsk";
import { GamesListingClient } from "./GamesListingClient";
import type { Game } from "@/types/game";

function cityOf(g: Game): string | null {
  return g.turfs?.city ?? guessCityFromAddress(g.turfs?.address);
}

/**
 * /games for one city or all of India, with the games in the HTML (no
 * client fetch, no skeleton). `requested` is the city from the URL the
 * proxy rewrote to (app/c/[city]/games), or null for the public page.
 * City view: that city's games, then "Open games in other cities".
 * Never reads cookies, headers or the query string.
 */
export async function GamesView({ requested }: { requested: string | null }) {
  const [{ games, at }, liveAll] = await Promise.all([getOpenGamesCached(), getLiveCities()]);
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
      <div id="tt-scope" data-scope={requested ?? ""} hidden />
      <GamesListingClient
        initialGames={mine}
        otherGames={others}
        scope={scope}
        renderedAt={at}
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
