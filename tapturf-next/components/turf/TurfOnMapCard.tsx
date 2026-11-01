import type { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import type { Turf } from "@/types/turf";
import { MAP_COLORS } from "@/lib/map/clusters";
import { pagePin } from "@/lib/map/data";
import { areaFor } from "@/lib/utils/area";
import { isCity, labelFor } from "@/lib/city";
import { TurfOnMap } from "./TurfOnMap";

/** Two main roads, each a white line on a grey edge. */
const ROADS = "M-10 166C90 128 210 150 410 98M150-10C172 60 160 140 214 214";

/**
 * "This turf on the map", under "Where you'll play": the turf on TapTurf's
 * own map (/map), with the turfs around it. Only for a turf the map has a
 * point for (pagePin; none at 0,0). The card is drawn here, in the page's
 * HTML, from nothing outside it, and kept small (every turf page carries
 * it, in its HTML and again in its flight data): a few streets, a park
 * and some water in the light street map's colours, the same for every
 * turf (a picture of a map, not this turf's streets); the turf's pin as
 * /map draws it picked (its name and price per hour on deep teal), where
 * it is, and what a tap does. No tile, script or request goes out for it;
 * the tap loads the real map in the same card (TurfOnMap, MiniMap).
 */
export function TurfOnMapCard({ turf }: { turf: Turf }) {
  const pin = pagePin(turf);
  if (!pin) return null;
  const city = isCity(turf.city) ? labelFor(turf.city) : null;
  const area = areaFor(turf);
  const where = area && city && !area.toLowerCase().includes(city.toLowerCase()) ? `${area}, ${city}` : area || city;
  return (
    <div className="mt-8">
      <h3 className="text-[17px] font-semibold text-primary-800 mb-3">This turf on the map</h3>
      <TurfOnMap pin={pin}>
        <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <path d="M-10 128C30 112 70 122 104 150S150 214 150 214H-10Z" fill="#e2ebd9" />
          <path d="M318-10C300 30 322 64 410 74V-10Z" fill="#d5e3ea" />
          <path d="M58-10L84 214M262-10L286 214M-10 58L410 36M120 96L410 170" fill="none" stroke="#fbfbf8" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          <path d={ROADS} fill="none" stroke="#e1e2dc" strokeWidth="11" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={ROADS} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* The pin in the middle of the picture; once open, its pill about where the map puts the turf's. A teal dot in a white ring marks its point, as /map's pins shrink to. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-[41%] -translate-1/2 flex flex-col items-center group-data-[open]/onmap:top-[47%]"
          style={{ "--tt-deep": MAP_COLORS.deep, "--tt-teal": MAP_COLORS.teal } as CSSProperties}
        >
          <span className="h-[30px] px-3 flex items-center rounded-full border border-white bg-(--tt-deep) text-white text-[13.5px] whitespace-nowrap shadow-md motion-safe:transition-transform group-hover:scale-[1.04]">
            <b className="font-semibold">{pin.name}</b>
            {pin.tail && (
              <>
                <span className="mx-1.5 text-white/50">|</span>
                <b className={pin.short ? "tabular-nums" : "font-medium"}>{pin.tail}</b>
              </>
            )}
          </span>
          <span className="mt-1.5 size-3.5 rounded-full border-2 border-white bg-(--tt-deep) ring-4 ring-(--tt-teal)/25" />
          {where && <span className="mt-1 px-2 rounded-full bg-white/80 text-[11.5px] font-semibold text-primary-500">{where}</span>}
        </span>
        <span className="absolute inset-x-0 bottom-0 h-14 px-4 flex items-center gap-3 bg-white border-t border-black/5 text-[14px] leading-snug text-primary-600 group-data-[open]/onmap:hidden">
          <span className="flex-1">
            <b className="font-semibold text-primary-900">Tap to see it on the TapTurf map</b>, with the turfs nearby
          </span>
          <ChevronRight aria-hidden className="shrink-0 size-5 text-primary-400" />
        </span>
      </TurfOnMap>
    </div>
  );
}
