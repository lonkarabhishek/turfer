import type { CSSProperties } from "react";
import type { Turf } from "@/types/turf";
import { MAP_COLORS } from "@/lib/map/clusters";
import { pagePin } from "@/lib/map/data";
import { areaFor } from "@/lib/utils/area";
import { isCity, labelFor } from "@/lib/city";
import { TurfOnMap } from "./TurfOnMap";

/**
 * "This turf on the map", under "Where you'll play": the turf on TapTurf's
 * own map (/map), with the turfs around it. Only for a turf the map has a
 * point for (pagePin; none at 0,0). The card is drawn by its island
 * (TurfOnMap) from the pin and the place, so every turf page carries the
 * drawing once, in its HTML, and only those few words in its flight data;
 * /map's colours for its pin go on here, as CSS variables, so the island
 * does not carry the map's palette. No tile, script or request goes out
 * for it; the tap loads the real map in the same card (MiniMap).
 */
export function TurfOnMapCard({ turf }: { turf: Turf }) {
  const pin = pagePin(turf);
  if (!pin) return null;
  const city = isCity(turf.city) ? labelFor(turf.city) : null;
  const area = areaFor(turf);
  const where = area && city && !area.toLowerCase().includes(city.toLowerCase()) ? `${area}, ${city}` : area || city;
  return (
    <div className="mt-8" style={{ "--tt-deep": MAP_COLORS.deep, "--tt-teal": MAP_COLORS.teal } as CSSProperties}>
      <h3 className="text-[17px] font-semibold text-primary-800 mb-3">This turf on the map</h3>
      <TurfOnMap pin={pin} where={where} />
    </div>
  );
}
