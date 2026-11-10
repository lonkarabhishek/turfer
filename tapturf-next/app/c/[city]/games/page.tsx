import { GAMES_METADATA } from "@/lib/seo/pageMetadata";
import { GamesView } from "@/components/game/GamesView";
import { setListScope } from "@/lib/queries/listScope";

// /games for one city (proxy rewrite). Same window as app/games/page.tsx:
// 10 minutes, and the games key marks it stale within about a minute of a
// game changing (GamesView carries the games tag).
export const revalidate = 600;
export const metadata = GAMES_METADATA;

export default async function CityGamesPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  setListScope(city);
  return <GamesView requested={city} />;
}
