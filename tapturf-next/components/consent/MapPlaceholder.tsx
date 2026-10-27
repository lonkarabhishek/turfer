"use client";

import { ExternalLink, MapPin, Map as MapIcon } from "lucide-react";

/**
 * Where a Google Maps embed goes until the visitor accepts cookies
 * (lib/consent.ts): nothing loads from Google. "Show map" loads this one
 * map (the visitor asked for it); "Open in Google Maps" is a plain link.
 * After Accept the maps load as they always did.
 */
export function MapPlaceholder({
  onShow,
  openHref,
  address,
  className = "",
}: {
  onShow: () => void;
  openHref: string | null;
  /** Shown under the pin when the card around it doesn't already say it. */
  address?: string | null;
  /** Height classes, to match the map it stands in for. */
  className?: string;
}) {
  return (
    <div className={`relative w-full flex flex-col items-center justify-center gap-2.5 px-4 bg-[linear-gradient(135deg,#eef3f1,#e3ebe7)] text-primary-700 ${className}`}>
      <span
        aria-hidden
        className="absolute inset-0 opacity-[0.18] bg-[linear-gradient(#9aa7a1_1px,transparent_1px),linear-gradient(90deg,#9aa7a1_1px,transparent_1px)] bg-[size:28px_28px]"
      />
      <MapPin aria-hidden className="relative w-8 h-8 text-accent-500 drop-shadow" strokeWidth={2.25} />
      {address && <span className="relative text-[13px] text-primary-600 max-w-[85%] text-center leading-snug line-clamp-2">{address}</span>}
      <div className="relative flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onShow}
          className="inline-flex items-center gap-2 rounded-full bg-primary-900 text-white text-[14px] font-semibold px-5 h-10 shadow-soft hover:bg-primary-700 transition-colors focus-neon"
        >
          <MapIcon aria-hidden className="w-4 h-4" />
          Show map
        </button>
        {openHref && (
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-primary-200 text-primary-900 text-[14px] font-semibold px-4 h-10 hover:border-primary-300 transition-colors focus-neon"
          >
            Open in Google Maps
            <ExternalLink aria-hidden className="w-3.5 h-3.5 text-primary-500" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      <p className="relative text-[12px] leading-snug text-primary-500 text-center max-w-[22rem]">
        Maps come from Google, which can see your visit once one loads.
      </p>
    </div>
  );
}
