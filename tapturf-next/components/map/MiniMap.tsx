"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Expand, RotateCw } from "lucide-react";
import { createEngine, type Engine, type Pin } from "./engine";
import { PickCard } from "./PickCard";
import { fromMapTurf, mapTurfPin, type MapTurfPin, type MapTurfWire } from "@/lib/map/data";
import { nearBounds, nearbyLine, turfMapHref } from "@/lib/map/view";
import type { Rect } from "@/lib/map/pins";
import { turfPath } from "@/lib/utils/turfPath";
import type { Coords } from "@/lib/utils/location";
import type { Turf } from "@/types/turf";

export type MiniMapProps = {
  /** The page's turf, its pin as /map draws it (pagePin). */
  pin: MapTurfPin;
  /** Every turf on the map (GET /api/map/turfs, asked for on the tap), or null when that failed. */
  turfs: Promise<MapTurfWire[] | null>;
  /** Asks for them again ("Try again"). */
  again: () => Promise<MapTurfWire[] | null>;
  /** Opened from the keyboard: focus goes to the map. */
  keyboard: boolean;
};

/** The map's padding: room for the zoom buttons, the same each way so the turf is in the middle. */
const PAD = { top: 36, bottom: 36, left: 44, right: 44 };

function othersOf(list: readonly Turf[] | null | undefined, key: string): Coords[] {
  return (list ?? []).filter((t) => t.id !== key).map((t) => ({ lat: t.lat as number, lng: t.lng as number }));
}

/**
 * A turf page's map, in the card "This turf on the map" opens (TurfOnMap
 * imports this module on the tap: MapLibre, OpenFreeMap's street map and
 * every turf's pin load only then). It is /map's engine and pins: centred
 * on the turf, out to its nearest neighbours (nearBounds), its own pin
 * picked (deep teal, in full, on top) and never in a bubble
 * (EngineOptions.alone), the others as on /map, bubbles splitting as it
 * zooms. A tap on another turf's pin opens that turf's page; a bubble at
 * one site lists its turfs (PickCard). One finger scrolls the page, two
 * move the map (EngineOptions.inPage). Under it, where the card said
 * what a tap does: how many turfs are near, and "Open full map", to /map
 * around the turf with its card open (?turf=).
 */
