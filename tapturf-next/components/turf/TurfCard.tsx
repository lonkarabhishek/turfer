"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Navigation } from "lucide-react";
import { StarRating } from "@/components/ui/StarRating";
import { getMinimumPrice } from "@/lib/utils/prices";
import type { Turf } from "@/types/turf";

interface TurfCardProps {
  turf: Turf;
  distanceKm?: number | null;
}

export function TurfCard({ turf, distanceKm }: TurfCardProps) {
  const coverImage = turf.cover_image || (turf.images.length > 0 ? turf.images[0] : null);
  const minPrice = getMinimumPrice(turf);
  const sports = turf.sports.slice(0, 2);
  const [imgError, setImgError] = useState(false);

  const distanceLabel = distanceKm != null
    ? distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : distanceKm < 10
        ? `${distanceKm.toFixed(1)} km`
        : `${Math.round(distanceKm)} km`
    : null;

  return (
    <Link href={`/turf/${turf.id}`} className="group block cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-2xl">
      <article>
        {/* Image */}
        <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-cream-200">
          {coverImage && !imgError ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverImage}
              alt={turf.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <span className="text-4xl">🏟️</span>
            </div>
          )}

          {/* Sport badges */}
          {sports.length > 0 && (
            <div className="absolute top-3 left-3 flex gap-1.5">
              {sports.map((sport) => (
                <span key={sport} className="bg-primary-600/85 backdrop-blur-sm text-[11px] font-semibold text-white px-2.5 py-1 rounded-full">
                  {sport}
                </span>
              ))}
            </div>
          )}

          {/* Rating pill */}
          {turf.rating > 0 && (
            <div className="absolute top-3 right-3 bg-accent-500/90 backdrop-blur-sm text-primary-900 text-[11px] font-bold px-2 py-1 rounded-full flex items-center gap-0.5">
              ★ {turf.rating.toFixed(1)}
            </div>
          )}

          {/* Distance badge */}
          {distanceLabel && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white/95 backdrop-blur-sm text-primary-700 text-[11px] font-bold px-2 py-1 rounded-full shadow-sm">
              <Navigation className="w-2.5 h-2.5 text-primary-500" />
              {distanceLabel}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="mt-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-[15px] text-primary-800 leading-snug group-hover:text-primary-600 transition-colors truncate font-serif">
              {turf.name}
            </h3>
            <StarRating rating={turf.rating} />
          </div>

          <p className="text-sm text-primary-400 truncate mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            {turf.address}
          </p>

          <div className="mt-2 flex items-center justify-between">
            <p>
              <span className="font-bold text-[15px] text-primary-800">₹{minPrice}</span>
              <span className="text-sm text-primary-400"> /hr onwards</span>
            </p>
            <span className="text-xs font-medium text-accent-600 bg-accent-50 border border-accent-200 px-2 py-0.5 rounded-full">
              Book via call
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
