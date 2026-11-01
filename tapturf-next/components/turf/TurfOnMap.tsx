"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import type { MapTurfPin, MapTurfWire } from "@/lib/map/data";

type MiniMapModule = typeof import("@/components/map/MiniMap");

/** GET /api/map/turfs: the cached JSON /map reads (so "Open full map" finds it in the browser's cache), or null when it could not be had. */
function getTurfs(): Promise<MapTurfWire[] | null> {
  return fetch("/api/map/turfs")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && Array.isArray(j.turfs) ? (j.turfs as MapTurfWire[]) : null))
    .catch(() => null);
}

/**
 * "This turf on the map": the island around the card (TurfOnMapCard).
 * Before the tap it is the drawn card in `children` (server HTML: no
 * request, no map script) inside one button. The tap grows the card to
 * the map's height at once, asks for the turfs and imports the map
 * (MiniMap: MapLibre, OpenFreeMap's street map, /map's pins) at the same
 * time; until it draws, the drawn card shows under "Opening the map". The
 * card carries data-open, for its drawing to make room.
 */
export function TurfOnMap({ pin, children }: { pin: MapTurfPin; children: ReactNode }) {
  const [open, setOpen] = useState<{ turfs: Promise<MapTurfWire[] | null>; keyboard: boolean } | null>(null);
  const [mini, setMini] = useState<MiniMapModule | null>(null);
  const [failed, setFailed] = useState(false);

  const show = (e: MouseEvent) => {
    setFailed(false);
    // A click from Enter or Space carries no pointer: focus then goes to the map.
    setOpen({ turfs: getTurfs(), keyboard: e.detail === 0 });
    import("@/components/map/MiniMap").then(setMini, () => {
      setOpen(null);
      setFailed(true);
    });
  };

  return (
    <div
      data-open={open ? "" : undefined}
      className={`group/onmap relative isolate overflow-hidden rounded-2xl border border-primary-100 bg-[#f2f3f0] motion-safe:transition-[height] motion-safe:duration-200 ${
        open ? "h-[304px] md:h-[356px]" : "h-[184px] md:h-[200px]"
      }`}
    >
      {open ? (
        <>
          <div aria-hidden className="absolute inset-0">
            {children}
          </div>
          {/* The map above a 56 px foot (MiniMap), where the card said what a tap does. */}
          {mini ? (
            <mini.MiniMap pin={pin} turfs={open.turfs} again={getTurfs} keyboard={open.keyboard} />
          ) : (
            <p role="status" className="absolute inset-x-0 bottom-0 h-14 px-4 flex items-center gap-2.5 bg-white border-t border-black/5 text-[13.5px] text-primary-700">
              <span aria-hidden className="w-4 h-4 rounded-full border-2 border-primary-200 border-t-primary-700 motion-safe:animate-spin" />
              Opening the map
            </p>
          )}
        </>
      ) : (
        <button type="button" onClick={show} className="group absolute inset-0 block w-full text-left cursor-pointer rounded-2xl focus-neon">
          {children}
          {failed && (
            <span role="status" className="absolute z-10 top-2.5 inset-x-2.5 rounded-xl bg-white/95 shadow-soft px-3 py-2 text-[12.5px] text-primary-700">
              Couldn&apos;t open the map. Tap to try again.
            </span>
          )}
        </button>
      )}
    </div>
  );
}
