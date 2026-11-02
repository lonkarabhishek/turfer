"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { MapTurfPin, MapTurfWire } from "@/lib/map/data";

type MiniMapModule = typeof import("@/components/map/MiniMap");

/** GET /api/map/turfs: the cached JSON /map reads (so "Open full map" finds it in the browser's cache), or null when it could not be had. */
function getTurfs(): Promise<MapTurfWire[] | null> {
  return fetch("/api/map/turfs")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j && Array.isArray(j.turfs) ? (j.turfs as MapTurfWire[]) : null))
    .catch(() => null);
}

/** Two main roads, each a white line on a grey edge. */
const ROADS = "M-10 166C90 128 210 150 410 98M150-10C172 60 160 140 214 214";

/**
 * The card's picture, kept small: a few streets, a park and some water in
 * the light street map's colours, the same for every turf (a picture of a
 * map, not this turf's streets); the turf's pin as /map draws it picked
 * (its name and price per hour on deep teal; the colours are the CSS
 * variables TurfOnMapCard sets), where it is, and what a tap does.
 */
function Picture({ pin, where }: { pin: MapTurfPin; where: string | null }) {
  return (
    <>
      <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
        <path d="M-10 128C30 112 70 122 104 150S150 214 150 214H-10Z" fill="#e2ebd9" />
        <path d="M318-10C300 30 322 64 410 74V-10Z" fill="#d5e3ea" />
        <path d="M58-10L84 214M262-10L286 214M-10 58L410 36M120 96L410 170" fill="none" stroke="#fbfbf8" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <path d={ROADS} fill="none" stroke="#e1e2dc" strokeWidth="11" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={ROADS} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The pin in the middle of the picture; once open, its pill about where the map puts the turf's. A teal dot in a white ring marks its point, as /map's pins shrink to. */}
      <span aria-hidden className="absolute left-1/2 top-[41%] -translate-1/2 flex flex-col items-center group-data-[open]/onmap:top-[47%]">
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
    </>
  );
}

/**
 * "This turf on the map": the island TurfOnMapCard puts under its heading.
 * Before the tap it is the drawn card (Picture: no request, no map script)
 * inside one button. The tap grows the card to the map's height at once,
 * asks for the turfs and imports the map (MiniMap: MapLibre, OpenFreeMap's
 * street map, /map's pins) at the same time; until it draws, the drawn
 * card shows under "Opening the map". The card carries data-open, for its
 * drawing to make room. The button's focus ring is drawn on the card's
 * box, which clips what is inside it; once open, the box holds the focus
 * the button had, so it never drops to the page while the map loads.
 */
export function TurfOnMap({ pin, where }: { pin: MapTurfPin; where: string | null }) {
  const [open, setOpen] = useState<{ turfs: Promise<MapTurfWire[] | null>; keyboard: boolean } | null>(null);
  const [mini, setMini] = useState<MiniMapModule | null>(null);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const counted = useRef(false);

  // Open: focus on the box, from a tap or a key alike (MiniMap moves it into the map from the keyboard). Failed: back on the button, unless the viewer has moved on.
  useLayoutEffect(() => {
    const at = document.activeElement;
    if (open) box.current?.focus({ preventScroll: true });
    else if (failed && (at === box.current || at === document.body)) button.current?.focus({ preventScroll: true });
  }, [open, failed]);

  const show = (e: MouseEvent) => {
    // Counted for the admin once per page, a "Try again" after a failed load not again (lib/map/track.ts, loaded
    // on the tap like the map itself, so the turf page's own payload is as it was).
    if (!counted.current) void import("@/lib/map/track").then((m) => m.countMiniMapOpen(), () => {});
    counted.current = true;
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
      ref={box}
      data-open={open ? "" : undefined}
      tabIndex={open ? -1 : undefined}
      role={open ? "group" : undefined}
      aria-label={open ? "This turf on the map" : undefined}
      className={`group/onmap relative isolate overflow-hidden rounded-2xl border border-primary-100 bg-[#f2f3f0] focus-neon has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-[#16A34A] motion-safe:transition-[height] motion-safe:duration-200 ${
        open ? "h-[304px] md:h-[356px]" : "h-[184px] md:h-[200px]"
      }`}
    >
      {open ? (
        <>
          <div aria-hidden className="absolute inset-0">
            <Picture pin={pin} where={where} />
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
        <button ref={button} type="button" onClick={show} className="group absolute inset-0 block w-full text-left cursor-pointer outline-none">
          <Picture pin={pin} where={where} />
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
