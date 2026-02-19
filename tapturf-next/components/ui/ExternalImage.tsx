"use client";

import { useState } from "react";

interface ExternalImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  fill?: boolean;
  sizes?: string;
  fallback?: React.ReactNode;
}

export function ExternalImage({
  src,
  alt,
  className = "",
  priority = false,
  fallback,
}: ExternalImageProps) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      fallback || (
        <div className="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
          <span className="text-4xl">🏟️</span>
        </div>
      )
    );
  }

  return (
    /* eslint-disable @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      onError={() => setError(true)}
      referrerPolicy="no-referrer"
    />
  );
}
