"use client";

import { useRef, useState, useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};
import Link from "next/link";
import { Flame, MapPin, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { summarisePrice } from "@/lib/utils/prices";
import { areaFor } from "@/lib/utils/area";
import { imageUrlForCard } from "@/lib/utils/images";
import type { Turf } from "@/types/turf";
import { turfPath } from "@/lib/utils/turfPath";

interface TurfCardProps {
  turf: Turf;
  distanceKm?: number | null;
  /** Set on the first ~3 above-the-fold cards so the LCP image loads eagerly + high priority. */
  priority?: boolean;
  /** This week's Most Trending Turf in its city: gold frame + badge. */
  trending?: boolean;
  /** Lists that span cities name the city: "Rasbihari Road, Nashik". */
  cityLabel?: string;
}

// Slide duration when a swipe or arrow moves to the next photo.
const FADE_MS = 500;

export function TurfCard({ turf, distanceKm, priority = false, trending = false, cityLabel }: TurfCardProps) {
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
  // Photos that failed to load drop out of the slideshow instead of
  // showing a blank frame; the placeholder appears only if all fail.
  const [broken, setBroken] = useState<string[]>([]);
  const shown = photos.filter((p) => !broken.includes(p));
  const [idx, setIdx] = useState(0);
  const activeIdx = Math.min(idx, Math.max(0, shown.length - 1));
  // Server HTML carries only the first photo per card (240 cards x 9
  // photos was 2,000 <img> tags on /turfs); the rest mount on the client.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const rendered = hydrated ? shown : shown.slice(0, 1);

  // Swipe to change photo. No auto-play: the strip only moves when the
  // player drags it. Touch handling is done by hand rather than with
  // scroll-snap because iOS Safari sometimes fired the card's Link on a
  // swipe; here a swipe sets a flag that cancels the click that follows.
  const [drag, setDrag] = useState(0);
  const touch = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false);
  const go = (next: number) => setIdx(Math.max(0, Math.min(shown.length - 1, next)));
  const onTouchStart = (e: React.TouchEvent) => {
    if (shown.length <= 1) return;
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, horizontal: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const st = touch.current;
    if (!st) return;
    const t = e.touches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;
    if (st.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) st.horizontal = Math.abs(dx) > Math.abs(dy);
    if (st.horizontal) {
      // Resist at the ends so the first and last photo feel anchored.
      const atEdge = (dx > 0 && activeIdx === 0) || (dx < 0 && activeIdx === shown.length - 1);
      setDrag(atEdge ? dx / 3 : dx);
    }
  };
  const onTouchEnd = () => {
    const st = touch.current;
    touch.current = null;
    if (!st || !st.horizontal) {
      setDrag(0);
      return;
    }
    if (Math.abs(drag) > 40) go(activeIdx + (drag < 0 ? 1 : -1));
    setDrag(0);
    swiped.current = true;
    window.setTimeout(() => (swiped.current = false), 300);
  };

  const distanceLabel = distanceKm != null && Number.isFinite(distanceKm)
    ? distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : distanceKm < 10
        ? `${distanceKm.toFixed(1)} km`
        : `${Math.round(distanceKm)} km`
    : null;

  const hasMultiple = shown.length > 1;
  const area = areaFor(turf);
  const base = area ?? turf.address;
  const place =
    cityLabel && !(base ?? "").toLowerCase().includes(cityLabel.toLowerCase())
      ? [base, cityLabel].filter(Boolean).join(", ")
      : base;
  const range = (min: number | null, max: number | null) => {
    const lo = min ?? max ?? 0;
    const hi = max ?? lo;
    return `₹${lo.toLocaleString("en-IN")}${lo !== hi ? `–${hi.toLocaleString("en-IN")}` : ""}`;
  };

  return (
    <Link
      href={turfPath(turf)}
      className="block group rounded-2xl focus-neon"
      onClick={(e) => {
        if (swiped.current) e.preventDefault();
      }}
    >
      <article>
        {/* Photo. Only the pager dots sit on top; everything else lives
            below so the picture reads clean, App Store style. The
            trending pick gets a thin gold frame and one badge. */}
        <div className={trending ? "spotlight-frame rounded-[18px]" : ""}>
        <div
          className="relative w-full aspect-[4/3] overflow-hidden rounded-2xl bg-primary-100"
          style={{ touchAction: "pan-y" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {trending && (
            <span className="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1 rounded-full spotlight-badge px-2.5 py-1 text-[11px] font-semibold shadow-soft pointer-events-none">
              <Flame className="w-3 h-3 fill-[#e0a92e] text-[#b9851f]" />
              Trending this week
            </span>
          )}
          {rendered.length > 0 ? (
            <div
              className="flex h-full w-full"
              style={{
                transform: `translateX(calc(${-activeIdx * 100}% + ${drag}px))`,
                transition: drag === 0 ? `transform ${FADE_MS}ms cubic-bezier(0.2, 0.7, 0.2, 1)` : "none",
              }}
            >
              {rendered.map((src, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={src}
                  src={imageUrlForCard(src)}
                  alt={i === 0 ? turf.name : `${turf.name} photo ${i + 1}`}
                  className="w-full h-full shrink-0 object-cover"
                  loading={priority && i === 0 ? "eager" : "lazy"}
                  // @ts-expect-error — fetchpriority is a valid HTML attr not yet in React types
                  fetchpriority={priority && i === 0 ? "high" : "auto"}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setBroken((b) => (b.includes(src) ? b : [...b, src]))}
                  draggable={false}
                  aria-hidden={i !== activeIdx}
                />
              ))}
            </div>
          ) : (
            <div className="w-full h-full bg-primary-100 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-primary-300" />
            </div>
          )}

          {/* Desktop: arrows on hover. Phones swipe. */}
          {hasMultiple && (
            <>
              {activeIdx > 0 && (
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    go(activeIdx - 1);
                  }}
                  className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full bg-white/90 shadow-soft text-primary-800 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              {activeIdx < shown.length - 1 && (
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    go(activeIdx + 1);
                  }}
                  className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 items-center justify-center rounded-full bg-white/90 shadow-soft text-primary-800 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}

          {hasMultiple && (
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1 rounded-full bg-black/25 backdrop-blur-sm px-1.5 py-1 pointer-events-none">
              {shown.map((_, i) => (
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
            {[place, distanceLabel ? `${distanceLabel} away` : null, turf.is_24x7 ? "Open 24 hours" : null, sports.join(", ") || null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-1 text-[14px] text-primary-900">
            {priceSummary.kind === "real" ? (
              <>
                <span className="font-semibold tabular-nums">{range(priceSummary.min, priceSummary.max)}</span>
                <span className="text-primary-500"> {priceSummary.unit}</span>
              </>
            ) : priceSummary.kind === "reported" ? (
              <>
                <span className="font-semibold tabular-nums">~{range(priceSummary.min, priceSummary.max)}</span>
                <span className="text-primary-500"> {priceSummary.unit}, reported</span>
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
