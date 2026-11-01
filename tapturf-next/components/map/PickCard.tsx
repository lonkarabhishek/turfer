"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Star, Users, X } from "lucide-react";
import type { Turf } from "@/types/turf";
import type { Game } from "@/types/game";
import type { MapGame } from "@/lib/map/data";
import { cardPrice, cardSports, type CardSport } from "@/lib/utils/cardSport";
import { priceRangeText } from "@/lib/utils/prices";
import { areaFor } from "@/lib/utils/area";
import { imageUrlForCard, turfPhotos } from "@/lib/utils/images";
import { turfPath } from "@/lib/utils/turfPath";
import { formatDistance } from "@/lib/utils/location";
import { formatGameDay, formatPrice, formatTimeRange, gamePlace, spotsInfo } from "@/lib/utils/game";
import { sportFamily, sportLabel } from "@/lib/utils/sport";
import { isCity, labelFor } from "@/lib/city";
import { PhotoImg } from "@/components/ui/PhotoImg";
import { GamePhoto } from "@/components/game/detail/GamePhoto";

/**
 * The card a tapped pin opens over the map: photo, name, where, sport,
 * price (cardPrice, as every turf card), rating and, once the viewer
 * shared their location, how far. One link to the turf's (or the game's)
 * page; the close button sits outside it. A bubble that cannot split (turfs
 * on one site, or one turf's games, soonest first) lists each of them the
 * same way.
 */
export function PickCard({
  turfs,
  games,
  sport,
  onClose,
}: {
  turfs: { turf: Turf; km: number | null }[];
  games: { game: MapGame; km: number | null }[];
  sport: CardSport | null;
  onClose: () => void;
}) {
  const label = games.length ? (games.length > 1 ? "Games here" : "Picked game") : turfs.length > 1 ? "Turfs here" : "Picked turf";
  return (
    <div role="region" aria-label={label} className="relative rounded-2xl bg-white shadow-elevated border border-primary-200/70 overflow-hidden">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-2 right-2 z-10 w-8 h-8 inline-flex items-center justify-center rounded-full bg-white/95 shadow-soft text-primary-900 hover:bg-primary-100 cursor-pointer focus-neon"
      >
        <X className="w-4 h-4" />
      </button>
      {games.length ? (
        <ul className="max-h-[min(19rem,45vh)] overflow-y-auto overscroll-contain divide-y divide-primary-100">
          {games.map(({ game, km }) => (
            <li key={game.id}>
              <GameRow game={game} km={km} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="max-h-[min(19rem,45vh)] overflow-y-auto overscroll-contain divide-y divide-primary-100">
          {turfs.map(({ turf, km: d }) => (
            <li key={turf.id}>
              <TurfRow turf={turf} sport={sport} km={d} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TurfRow({ turf, sport, km }: { turf: Turf; sport: CardSport | null; km: number | null }) {
  const [broken, setBroken] = useState(false);
  const photo = turfPhotos(turf)[0];
  const price = cardPrice(turf, sport);
  const range = price.kind === "real" || price.kind === "reported" ? priceRangeText(price.min, price.max) : null;
  const city = isCity(turf.city) ? labelFor(turf.city) : null;
  const area = areaFor(turf) ?? turf.address;
  const place = city && area && !area.toLowerCase().includes(city.toLowerCase()) ? `${area}, ${city}` : area || city;
  const sports = cardSports(turf.sports, sport).join(", ");
  return (
    <Link href={turfPath(turf)} className="flex gap-3 p-3 pr-11 hover:bg-primary-50 focus-neon rounded-2xl">
      <div className="relative shrink-0 w-[92px] h-[92px] rounded-xl overflow-hidden bg-primary-100">
        {photo && !broken ? (
          <PhotoImg src={imageUrlForCard(photo)} alt="" className="w-full h-full object-cover" decoding="async" onBroken={() => setBroken(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MapPin className="w-6 h-6 text-primary-300" aria-hidden />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-semibold text-primary-900 leading-snug line-clamp-2 [overflow-wrap:anywhere]">{turf.name}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[13px] text-primary-500 min-w-0">
          {turf.rating > 0 && (
            <span className="inline-flex items-center gap-1 shrink-0 text-primary-900">
              <Star className="w-3 h-3 fill-current" aria-hidden />
              <span className="tabular-nums">{turf.rating.toFixed(1)}</span>
              {turf.total_reviews > 0 && <span className="text-primary-400 tabular-nums">({turf.total_reviews.toLocaleString("en-IN")})</span>}
              <span aria-hidden>·</span>
            </span>
          )}
          <span className="truncate">{[place, km != null ? `${formatDistance(km)} away` : null].filter(Boolean).join(" · ")}</span>
        </p>
        {sports && <p className="text-[13px] text-primary-500 truncate">{sports}</p>}
        <p className="mt-1 text-[14px] text-primary-900">
          {range && price.kind === "real" ? (
            <>
              <span className="font-semibold tabular-nums">{range}</span>
              <span className="text-primary-500"> {price.unit}</span>
            </>
          ) : range && price.kind === "reported" ? (
            <>
              <span className="font-semibold tabular-nums">~{range}</span>
              <span className="text-primary-500"> {price.unit}, reported</span>
            </>
          ) : (
            <span className="text-primary-500">{price.kind === "reported_text" ? "See reported prices" : "Prices not listed yet"}</span>
          )}
        </p>
      </div>
    </Link>
  );
}

function GameRow({ game, km }: { game: MapGame; km: number | null }) {
  const day = formatGameDay(game.date);
  const spots = spotsInfo(game.current_players, game.max_players, false);
  const price = formatPrice(game.price_per_player);
  const place = gamePlace(game.turfs);
  return (
    <Link href={`/game/${game.id}`} className="flex gap-3 p-3 pr-11 hover:bg-primary-50 focus-neon rounded-2xl">
      <GamePhoto photos={game.turfs.photos} family={sportFamily(game.sport)} className="relative shrink-0 w-[92px] h-[92px] rounded-xl overflow-hidden" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-accent-800 leading-snug">
          {sportLabel(game.sport)} · <span className="whitespace-nowrap">{day.short}</span> · <span className="whitespace-nowrap">{formatTimeRange(game.start_time, game.end_time)}</span>
        </p>
        <p className="mt-0.5 text-[16px] font-semibold text-primary-900 leading-snug line-clamp-2 [overflow-wrap:anywhere]">{game.turfs.name}</p>
        <p className="mt-0.5 text-[13px] text-primary-500 truncate">{[place, km != null ? `${formatDistance(km)} away` : null].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 flex items-center gap-2 text-[14px] text-primary-700">
          <Users className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
          <span className="truncate">{spots.short}</span>
          <span className="ml-auto shrink-0 font-semibold text-primary-900 tabular-nums">{price === "Free" ? "Free" : `${price} / player`}</span>
        </p>
      </div>
    </Link>
  );
}

/** A map game as the list's GameCard reads it (it has every field GameCard shows). */
export function asGame(g: MapGame): Game {
  return g as unknown as Game;
}
