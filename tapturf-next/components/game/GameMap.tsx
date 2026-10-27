"use client";

import { useState } from "react";
import { useConsent } from "@/lib/consent";
import { MapPlaceholder } from "@/components/consent/MapPlaceholder";

/**
 * The game's Google Maps embed. It loads only after the visitor accepts
 * cookies (lib/consent.ts), or when they tap "Show map" on this one;
 * until then MapPlaceholder stands in, with a plain link to the place.
 */
export function GameMap({ src, openHref }: { src: string; openHref: string | null }) {
  const consent = useConsent();
  const [asked, setAsked] = useState(false);
  if (consent !== "granted" && !asked) {
    return <MapPlaceholder onShow={() => setAsked(true)} openHref={openHref} className="h-[220px]" />;
  }
  return (
    <div className="h-[220px]">
      <iframe
        src={src}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="Game location on Google Maps"
      />
    </div>
  );
}
