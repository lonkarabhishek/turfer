import { getOpenGamesCached } from "@/lib/queries/games.server";
import { AskPageContext } from "@/components/ask/AskPageContext";
import { getLiveCities } from "@/lib/queries/cities";
import { guessCityFromAddress, resolveCityScope } from "@/lib/city";
import { cityLineFor } from "@/lib/cityLine";
import { gamesJsonLd } from "@/lib/seo/pageMetadata";
import { GamesListingClient } from "./GamesListingClient";
import type { Game } from "@/types/game";
import { jsonLdHtml } from "@/lib/seo/jsonLd";

function cityOf(g: Game): string | null {
  return g.turfs?.city ?? guessCityFromAddress(g.turfs?.address);
}

/**
 * /games for one city or all of India, with the games in the HTML (no
 * client fetch, no skeleton). `requested` is the city from the URL the
 * proxy rewrote to (app/c/[city]/games), or null for the public page
 * (crawlers).
 * City view: that city's games, then "Open games in other cities".
 * Never reads cookies, headers or the query string.
 */
export async function GamesView({ requested }: { requested: string | null }) {
  const [{ games, at }, live] = await Promise.all([getOpenGamesCached(), getLiveCities()]);
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(gamesJsonLd(games)) }} />
      <div id="tt-scope" data-scope={requested ?? ""} hidden />
      {/* Ask follows the city on screen (a fallback view shows a nearby one). */}
      <AskPageContext city={scope.kind === "city" ? scope.id : null} />
      <GamesListingClient
        initialGames={mine}
        otherGames={others}
        scope={scope}
        renderedAt={at}
        line={cityLineFor(scope, "/#all-cities", "/games")}
      />
    </>
  );
}
