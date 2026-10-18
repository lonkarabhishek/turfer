import { getHomeData } from "@/lib/home/data";
import { scopeHome } from "@/lib/home/select";
import { homeJsonLd } from "@/lib/seo/pageMetadata";
import { cityLineFor } from "@/lib/cityLine";
import { CityAsk } from "@/components/city/CityAsk";
import { HomeShell } from "./HomeShell";
import { TopTurfsByCity } from "./TopTurfsByCity";
import { EveryCityList } from "./EveryCityList";
import { OpenGames } from "./OpenGames";
import { SportGrid } from "./SportGrid";
import { NearMeBand } from "./NearMeBand";
import { ToolsRow } from "./ToolsRow";
import { GuidesRow } from "./GuidesRow";
import { FinalBand } from "./FinalBand";
import { plural } from "@/lib/home/format";

/**
 * The home, for one city or all of India. `requested` is the city from
 * the URL the proxy rewrote to (app/c/[city]), or null for the public
 * all-India page that crawlers and "all of India" visitors get. `ask`
 * (app/c/ask, humans whose city is unknown only) adds the first-visit
 * city ask, so crawler HTML never carries it. Never reads cookies or
 * headers, so every variant stays a static ISR page.
 *
 * City view: that city's hero, top turfs, games and sports, then every
 * other city nearest first under "Other cities". All-India view: the
 * national picks with each city named, then every city biggest first.
 */
export async function HomeView({ requested, ask = false }: { requested: string | null; ask?: boolean }) {
  const d = await getHomeData();
  const s = scopeHome(d, requested);
  const line = cityLineFor(s.scope, "#all-cities", "/");
  const india = s.scope.kind === "india";

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd(d)) }} />
      <div id="tt-scope" data-scope={requested ?? ""} data-ask={ask ? "" : undefined} hidden />

      {/* Visitors: the hero. Signed in: LoggedInHome. Everything below is shared. */}
      <HomeShell hero={s.hero} scope={s.scope} line={line} />

      {ask && (
        <CityAsk cities={s.askCities} cityCount={s.askCityCount} page="/" changeHref="#all-cities" />
      )}

      {s.strip.tiles.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-6 md:mt-10">
          <TopTurfsByCity scope={s.scope} tiles={s.strip.tiles} n={s.strip.n} curated={s.strip.curated} spotlight={s.spotlight} />
        </div>
      )}

      <OpenGames scope={s.scope} rows={s.games.rows} inScope={s.games.inScope} total={s.games.total} />

      <SportGrid scope={s.scope} primary={s.sports.primary} more={s.sports.more} inCity={s.sports.inCity} />

      {s.cityList.rows.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12">
          {india ? (
            <EveryCityList
              title="Every city on TapTurf"
              caption={`${plural(s.cityList.total, "city", "cities")}, biggest first.`}
              rows={s.cityList.rows}
              total={s.cityList.total}
            />
          ) : (
            <EveryCityList
              title="Other cities"
              caption={`${plural(s.cityList.total, "city", "cities")}, nearest first.`}
              rows={s.cityList.rows}
              total={s.cityList.total}
              showKm
            />
          )}
        </section>
      )}

      <NearMeBand pins={d.pins} />
      <ToolsRow />
      <GuidesRow posts={d.posts} />
      <FinalBand />
      {ask && <div className="city-ask-spacer" aria-hidden />}
    </>
  );
}
