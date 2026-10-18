import { GAMES_METADATA } from "@/lib/seo/pageMetadata";
import { GamesView } from "@/components/game/GamesView";

// Revalidate the pre-rendered HTML every 60s so Google sees fresh open games
// without paying a per-request DB cost.
export const revalidate = 60;

// Same metadata and canonical as every app/c/[city]/games variant.
export const metadata = GAMES_METADATA;

export default function GamesPage() {
  return <GamesView requested={null} />;
}
