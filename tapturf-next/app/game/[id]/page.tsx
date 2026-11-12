import type { Metadata } from "next";
import { GameDetailClient } from "@/components/game/GameDetailClient";
import { cache } from "react";
import { permanentRedirect } from "next/navigation";
import { getGameByParam } from "@/lib/queries/games.server";
import { tagGamesRender } from "@/lib/queries/listScope";
import { hostUsernames } from "@/lib/games/hostProfile.server";
import { gameShareImages } from "@/lib/og/gameCard";
import { gameExpiresAt, gameVenue, isGameExpired } from "@/lib/utils/game";
import { keepUntil } from "@/lib/queries/changeMark";
import { gameCityLabel, gameEventJsonLd } from "@/lib/seo/gameJsonLd";
import { OG_BASE, ROBOTS_NOINDEX_FOLLOW, SITE_URL, TWITTER_CARD } from "@/lib/seo/defaults";
import { jsonLdHtml } from "@/lib/seo/jsonLd";
import { tournamentKey } from "@/lib/tournament/server";
import { gameTournamentCode } from "@/lib/tournament/codes";
import { formatFor } from "@/lib/turfSession/plan";

// An ISR page since 10 Nov, kept 10 minutes: until then this route had no
// generateStaticParams, so it was rendered on every request (two game reads
// each, the 60 s revalidate did nothing). The games key (the games trigger:
// a new game, a join, an edit, a cancel, close_past_games) marks every game
// page stale within about a minute (the games tag, app/api/revalidate), so
// its spots and venue follow the game; its robots turn noindex a few
// minutes after it has been played at most (keepUntil). A failed read throws
// (getGameByParam strict): the last good page stays, never a cached
// "Game not found".
export const revalidate = 600;

// The URL is /game/<words>-<code> (lib/utils/gamePath.ts): the folder's
// param is still called id, but it is those words and the first 8 hex
// characters of the game's id, by which the game is found. The old
// /game/<uuid> and a URL whose words are out of date (the game's venue,
// day or time was edited) answer 308 to the current one from here
// (permanentRedirect): games change all the time, so there is no
// build-time map as turfs have. A redirect is an ISR entry like a page.
// A query string on an old uuid link is kept by the proxy (proxy.ts),
// which this page cannot see without becoming dynamic.
//
// None at build: each game page renders on its first visit and is cached.
export function generateStaticParams(): { id: string }[] {
  return [];
}

// Once per render: generateMetadata and the page share it.
const loadGame = cache((param: string) => getGameByParam(param, { strict: true }));

function humanDate(dateStr: string, timeStr?: string): string {
  const iso = timeStr ? `${dateStr}T${timeStr}` : dateStr;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: timeStr ? "numeric" : undefined,
    minute: timeStr ? "2-digit" : undefined,
  });
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const found = await loadGame(id);

  if (!found) {
    return {
      title: "Game not found",
      robots: { index: false, follow: false },
    };
  }
  const { game } = found;
  // The page's own URL: its canonical and og:url, whatever URL asked for it.
  const pageUrl = `${SITE_URL}${found.path}`;

  // Its turf, or the venue its host typed (not on TapTurf): named the same way.
  const place = gameVenue(game);
  const venue = place?.name || "a local turf";
  const when = humanDate(game.date, game.start_time);
  const spotsLeft = Math.max(0, game.max_players - game.current_players);
  const price = game.price_per_player > 0 ? `₹${game.price_per_player}/player` : "Free";

  // Locality follows the venue's own city (a typed venue's in the host's
  // words); with no city on record the description names only the venue
  // instead of guessing a city.
  const cityLabel = gameCityLabel(game, place);
  const title = `${game.sport} at ${venue}, ${when}`;
  const description = `${game.sport} game at ${venue}${cityLabel ? `, ${cityLabel}` : ""} on ${when}. ${spotsLeft} spot${spotsLeft !== 1 ? "s" : ""} left · ${price}. Join in one tap on TapTurf.`;
  // The game's own share card (sport, venue, place, day and time, spots), at the URL of what it says now.
  const card = gameShareImages(game.id, game).og;

  return {
    title,
    description,
    // A game that has been played is no use in search; keep its links followed.
    ...(isGameExpired(game) ? { robots: ROBOTS_NOINDEX_FOLLOW } : {}),
    openGraph: {
      ...OG_BASE,
      images: [card],
      title,
      description,
      url: pageUrl,
    },
    twitter: { ...TWITTER_CARD, images: [{ url: card.url, alt: card.alt }] },
    alternates: { canonical: pageUrl },
  };
}

export default async function GameDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await tagGamesRender();
  const found = await loadGame(id);
  // The old uuid link, or words the game no longer has: 308 to its URL now.
  if (found?.redirect) permanentRedirect(found.redirect);
  const game = found?.game ?? null;
  // Its robots turn noindex once it has been played (generateMetadata,
  // isGameExpired), when nothing writes to the database: kept no longer
  // than a few minutes past that (lib/cache/changeMarks.ts).
  if (game && !isGameExpired(game)) await keepUntil(gameExpiresAt(game), "games");
  // The host's public profile for the organizer url, when they have one shown (else the game page).
  const hosts = game ? await hostUsernames([{ id: game.creator_id, name: game.host_name }]) : null;
  const jsonLd = game ? gameEventJsonLd(game, { id: game.id, path: found!.path, hostUsername: hosts?.get(game.creator_id) ?? null }) : null;
  // A cricket match game's turf session live link: its own tournament code, worked out here (the key is server only).
  const key = tournamentKey();
  const sessionCode = game && key && formatFor(game.sport) ? gameTournamentCode(game.id, key) : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }}
        />
      )}
      {/* The live link copy only when live links are set up (LIVE_WRITE_KEY is server-only). */}
      <GameDetailClient gameId={game?.id ?? id} liveLinks={Boolean(process.env.LIVE_WRITE_KEY)} sessionCode={sessionCode} />
    </>
  );
}
