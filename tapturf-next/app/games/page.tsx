import { GAMES_METADATA } from "@/lib/seo/pageMetadata";
import { GamesView } from "@/components/game/GamesView";

// 10 minutes (60 s until 10 Nov): the games key (the games trigger, and
// close_past_games through it) marks this page stale within about a minute
// of a game being created, changed or closed (GamesView carries the games
// tag, app/api/revalidate), so the timer is only a backstop. The list
// drops started games again in the browser.
export const revalidate = 600;

// Same metadata and canonical as every app/c/[city]/games variant.
export const metadata = GAMES_METADATA;

export default function GamesPage() {
  return <GamesView requested={null} />;
}
