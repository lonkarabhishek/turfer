"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { StarRating } from "@/components/ui/StarRating";
import { getMinimumPrice } from "@/lib/utils/prices";
import type { Turf } from "@/types/turf";

export function TurfCard({ turf }: { turf: Turf }) {
  const coverImage =
    turf.cover_image || (turf.images.length > 0 ? turf.images[0] : null);
  const minPrice = getMinimumPrice(turf);
  const sports = turf.sports.slice(0, 3);
  const [imgError, setImgError] = useState(false);

  return (
    <Link href={`/turf/${turf.id}`} className="group block">
      <article>
        {/* Image — Airbnb-style rounded, no card border */}
        <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
          {coverImage && !imgError ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverImage}
              alt={turf.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
              <span className="text-4xl">🏟️</span>
            </div>
          )}

          {/* Sport badges overlay */}
          {sports.length > 0 && (
            <div className="absolute top-2 left-2 flex gap-1">
              {sports.slice(0, 2).map((sport) => (
                <span
                  key={sport}
                  className="bg-white/90 backdrop-blur-sm text-[11px] font-medium text-gray-800 px-2 py-0.5 rounded-full"
                >
                  {sport}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Content — Airbnb style: minimal, below image */}
        <div className="mt-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-[15px] text-gray-900 truncate">
              {turf.name}
            </h3>
            <StarRating rating={turf.rating} />
          </div>

          <p className="text-sm text-gray-500 truncate mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            {turf.address}
          </p>

          <p className="mt-1.5">
            <span className="font-semibold text-[15px]">₹{minPrice}</span>
            <span className="text-sm text-gray-500"> /hr onwards</span>
          </p>
        </div>
      </article>
    </Link>
  );
}
