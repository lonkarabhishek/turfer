import { GAMES_METADATA } from "@/lib/seo/pageMetadata";
import { GamesView } from "@/components/game/GamesView";

// /games for one city (proxy rewrite). Same window as app/games/page.tsx.
export const revalidate = 60;
export const dynamicParams = false;
export const metadata = GAMES_METADATA;

export default async function CityGamesPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  return <GamesView requested={city} />;
}
