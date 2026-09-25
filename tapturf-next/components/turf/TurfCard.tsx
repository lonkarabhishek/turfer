"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Star } from "lucide-react";
import { summarisePrice } from "@/lib/utils/prices";
import { areaFor } from "@/lib/utils/area";
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
  const area = areaFor(turf);
  const place = area ?? turf.address;
  const range = (min: number | null, max: number | null) => {
    const lo = min ?? max ?? 0;
    const hi = max ?? lo;
    return `₹${lo.toLocaleString("en-IN")}${lo !== hi ? `–${hi.toLocaleString("en-IN")}` : ""}`;
  };

  return (
    <Link
      href={`/turf/${turf.id}`}
      className="block group rounded-2xl focus-neon"
    >
      <article>
        {/* Photo. Only the pager dots sit on top; everything else lives
            below so the picture reads clean, App Store style. */}
        <div className="relative w-full aspect-[4/3] overflow-hidden rounded-2xl bg-primary-100">
          {photos.length > 0 ? (
            photos.map((src, i) => {
              const active = i === activeIdx;
              if (imgErrors[i]) {
                return (
                  <div
                    key={`err-${i}`}
                    className={`absolute inset-0 bg-primary-100 flex items-center justify-center transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
                    style={{ transitionDuration: `${FADE_MS}ms` }}
                    aria-hidden={!active}
                  >
                    <MapPin className="w-8 h-8 text-primary-300" />
                  </div>
                );
              }
              return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={`img-${i}`}
                  src={src}
                  alt={i === 0 ? turf.name : `${turf.name} photo ${i + 1}`}
                  className={`absolute inset-0 w-full h-full object-cover transition-[opacity,transform] ${active ? "opacity-100" : "opacity-0"} group-hover:scale-[1.02]`}
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
            <div className="w-full h-full bg-primary-100 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-primary-300" />
            </div>
          )}

          {hasMultiple && (
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1 rounded-full bg-black/25 backdrop-blur-sm px-1.5 py-1 pointer-events-none">
              {photos.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                    i === activeIdx ? "bg-white" : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Text block */}
        <div className="pt-3 px-0.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[16px] font-semibold text-primary-900 leading-snug truncate">
              {turf.name}
            </h3>
            {turf.rating > 0 && (
              <span className="flex items-center gap-1 text-[14px] text-primary-900 shrink-0">
                <Star className="w-3.5 h-3.5 fill-current" />
                <span className="tabular-nums">{turf.rating.toFixed(1)}</span>
                {turf.total_reviews > 0 && (
                  <span className="text-primary-400 tabular-nums">
                    ({turf.total_reviews.toLocaleString("en-IN")})
                  </span>
                )}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[14px] text-primary-500 truncate">
            {[place, distanceLabel ? `${distanceLabel} away` : null, sports.join(", ") || null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-[14px] text-primary-900">
            {priceSummary.kind === "real" ? (
              <>
                <span className="font-semibold tabular-nums">{range(priceSummary.min, priceSummary.max)}</span>
                <span className="text-primary-500"> / hour</span>
              </>
            ) : priceSummary.kind === "reported" ? (
              <>
                <span className="font-semibold tabular-nums">~{range(priceSummary.min, priceSummary.max)}</span>
                <span className="text-primary-500"> / hour, reported</span>
              </>
            ) : (
              <span className="text-primary-500">Check venue for pricing</span>
            )}
          </p>
        </div>
      </article>
    </Link>
  );
}
