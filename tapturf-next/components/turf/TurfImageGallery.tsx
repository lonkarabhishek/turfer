"use client";

import { useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Camera } from "lucide-react";

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

  if (images.length === 0) {
    return (
      <div className="w-full aspect-[16/9] bg-gradient-to-br from-primary-400 to-primary-600 rounded-2xl flex items-center justify-center">
        <span className="text-6xl">🏟️</span>
      </div>
    );
  }

  return (
    <>
      {/* Airbnb-style gallery grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-2 rounded-2xl overflow-hidden max-h-[480px]">
        {/* Main image - large */}
        <div
          className="md:col-span-2 md:row-span-2 relative cursor-pointer overflow-hidden"
          onClick={() => openLightbox(0)}
        >
          <GalleryImage
            src={images[0]}
            alt="Turf main photo"
            className="w-full h-full object-cover hover:brightness-95 transition-all min-h-[240px] md:min-h-full"
            priority
          />
        </div>

        {/* Side images - 4 smaller */}
        {images.slice(1, 5).map((img, i) => (
          <div
            key={i}
            className="relative cursor-pointer overflow-hidden hidden md:block"
            onClick={() => openLightbox(i + 1)}
          >
            <GalleryImage
              src={img}
              alt={`Turf photo ${i + 2}`}
              className="w-full h-full object-cover hover:brightness-95 transition-all"
            />
            {/* "Show all" overlay on last image */}
            {i === 3 && images.length > 5 && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center hover:bg-black/40 transition-colors">
                <span className="text-white font-medium text-sm flex items-center gap-1.5">
                  <Camera className="w-4 h-4" />
                  Show all {images.length} photos
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile: Show all photos button */}
      {images.length > 1 && (
        <button
          onClick={() => openLightbox(0)}
          className="md:hidden mt-2 w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
        >
          <Camera className="w-4 h-4" />
          Show all {images.length} photos
        </button>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-lightbox"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Counter */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium">
            {currentIndex + 1} / {images.length}
          </div>

          {/* Prev */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-3 md:left-6 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Image */}
          <div
            className="relative max-w-5xl max-h-[85vh] mx-12"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[currentIndex]}
              alt={`Photo ${currentIndex + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Next */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-3 md:right-6 z-10 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full p-2.5 transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      )}
    </>
  );
}
