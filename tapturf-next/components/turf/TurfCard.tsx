"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Navigation, Star } from "lucide-react";
import { summarisePrice } from "@/lib/utils/prices";
import type { Turf } from "@/types/turf";

interface TurfCardProps {
  turf: Turf;
  distanceKm?: number | null;
  /** Set on the first ~3 above-the-fold cards so the LCP image loads eagerly + high priority. */
  priority?: boolean;
}

// How long each photo stays on screen before crossfading to the next.
const SLIDE_MS = 2000;
// Crossfade duration — long enough to feel gentle, short enough to
// not overlap the next tick.
const FADE_MS = 500;

export function TurfCard({ turf, distanceKm, priority = false }: TurfCardProps) {
  // Reject covers that are still tiny thumbs after normalization (e.g.
  // a non-Google URL that ends "=w32-h32-..."). We'd rather show a real
  // photo from images[] than a 32px placeholder.
  const isTinyThumb = (u: string | null) =>
    !!u && /=w(?:\d{1,2}|1\d{2})-h(?:\d{1,2}|1\d{2})\b/.test(u);
  const usableCover =
    turf.cover_image && !isTinyThumb(turf.cover_image) ? turf.cover_image : null;
  const cover = usableCover || (turf.images.length > 0 ? turf.images[0] : null);
  // Build the ordered photo list: cover first (dedup'd), then the rest of the images.
  const photos = (() => {
    if (turf.images.length === 0) return cover ? [cover] : [];
    if (!usableCover) return turf.images;
    return [usableCover, ...turf.images.filter((i) => i !== usableCover)];
  })();

  const priceSummary = summarisePrice(turf);
  const sports = turf.sports.slice(0, 2);
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({});
  const [activeIdx, setActiveIdx] = useState(0);

  // Auto-slideshow. The manual scroll-snap carousel felt fine on
  // desktop but glitched on iOS Safari — a swipe on the card would
  // sometimes trigger the parent Link's navigation before the
  // scroll-snap kicked in, and sometimes stall between snap points.
  // Replaced with a plain interval so users always see every photo
  // without touching anything, and tapping the card just navigates.
  useEffect(() => {
    if (photos.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveIdx((i) => (i + 1) % photos.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [photos.length]);

  const distanceLabel = distanceKm != null && Number.isFinite(distanceKm)
    ? distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : distanceKm < 10
        ? `${distanceKm.toFixed(1)} km`
        : `${Math.round(distanceKm)} km`
    : null;

  const hasMultiple = photos.length > 1;

  return (
    <Link
      href={`/turf/${turf.id}`}
      className="block group rounded-2xl focus-neon"
    >
      <article className="card-lift relative overflow-hidden rounded-2xl border border-primary-200 bg-white hover:border-accent-500 hover:shadow-card-hover">
        {/* Image area — a stack of images, only the active one at
            opacity:1. Crossfades every SLIDE_MS via the effect above. */}
        <div className="relative w-full aspect-[4/3] overflow-hidden bg-primary-100">
          {photos.length > 0 ? (
            photos.map((src, i) => {
              const active = i === activeIdx;
              if (imgErrors[i]) {
                return (
                  <div
                    key={`err-${i}`}
                    className={`absolute inset-0 bg-gradient-to-br from-accent-300 to-accent-500 flex items-center justify-center transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
                    style={{ transitionDuration: `${FADE_MS}ms` }}
                    aria-hidden={!active}
                  >
                    <span className="font-display uppercase text-4xl text-white/80">Turf</span>
                  </div>
                );
              }
              return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={`img-${i}`}
                  src={src}
                  alt={i === 0 ? turf.name : `${turf.name} photo ${i + 1}`}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity ${active ? "opacity-100" : "opacity-0"} group-hover:scale-[1.02]`}
                  style={{ transitionDuration: `${FADE_MS}ms` }}
                  loading={priority && i === 0 ? "eager" : "lazy"}
                  // @ts-expect-error — fetchpriority is a valid HTML attr not yet in React types
                  fetchpriority={priority && i === 0 ? "high" : "auto"}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setImgErrors((prev) => ({ ...prev, [i]: true }))}
                  draggable={false}
                  aria-hidden={!active}
                />
              );
            })
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-accent-300 to-accent-500 flex items-center justify-center">
              <span className="font-display uppercase text-4xl text-white/80">Turf</span>
            </div>
          )}

          {/* Bottom-fade for legibility */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

          {/* Sport badges (top-left) */}
          {sports.length > 0 && (
            <div className="absolute top-3 left-3 flex gap-1.5 pointer-events-none">
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
            <div className="absolute top-3 right-3 bg-accent-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-neon pointer-events-none">
              <Star className="w-3 h-3 fill-current" />
              {turf.rating.toFixed(1)}
            </div>
          )}

          {/* Distance (bottom-right) */}
          {distanceLabel && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-white text-primary-800 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shadow-soft pointer-events-none">
              <Navigation className="w-2.5 h-2.5 text-accent-500" />
              {distanceLabel}
            </div>
          )}

          {/* Turf name burned onto image */}
          <div className="absolute bottom-3 left-3 right-16 pointer-events-none">
            <h3 className="font-display uppercase text-white text-xl leading-tight tracking-tight truncate drop-shadow-lg">
              {turf.name}
            </h3>
            <p className="text-[11px] text-white/85 flex items-center gap-1 truncate mt-0.5">
              <MapPin className="w-3 h-3 shrink-0" />
              {turf.address}
            </p>
          </div>

          {/* Photo pager dots (only when multiple photos) */}
          {hasMultiple && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-1 pointer-events-none">
              {photos.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === activeIdx ? "w-4 bg-white" : "w-1 bg-white/60"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer strip */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-primary-200 bg-white">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-primary-400">
              {priceSummary.kind === "real"
                ? "From"
                : priceSummary.kind === "reported"
                  ? "Reported"
                  : "Contact"}
            </p>
            <p className="font-display text-lg sm:text-xl text-primary-800 tabular leading-none mt-0.5 truncate">
              {priceSummary.kind === "unknown" ? (
                "Price on request"
              ) : priceSummary.kind === "real" ? (
                <>
                  ₹{priceSummary.min}
                  {priceSummary.min !== priceSummary.max ? `–₹${priceSummary.max}` : ""}
                  <span className="text-xs text-primary-400 font-sans font-normal ml-1">/hr</span>
                </>
              ) : (
                <>
                  ~₹{priceSummary.min}
                  {priceSummary.min !== priceSummary.max ? `–₹${priceSummary.max}` : ""}
                  <span className="text-xs text-primary-400 font-sans font-normal ml-1">/hr</span>
                </>
              )}
            </p>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent-600 border border-accent-500 rounded-full px-3 py-1.5 shrink-0">
            Book · Call
          </span>
        </div>
      </article>
    </Link>
  );
}
