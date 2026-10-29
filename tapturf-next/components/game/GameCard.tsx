"use client";

import Link from "next/link";
import { CalendarClock, CircleCheck, MapPin, Users } from "lucide-react";
import type { Game } from "@/types/game";
import { formatGameDay, formatPrice, formatTimeRange, gamePlace, getGameStatus, skillInfo, spotsInfo, turfInfo } from "@/lib/utils/game";
import { sportFamily, sportLabel } from "@/lib/utils/sport";
import { VerifiedTickFor } from "@/components/account/VerifiedTick";
import { Avatar } from "./detail/Avatar";
import { GamePhoto } from "./detail/GamePhoto";
import { LevelMeter } from "./detail/GameFacts";
import { SportGlyph } from "./detail/SportArt";

const chip = "inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap";
const photoChip = "photo-chip inline-flex items-center gap-1.5 h-8 px-3 rounded-full shadow-soft text-[13px] font-semibold whitespace-nowrap";
/** White chips on the photo (photo-chip-light: solid white with a dark border under prefers-contrast: more). */
const lightPhotoChip = `${photoChip} photo-chip-light bg-white/95 text-primary-900`;

/**
 * A game in a list: the turf's photo (or its sport drawing) with the
 * sport on it, when, where, who hosts, the skill level and whether the
 * turf is booked, then players and price. One link, one card. On a turf's
 * own page (hideVenue) there is no photo and no venue: the time leads.
 */
export function GameCard({ game, hideVenue = false, cityLabel, now, eager = false }: {
  game: Game;
  /** On a turf's own page the venue is obvious: no photo, no venue. */
  hideVenue?: boolean;
  /** Lists that span cities pass the city label for turfs with no city on record. */
  cityLabel?: string;
  /** "Today"/"Tomorrow" relative to this instant. Server-rendered lists pass the render time until hydration. */
  now?: number;
  /** The first cards in a list load their photo at once; the rest lazily. */
  eager?: boolean;
}) {
  // `now` is undefined after hydration: the helpers then read the clock themselves.
  const day = formatGameDay(game.date, now);
  const range = formatTimeRange(game.start_time, game.end_time);
  const spots = spotsInfo(game.current_players, game.max_players, false);
  const full = spots.open === 0;
  const live = getGameStatus(game, now) === "live";
  const skill = skillInfo(game.skill_level);
  const turf = turfInfo(game.turf_booked);
  const price = formatPrice(game.price_per_player);
  const sportName = sportLabel(game.sport);
  const place = gamePlace(game.turfs) || cityLabel || "";

  const when = (
    <>
      <span className="whitespace-nowrap">{day.title}</span> · <span className="whitespace-nowrap">{range}</span>
    </>
  );

  return (
    <Link
      href={`/game/${game.id}`}
      className="group flex flex-col card-lift overflow-hidden rounded-3xl border border-primary-200 bg-white shadow-soft hover:shadow-card-hover"
    >
      {!hideVenue && (
        <GamePhoto
          photos={game.turfs?.photos}
          family={sportFamily(game.sport)}
          eager={eager}
          className="relative h-28"
          imgClassName="object-[center_60%]"
        >
          <div className="absolute left-3 top-3 right-3 flex flex-wrap gap-2">
            <span className={lightPhotoChip}>
              <SportGlyph sport={game.sport} className="w-4 h-4 text-accent-700" />
              {sportName}
            </span>
            {full ? (
              <span className={`${photoChip} bg-primary-900 text-white`}>
                <Users className="w-4 h-4" aria-hidden />
                Full
              </span>
            ) : live ? (
              <span className={lightPhotoChip}>
                <span className="pulse-live size-2 rounded-full bg-hot-500" aria-hidden />
                Happening now
              </span>
            ) : null}
          </div>
        </GamePhoto>
      )}

      {/* A column, so in a grid row of cards of different heights the players and price line up at the bottom. */}
      <div className="p-4 flex-1 flex flex-col">
        {hideVenue ? (
          <h3 className="text-[16px] font-semibold text-accent-800 leading-snug">{when}</h3>
        ) : (
          <>
            <p className="text-[14px] font-semibold text-accent-800 leading-snug">{when}</p>
            <h3 className="mt-1 text-[18px] font-bold text-primary-900 leading-snug line-clamp-2 [overflow-wrap:anywhere] group-hover:text-accent-800 transition-colors">
              {game.turfs?.name || `${sportName} game`}
            </h3>
            {place && (
              <p className="mt-1 flex items-center gap-1 text-[14px] text-primary-500 min-w-0">
                <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="truncate">{place}</span>
              </p>
            )}
          </>
        )}

        <p className="mt-2 flex items-center gap-2 min-w-0 text-[13px] text-primary-700">
          <Avatar src={game.host_profile_image_url} name={game.host_name} className="size-5 text-[10px]" />
          <span className="truncate">Hosted by {game.host_name || "a TapTurf player"}</span>
          <VerifiedTickFor id={game.creator_id} className="-ml-1" />
        </p>

        <div className="mt-3 mb-3 flex flex-wrap gap-2">
          {hideVenue && (
            <span className={`${chip} bg-primary-50 border border-primary-200 text-primary-900`}>
              <SportGlyph sport={game.sport} className="w-4 h-4 text-accent-700" />
              {sportName}
            </span>
          )}
          <span className={`${chip} bg-primary-50 border border-primary-200 text-primary-900`}>
            <LevelMeter meter={skill.meter} />
            <span className="sr-only">Skill level: </span>
            {skill.chip}
          </span>
          {turf.booked ? (
            <span className={`${chip} bg-accent-50 border border-accent-200 text-accent-800`}>
              <CircleCheck className="w-4 h-4" aria-hidden />
              {turf.title}
            </span>
          ) : (
            <span className={`${chip} bg-amber-50 border border-amber-200 text-amber-900`}>
              <CalendarClock className="w-4 h-4" aria-hidden />
              {turf.title}
            </span>
          )}
        </div>

        <div className="mt-auto border-t border-primary-100 pt-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[14px] text-primary-700 min-w-0">
            <Users className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
            <span className="truncate tabular">
              {full ? `Full · ${game.current_players} of ${game.max_players}` : `${spots.title} · ${spots.open} open`}
            </span>
          </p>
          {price === "Free" ? (
            <span className="shrink-0 h-7 px-3 inline-flex items-center rounded-full bg-accent-50 text-accent-800 text-[13px] font-semibold">Free</span>
          ) : (
            <span className="shrink-0 leading-7 text-[14px] text-primary-500 whitespace-nowrap">
              <span className="text-[17px] font-bold text-primary-900 tabular">{price}</span> / player
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
