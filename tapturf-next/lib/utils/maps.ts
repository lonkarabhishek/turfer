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
