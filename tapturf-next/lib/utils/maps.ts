/**
 * A Google Maps link for a place, for "Open in Google Maps" where the
 * embedded map waits for consent (components/consent/MapPlaceholder.tsx).
 * A link, not an embed: nothing loads from Google until it is tapped.
 * The point when we have one, else a search for the name and address;
 * null when there is nothing to search for. No imports.
 */
export function mapsSearchUrl(p: { lat?: number | string | null; lng?: number | string | null; name?: string | null; address?: string | null }): string | null {
  const lat = p.lat == null || p.lat === "" ? NaN : Number(p.lat);
  const lng = p.lng == null || p.lng === "" ? NaN : Number(p.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const q = [p.name, p.address]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/**
 * The Google Maps URL to put in an <iframe> for a place, or null. Only
 * embed URLs can be framed: a shared /maps/place/ link or a
 * maps.app.goo.gl shortlink is served with an X-Frame-Options header and
 * shows as an empty box (the game page did, 29 Oct). Priority: the point
 * (lat, lng) > an embeddable "Gmap Embed link" (iframe snippet or URL) >
 * a search for the address. Used by TurfMap and the game page.
 */
export function mapEmbedSrc(p: { embedLink?: string | null; lat?: number | null; lng?: number | null; address?: string | null }): string | null {
  if (p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)) {
    return `https://www.google.com/maps?q=${p.lat},${p.lng}&z=16&hl=en&output=embed`;
  }
  const raw = p.embedLink?.trim() ?? "";
  const candidate = raw.match(/\bsrc\s*=\s*"([^"]+)"/i)?.[1] ?? raw;
  // Google's embeddable forms: /maps/embed?..., /maps/embed/v1/..., ...&output=embed.
  if (candidate && (/google\.[^/]+\/maps\/embed/i.test(candidate) || /[?&]output=embed\b/i.test(candidate))) return candidate;
  const address = p.address?.trim();
  return address ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed` : null;
}

/**
 * Google Maps directions to a turf, for the no-number card's "Get
 * directions": a plain link (it opens in a new tab), so nothing loads
 * from Google until it is tapped. The destination as the page's own "Get
 * directions" under the map takes it (TurfMap): the point (lat, lng) when
 * the turf has one (not 0,0, which is no place), else its name and
 * address. With the turf's Google place id when it has one, so Maps
 * opens on the place itself (destination_place_id, which Google reads
 * only beside a destination). The "Gmap Embed link" is for the map, not
 * a destination, so it is not read here. Null with nothing to go to.
 */
export function directionsUrl(p: {
  lat?: number | string | null;
  lng?: number | string | null;
  name?: string | null;
  address?: string | null;
  placeId?: string | null;
}): string | null {
  const lat = p.lat == null || p.lat === "" ? NaN : Number(p.lat);
  const lng = p.lng == null || p.lng === "" ? NaN : Number(p.lng);
  const point = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  const text = [p.name, p.address]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .join(", ");
  const destination = point ? `${lat},${lng}` : text ? encodeURIComponent(text) : null;
  if (!destination) return null;
  // Place ids are letters, digits, - and _ (ChIJ..., about 27 long; longer forms exist).
  const id = typeof p.placeId === "string" ? p.placeId.trim() : "";
  const place = /^[A-Za-z0-9_-]{16,300}$/.test(id) ? id : null;
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${place ? `&destination_place_id=${place}` : ""}`;
}
