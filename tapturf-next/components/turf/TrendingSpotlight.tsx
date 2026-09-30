"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Flame, MapPin, Star } from "lucide-react";
import { getCityPref, labelFor, type CityId } from "@/lib/city";

/** Everything the spotlight card needs, prepared on the server. */
export interface SpotlightTurf {
  city: CityId;
  turfId: string;
  tagline: string | null;
  name: string;
  place: string;
  rating: number;
  reviews: number;
  photo: string | null;
  sports: string[];
  priceLabel: string | null;
}

/**
 * "Most Trending Turf" spotlight: gold-framed feature card for the
 * turf the team picked for a city this week.
 *
 * mode="by-city": follows the visitor's picked city (header picker or
 *   auto-detect). With no city picked it shows the first pick.
 * mode="fixed": always shows picks[0] (city pages).
 */
export function TrendingSpotlight({
  picks,
  mode = "by-city",
  className = "",
}: {
  picks: SpotlightTurf[];
  mode?: "by-city" | "fixed";
  className?: string;
}) {
  const [city, setCity] = useState<CityId | null>(null);
  const [ready, setReady] = useState(mode === "fixed");

  useEffect(() => {
    if (mode === "fixed") return;
    const load = () => {
      setCity(getCityPref());
      setReady(true);
    };
    load();
    window.addEventListener("tapturf:city-changed", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("tapturf:city-changed", load);
      window.removeEventListener("storage", load);
    };
  }, [mode]);

  if (!ready || picks.length === 0) return null;
  const pick = mode === "fixed" || !city ? picks[0] : picks.find((p) => p.city === city);
  if (!pick) return null;

  // className = outer spacing, so nothing (not even a gap) renders
  // when this city has no pick.
  return (
    <div className={className}>
      <SpotlightCard pick={pick} />
    </div>
  );
}

function SpotlightCard({ pick }: { pick: SpotlightTurf }) {
  const [photoOk, setPhotoOk] = useState(true);
  const cityLabel = labelFor(pick.city);

  return (
    <Link
      href={`/turf/${pick.turfId}`}
      className="group block rounded-3xl overflow-hidden spotlight-ring focus-neon"
      aria-label={`Most trending turf in ${cityLabel} this week: ${pick.name}`}
    >
      <div className="md:flex">
        {/* Photo */}
        <div className="relative md:w-[46%] shrink-0 aspect-[16/10] md:aspect-auto md:min-h-[260px] bg-primary-100 overflow-hidden">
          {pick.photo && photoOk ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={pick.photo}
              alt={`${pick.name}, most trending turf in ${cityLabel}`}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              referrerPolicy="no-referrer"
              onError={() => setPhotoOk(false)}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Flame className="w-10 h-10 text-[#c9962e]/50" />
            </div>
          )}
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full spotlight-badge px-3 py-1.5 text-[12px] font-semibold shadow-soft">
            <Flame className="w-3.5 h-3.5 fill-[#e0a92e] text-[#b9851f]" />
            Most trending in {cityLabel}
          </span>
        </div>

        {/* Details */}
        <div className="p-5 md:p-7 flex flex-col">
          <p className="text-[13px] font-semibold spotlight-text">This week&apos;s spotlight</p>
          <h3 className="mt-1 text-[22px] md:text-[26px] font-display text-primary-900 leading-tight">
            {pick.name}
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-[14px] text-primary-500 min-w-0">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{pick.place}</span>
          </p>

          <div className="mt-3 flex items-center gap-x-3 gap-y-1 flex-wrap text-[14px] text-primary-800">
            {pick.rating > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="w-4 h-4 fill-[#e0a92e] text-[#e0a92e]" />
                <span className="font-semibold tabular-nums">{pick.rating.toFixed(1)}</span>
                {pick.reviews > 0 && (
                  <span className="text-primary-400 tabular-nums">({pick.reviews.toLocaleString("en-IN")})</span>
                )}
              </span>
            )}
            {pick.sports.length > 0 && <span className="text-primary-500">{pick.sports.slice(0, 3).join(", ")}</span>}
            {pick.priceLabel && <span className="text-primary-500">{pick.priceLabel}</span>}
          </div>

          {pick.tagline && (
            <p className="mt-3 text-[15px] leading-relaxed text-primary-700">{pick.tagline}</p>
          )}

          <div className="mt-5 md:mt-auto md:pt-5">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-900 text-white text-[15px] font-semibold h-11 px-5 group-hover:bg-primary-800 transition-colors">
              View turf
              <ChevronRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
