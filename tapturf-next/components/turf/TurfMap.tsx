"use client";

import { MapPin } from "lucide-react";

interface TurfMapProps {
  /** DB "Gmap Embed link" — may be an iframe snippet or a plain URL. */
  embedLink?: string | null;
  /** Coordinates from turfs.lat / turfs.lng. Preferred over embedLink. */
  lat?: number | null;
  lng?: number | null;
  /** Human address, used for the fallback search embed and the directions link. */
  address?: string | null;
  /** Turf name — nicer label on the directions link. */
  name?: string | null;
}

/**
 * Extracts a src URL from an <iframe> snippet or returns the input if it
 * already looks like a URL. Only Google Maps EMBED URLs work inside an
 * iframe — a plain `/maps/place/` or shortlink is served with an
 * X-Frame-Options header that refuses framing ("www.google.com refused
 * to connect"). We detect embed URLs specifically.
 */
function extractEmbeddableSrc(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const srcMatch = trimmed.match(/\bsrc\s*=\s*"([^"]+)"/i);
  const candidate = srcMatch ? srcMatch[1] : trimmed;
  // Google's embeddable formats: /maps/embed?..., /maps/embed/v1/...,
  // maps.google.com/maps?...&output=embed
  if (/google\.[^/]+\/maps\/embed/i.test(candidate)) return candidate;
  if (/[?&]output=embed\b/i.test(candidate)) return candidate;
  // Anything else (a shared /maps/place/… URL, a maps.app.goo.gl link)
  // is NOT embeddable and would render as an error frame.
  return null;
}

function buildLatLngEmbed(lat: number, lng: number): string {
  // Standard "q=" search embed keyed to a lat/lng point. Works without
  // an API key and reliably drops a pin.
  return `https://www.google.com/maps?q=${lat},${lng}&z=16&hl=en&output=embed`;
}

function buildAddressEmbed(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

function buildDirectionsHref({
  lat,
  lng,
  address,
  name,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
  address: string | null | undefined;
  name: string | null | undefined;
}): string | null {
  if (lat != null && lng != null) {
    // Use Google's universal directions URL — opens the app on mobile,
    // browser on desktop. Coord is more accurate than the address.
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}${
      name ? `&destination_place_id=&travelmode=driving` : ""
    }`;
  }
  if (address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  }
  return null;
}

export function TurfMap({ embedLink, lat, lng, address, name }: TurfMapProps) {
  // Priority: lat/lng > embeddable iframe/URL > address search embed.
  let src: string | null = null;
  if (lat != null && lng != null) {
    src = buildLatLngEmbed(lat, lng);
  } else if (embedLink) {
    src = extractEmbeddableSrc(embedLink);
  }
  if (!src && address) {
    src = buildAddressEmbed(address);
  }
  if (!src) return null;

  const directionsHref = buildDirectionsHref({ lat, lng, address, name });

  return (
    <div className="rounded-2xl overflow-hidden border border-primary-100 bg-primary-50">
      <iframe
        src={src}
        width="100%"
        height="360"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="Turf location on Google Maps"
      />
      {directionsHref && (
        <a
          href={directionsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-primary-700 hover:bg-primary-100 transition-colors"
        >
          <MapPin className="w-4 h-4" />
          Get directions
        </a>
      )}
    </div>
  );
}
