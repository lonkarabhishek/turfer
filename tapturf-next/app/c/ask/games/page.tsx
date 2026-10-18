import { GAMES_METADATA } from "@/lib/seo/pageMetadata";
import { GamesView } from "@/components/game/GamesView";

// The all-India /games plus the first-visit city ask, for humans whose
// city is unknown (proxy rewrite). Same window, metadata and canonical
// as app/games/page.tsx. Never read the request here.
export const revalidate = 60;
export const metadata = GAMES_METADATA;

export default function AskGamesPage() {
  return <GamesView requested={null} ask />;
}
