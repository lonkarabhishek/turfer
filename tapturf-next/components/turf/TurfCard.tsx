"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Navigation, Star } from "lucide-react";
import { getMinimumPrice } from "@/lib/utils/prices";
import type { Turf } from "@/types/turf";

interface TurfCardProps {
  turf: Turf;
  distanceKm?: number | null;
  /** Set on the first ~3 above-the-fold cards so the LCP image loads eagerly + high priority. */
  priority?: boolean;
}

export function TurfCard({ turf, distanceKm, priority = false }: TurfCardProps) {
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
    <Link
      href={`/turf/${turf.id}`}
      className="block group rounded-2xl focus-neon"
    >
      <article className="card-lift relative overflow-hidden rounded-2xl border border-primary-200 bg-white hover:border-accent-500 hover:shadow-card-hover">
        {/* Image */}
        <div className="relative w-full aspect-[4/3] overflow-hidden bg-primary-100">
          {coverImage && !imgError ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverImage}
              alt={turf.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading={priority ? "eager" : "lazy"}
              // @ts-expect-error — fetchpriority is a valid HTML attr not yet in React types
              fetchpriority={priority ? "high" : "auto"}
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-accent-300 to-accent-500 flex items-center justify-center">
              <span className="font-display uppercase text-4xl text-white/80">Turf</span>
            </div>
          )}

          {/* Bottom-fade for legibility */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

          {/* Sport badges (top-left) */}
          {sports.length > 0 && (
            <div className="absolute top-3 left-3 flex gap-1.5">
              {sports.map((sport) => (
                <span
                  key={sport}
                  className="bg-white text-[10px] font-bold uppercase tracking-wide text-primary-800 px-2.5 py-1 rounded-full shadow-soft"
                >
                  {sport}
                </span>
              ))}
            </div>
          )}

          {/* Rating pill (top-right) */}
          {turf.rating > 0 && (
            <div className="absolute top-3 right-3 bg-accent-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-neon">
              <Star className="w-3 h-3 fill-current" />
              {turf.rating.toFixed(1)}
            </div>
          )}

          {/* Distance (bottom-right) */}
          {distanceLabel && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white text-primary-800 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-soft">
              <Navigation className="w-2.5 h-2.5 text-accent-500" />
              {distanceLabel}
            </div>
          )}

          {/* Turf name burned onto image */}
          <div className="absolute bottom-3 left-3 right-16">
            <h3 className="font-display uppercase text-white text-xl leading-tight tracking-tight truncate drop-shadow-lg">
              {turf.name}
            </h3>
            <p className="text-[11px] text-white/85 flex items-center gap-1 truncate mt-0.5">
              <MapPin className="w-3 h-3 shrink-0" />
              {turf.address}
            </p>
          </div>
        </div>

        {/* Footer strip */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-primary-200 bg-white">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-primary-400">
              From
            </p>
            <p className="font-display text-xl text-primary-800 tabular leading-none mt-0.5">
              ₹{minPrice}
              <span className="text-xs text-primary-400 font-sans font-normal ml-1">/hr</span>
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent-600 border border-accent-500 rounded-full px-3 py-1.5">
            Book · Call
          </span>
        </div>
      </article>
    </Link>
  );
}