export function MiniMap({ pin, turfs, again, keyboard }: MiniMapProps) {
  const mapEl = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const router = useRouter();
  const [load, setLoad] = useState(turfs);
  /** Every turf on the map: undefined on the way, null when they could not be had. */
  const [all, setAll] = useState<Turf[] | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [styleError, setStyleError] = useState(false);
  const [mapError, setMapError] = useState(false);
  /** A bubble at one site, tapped: its turfs. */
  const [pick, setPick] = useState<Turf[] | null>(null);
  const byKey = useRef(new Map<string, Turf>());

  /** What sits over the map (its zoom buttons, its credit): pins there show a dot. */
  const covered = useCallback((): Rect[] => {
    const el = mapEl.current;
    if (!el) return [];
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll(".maplibregl-ctrl-top-right > *, .maplibregl-ctrl-bottom-left > *")].map((c) => {
      const r = c.getBoundingClientRect();
      return [r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top] as const;
    });
  }, []);

  // The turfs, then the map: it starts on the turf's own view, never elsewhere first. After "Try again" it takes in that view.
  useEffect(() => {
    let dead = false;
    load.then((wire) => {
      if (dead) return;
      const list = wire ? wire.map(fromMapTurf) : null;
      byKey.current = new Map((list ?? []).map((t) => [t.id, t]));
      setAll(list);
      const view = nearBounds(pin, othersOf(list, pin.key));
      if (engine.current) {
        if (list) engine.current.fitTo(view, false);
        return;
      }
      if (!mapEl.current) return;
      try {
        engine.current = createEngine(mapEl.current, {
          bounds: view,
          exact: false,
          padding: () => PAD,
          covered,
          zoomButtons: true,
          inPage: true,
          alone: pin.key,
          onView: () => {},
          onPick: (keys) => {
            if (!keys || keys.length < 2) {
              setPick(null);
              if (keys?.[0] && keys[0] !== pin.key) router.push(turfPath({ id: keys[0] }));
              return;
            }
            setPick(keys.map((k) => byKey.current.get(k)).filter((t): t is Turf => !!t));
          },
          onStyleError: () => setStyleError(true),
        });
        setReady(true);
        if (keyboard) engine.current.focusMap();
      } catch (e) {
        console.warn("map: could not start", e);
        setMapError(true);
      }
    });
    return () => {
      dead = true;
    };
  }, [load, pin, keyboard, covered, router]);
  useEffect(
    () => () => {
      engine.current?.destroy();
      engine.current = null;
    },
    [],
  );

  const pins = useMemo<Pin[]>(() => {
    const out: Pin[] = (all ?? []).map((t) => {
      if (t.id === pin.key) return { ...pin, label: `${pin.label}, this turf` };
      const p = mapTurfPin(t);
      return { ...p, label: `${p.label}. Opens its page` };
    });
    // The page's own turf, even when the map's copy of the turfs does not have it (yet).
    if (!(all ?? []).some((t) => t.id === pin.key)) out.unshift({ ...pin, label: `${pin.label}, this turf` });
    return out;
  }, [all, pin]);
  useEffect(() => {
    if (!ready) return;
    engine.current?.setPins("turf", pins);
    engine.current?.setActive(pin.key);
  }, [ready, pins, pin.key]);

  const line = all === undefined ? "Finding the turfs nearby" : all === null ? "Couldn't load the turfs nearby." : nearbyLine(pin, othersOf(all, pin.key));

  return (
    <>
      {/* MapLibre makes its container position: relative, so the box that fills the card above its foot is this wrapper. */}
      <div className="absolute inset-x-0 top-0 bottom-14">
        <div ref={mapEl} className="w-full h-full" />
        {(styleError || mapError) && (
          <p role="status" className="absolute z-10 top-2.5 left-2.5 right-12 rounded-xl bg-white/95 shadow-soft px-3 py-2 text-[12.5px] text-primary-700">
            {mapError ? "This browser can't show the map." : "The street map couldn't load. The pins still work."}
          </p>
        )}
        {pick && pick.length > 0 && (
          <div className="absolute z-20 inset-x-2.5 bottom-2.5 [&_ul]:max-h-[10.5rem]">
            <PickCard turfs={pick.map((t) => ({ turf: t, km: null }))} games={[]} sport={null} onClose={() => setPick(null)} />
          </div>
        )}
      </div>

      {/* The card's foot: what the map shows around the turf (a failed read says so, with a retry), and the whole map. */}
      <div className="absolute inset-x-0 bottom-0 h-14 pl-4 pr-2 flex items-center gap-3 bg-white border-t border-black/5">
        <p aria-live="polite" className="min-w-0 flex-1 text-[13.5px] leading-[1.2] text-primary-700 line-clamp-2">
          {line}
          {all === null && (
            <button
              type="button"
              onClick={() => {
                setAll(undefined);
                setLoad(again());
              }}
              className="ml-1.5 inline-flex items-center gap-1 font-semibold text-primary-900 underline underline-offset-2 cursor-pointer focus-neon rounded"
            >
              <RotateCw className="w-3 h-3" aria-hidden />
              Try again
            </button>
          )}
        </p>
        <Link
          href={turfMapHref(pin.key)}
          prefetch={false}
          className="shrink-0 h-10 pl-3.5 pr-4 inline-flex items-center gap-2 rounded-full bg-primary-900 text-white text-[14px] font-semibold hover:bg-primary-700 transition-colors press-tight focus-neon"
        >
          <Expand className="w-4 h-4" aria-hidden />
          Open full map
        </Link>
      </div>
    </>
  );
}
