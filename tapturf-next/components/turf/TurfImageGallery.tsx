"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, X, Camera, Maximize2 } from "lucide-react";

function GalleryImage({
  src,
  alt,
  className = "",
  priority = false,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  onClick?: () => void;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center ${className}`}
        onClick={onClick}
      >
        <Camera className="w-8 h-8 text-gray-400" />
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onClick={onClick}
      onError={() => setError(true)}
    />
  );
}

export function TurfImageGallery({ images }: { images: string[] }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mobileIdx, setMobileIdx] = useState(0);

  const mobileScrollRef = useRef<HTMLDivElement | null>(null);
  const thumbRailRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const openLightbox = useCallback((index: number) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  }, []);

  const prev = useCallback(() => {
    setCurrentIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const next = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  const handleMobileScroll = () => {
    const el = mobileScrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== mobileIdx) setMobileIdx(idx);
  };

  // Keyboard navigation in the lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxOpen, next, prev]);

  // Auto-scroll thumbnail rail to the active thumbnail
  useEffect(() => {
    if (!lightboxOpen) return;
    const rail = thumbRailRef.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLElement>(`[data-thumb-idx="${currentIndex}"]`);
    if (active) active.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [currentIndex, lightboxOpen]);

  if (images.length === 0) {
    return (
      <div className="w-full aspect-[16/9] bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 rounded-2xl flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_20%_20%,white,transparent_40%),radial-gradient(circle_at_80%_60%,white,transparent_40%)]" />
        <div className="text-center text-white relative">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Camera className="w-7 h-7" />
          </div>
          <div className="text-sm text-white/85">Photos coming soon</div>
        </div>
      </div>
    );
  }

  const hasMultiple = images.length > 1;

  return (
    <>
      {/* Mobile: full-bleed swipeable carousel */}
      <div className="md:hidden relative -mx-4">
        <div
          ref={mobileScrollRef}
          onScroll={handleMobileScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => openLightbox(idx)}
              className="flex-none w-full snap-start snap-always aspect-[4/3] bg-gray-100 relative"
              aria-label={`Photo ${idx + 1} of ${images.length}`}
            >
              <GalleryImage
                src={img}
                alt={`Turf photo ${idx + 1}`}
                className="w-full h-full object-cover"
                priority={idx === 0}
              />
            </button>
          ))}
        </div>

        {hasMultiple && (
          <>
            <div className="absolute top-3 right-6 bg-black/65 backdrop-blur-sm text-white px-2.5 py-1 rounded-full text-xs font-medium tabular-nums flex items-center gap-1 pointer-events-none">
              <Camera className="w-3 h-3" />
              {mobileIdx + 1} / {images.length}
            </div>
            <div className="flex justify-center gap-1.5 mt-3 px-4">
              {images.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === mobileIdx ? "w-6 bg-primary-600" : "w-1.5 bg-gray-300"
                  }`}
                />
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => openLightbox(mobileIdx)}
          className="absolute bottom-3 right-6 bg-white/95 backdrop-blur px-3 py-1.5 rounded-full text-xs font-semibold shadow-md flex items-center gap-1.5 hover:bg-white transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          View all
        </button>
      </div>

      {/* Desktop: Airbnb-style grid */}
      <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 rounded-2xl overflow-hidden max-h-[480px] relative group/gallery cursor-pointer">
        {/* Main image - large */}
        <div
          className="col-span-2 row-span-2 relative overflow-hidden bg-gray-100"
          onClick={() => openLightbox(0)}
        >
          <GalleryImage
            src={images[0]}
            alt="Turf main photo"
            className="w-full h-full object-cover transition-transform duration-500 group-hover/gallery:scale-[1.02] min-h-[240px] md:min-h-full"
            priority
          />
        </div>

        {/* Side images - 4 smaller, with placeholder tiles when there aren't enough photos */}
        {[1, 2, 3, 4].map((slot) => {
          const img = images[slot];
          return (
            <div
              key={slot}
              className="relative overflow-hidden bg-gray-100"
              onClick={() => img && openLightbox(slot)}
            >
              {img ? (
                <GalleryImage
                  src={img}
                  alt={`Turf photo ${slot + 1}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover/gallery:scale-[1.02] cursor-pointer"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <Camera className="w-6 h-6 text-gray-300" />
                </div>
              )}
            </div>
          );
        })}

        {/* Always-visible "Show all N photos" chip */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openLightbox(0); }}
          className="absolute bottom-4 right-4 z-10 bg-white/95 backdrop-blur px-4 py-2 rounded-lg text-sm font-semibold shadow-md hover:bg-white hover:shadow-lg transition-all flex items-center gap-2 border border-gray-200"
        >
          <Camera className="w-4 h-4" />
          Show all {images.length} {images.length === 1 ? "photo" : "photos"}
        </button>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex flex-col animate-lightbox"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Top bar: counter + close */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 text-white">
            <div className="flex items-center gap-2 text-sm font-medium tabular-nums bg-white/10 backdrop-blur px-3 py-1.5 rounded-full">
              <Camera className="w-4 h-4" />
              {currentIndex + 1} / {images.length}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
              className="w-10 h-10 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full flex items-center justify-center transition-colors"
              aria-label="Close gallery"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main image with swipe */}
          <div
            className="flex-1 relative flex items-center justify-center px-4 overflow-hidden"
            onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null || !hasMultiple) return;
              const dx = e.changedTouches[0].clientX - touchStartX.current;
              touchStartX.current = null;
              if (Math.abs(dx) < 60) return;
              if (dx < 0) next(); else prev();
            }}
          >
            {hasMultiple && (
              <button
                onClick={(e) => { e.stopPropagation(); prev(); }}
                className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full items-center justify-center text-white transition-colors z-10"
                aria-label="Previous photo"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[currentIndex]}
              alt={`Photo ${currentIndex + 1}`}
              className="max-w-full max-h-full object-contain select-none"
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />

            {hasMultiple && (
              <button
                onClick={(e) => { e.stopPropagation(); next(); }}
                className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full items-center justify-center text-white transition-colors z-10"
                aria-label="Next photo"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Thumbnail rail */}
          {hasMultiple && (
            <div
              ref={thumbRailRef}
              onClick={(e) => e.stopPropagation()}
              className="px-4 py-4 flex gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {images.map((img, i) => (
                <button
                  key={i}
                  data-thumb-idx={i}
                  type="button"
                  onClick={() => setCurrentIndex(i)}
                  className={`flex-none h-16 w-20 sm:h-20 sm:w-28 rounded-lg overflow-hidden ring-2 transition-all ${
                    i === currentIndex
                      ? "ring-white opacity-100"
                      : "ring-transparent opacity-55 hover:opacity-90"
                  }`}
                  aria-label={`Go to photo ${i + 1}`}
                  aria-current={i === currentIndex}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
