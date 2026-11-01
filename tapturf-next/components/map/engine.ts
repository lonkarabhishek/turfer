import { AttributionControl, Map as MapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import Supercluster, { type ClusterProperties } from "supercluster";
import { MAX_BOUNDS, bubbleLabel, type Bounds } from "@/lib/map/view";
import { MAP_COLORS, addBubbleSum, averagePrice, avgPriceShort, bubbleSum, countText, type BubbleSum } from "@/lib/map/clusters";
import type { HeatFeatures } from "@/lib/map/heat";
import { NAME_ZOOM, badgeRect, collide, declutter, discRect, placeTags, tagRect, type BubbleSpot, type Lod, type PinSpot, type Rect, type Size } from "@/lib/map/pins";

/**
 * /map's map: MapLibre GL (bundled from npm, loaded only by /map, after
 * the page is up: MapExplorer imports this module dynamically) over
 * OpenFreeMap's street map, with our own HTML pins. Clustering is
 * Supercluster's, here in the page, so the pins for exactly the view are
 * one call away; the pins are buttons (keyboard, screen readers), and
 * only the ones in view (and a margin) are in the page: clusters keep
 * them at least RADIUS px apart, so a phone has a few dozen at most.
 *
 * A turf bubble is TapTurf teal with its count and, under it, the average
 * hourly price of its turfs that list one (lib/map/clusters.ts, summed by
 * Supercluster's map and reduce); where that tag would run into the next
 * bubble it hangs over its disc instead, or is left off (placeTags). A
 * game bubble is the site's green with a calendar. The street map's own
 * labels give way under every bubble and pin (an invisible symbol layer
 * the size of each one, HOLD), so a city name does not run under a
 * bubble. Up close a turf's pin names it and its price per hour ("O2 Turf
 * | ₹500/hr"); where pins would run into each other or a bubble, the
 * later ones (lib/map/pins.ts declutter) show their price alone or a dot,
 * and the picked, hovered or focused one always shows in full. Pins and
 * tags under the bar and legends over the map (EngineOptions.covered)
 * make way too. The "Popular" layer (setHeat) sits under the street map's
 * labels: a heatmap zoomed out, then, from about a city and its suburbs,
 * each popular turf's own spot in its level's colour. With "Trending" on,
 * a trending turf's pin (Pin.trend: its rank) wears a small coral arrow at
 * its shoulder, and a bubble holding any says how many in a coral badge.
 *
 * Requests: the style, its tiles, fonts and sprites from
 * tiles.openfreemap.org (free, no key, no cookies), made only once the
 * map is on screen; MapLibre itself sends nothing else. Its worker comes
 * from our own origin.
 */

/** OpenFreeMap's light street map: quiet colours, so the pins read first. */
export const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Pins closer than this many px share a bubble. A turf bubble's price tag makes way where it would run into the next one (placeTags). */
const RADIUS = 56;
/**
 * The map's closest zoom, and the bubbles' too, so pins on one spot never
 * stack: a bubble that does not split by then (a turf's weekly games,
 * turfs sharing a gate) lists its pins when tapped.
 */
const CLUSTER_MAX_ZOOM = 18;

export type PinKind = "turf" | "game";
/**
 * `place`: the turf's name, so a bubble at one turf can say so. `hourly`:
 * a turf's listed price per hour (turfHourly), for its bubble's average.
 * `trend`: a trending turf's rank, while Trending is on. A turf pin's
 * parts (turfPin): `name`, cut to fit, `tail`, its price or sport after the
 * "|", and `short`, its price alone; a game pin shows `text`.
 */
export type Pin = {
  key: string;
  lat: number;
  lng: number;
  text: string;
  label: string;
  place: string;
  hourly?: number | null;
  trend?: number | null;
  name?: string;
  tail?: string | null;
  short?: string | null;
};

export type Padding = { top: number; bottom: number; left: number; right: number };

export type EngineOptions = {
  /** The first view. */
  bounds: Bounds;
  /** It is exactly the view someone left (a ?b= alone): fitted edge to edge, not inside the padding. */
  exact: boolean;
  /** Room the camera keeps clear of the bars over the map. */
  padding: () => Padding;
  /** What floats over the map (the phone bar, the Popular and Trending legends), px from its top left: pins there show a dot, and tags hang clear. */
  covered: () => readonly Rect[];
  /** Zoom buttons (desktop; phones pinch). */
  zoomButtons: boolean;
  /** After every move, by the viewer (`byUser`) or by the page. */
  onView: (b: Bounds, zoom: number, byUser: boolean) => void;
  /**
   * A pin, a bubble that cannot split further (its pins, by key), or null
   * for none; `from` is the marker tapped, `keyboard` when it was Enter or
   * Space (focus then goes into the card, and back to the marker after).
   */
  onPick: (keys: string[] | null, from?: HTMLElement, keyboard?: boolean) => void;
  /** The street map could not load (blocked, offline). The pins and the list still work. */
  onStyleError: () => void;
};

export type Engine = {
  setPins: (kind: PinKind, pins: readonly Pin[]) => void;
  /** The "Popular" layer's points, or null to hide it. */
  setHeat: (points: HeatFeatures | null) => void;
  fitTo: (b: Bounds, animate?: boolean) => void;
  flyTo: (at: { lat: number; lng: number }, zoom: number) => void;
  setActive: (key: string | null) => void;
  setHot: (key: string | null) => void;
  /**
   * Something now floats over these boxes (a legend just shown), below
   * what floated there before (down to `from`, px from the map's top): if
   * a marker that was in view sits under them, the map moves down by the
   * room they take, so what was in view still is.
   */
  reveal: (boxes: readonly Rect[], from: number) => void;
  setMe: (at: { lat: number; lng: number } | null) => void;
  /** Keyboard focus on the map itself (its marker gone). */
  focusMap: () => void;
  view: () => { bounds: Bounds; zoom: number };
  destroy: () => void;
};

/** A point's own properties: its pin, a turf's hourly price for the average (`h`), and whether it is trending (`t`). */
type Props = { i: number; h?: number | null; t?: boolean };

/**
 * A pin is two boxes: the button MapLibre places (its `transform`, which
 * nothing else may touch: a `scale` on it would scale that translation too
 * and throw the pin across the map) and the face inside it, which grows on
 * hover, when picked (data-on) and shows the keyboard focus. Colours come
 * from MAP_COLORS as CSS variables on the map (--tt-*).
 */
const MARK = "tt-mark group p-0 m-0 border-0 bg-transparent cursor-pointer hover:z-10 focus:outline-none";
const FACE = "block transition-[scale,background-color,color] duration-150 group-focus-visible:outline-2 group-focus-visible:outline-offset-2";
/** A game's pin: green, with a calendar and when it starts. */
const GAME_PIN = `${FACE} h-7 pl-1.5 pr-2.5 flex items-center gap-1 rounded-full bg-(--tt-game) text-white text-[13px] font-bold whitespace-nowrap border border-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] group-hover:scale-[1.08] group-data-[on=true]:bg-accent-900 group-data-[on=true]:scale-[1.12] group-focus-visible:outline-primary-900`;
/**
 * A turf's pin is three faces stacked on its spot, the one that shows
 * chosen by the button's data-lod (layout): its name and price, its price
 * alone (or, with no price, its name alone), or a dot. The button itself
 * takes no taps (its box is the widest face's); the face that shows does,
 * and fades in as the others fade out.
 */
const TURF_FACE =
  "[grid-area:1/1] pointer-events-auto transition-[opacity,visibility,scale,background-color,color] duration-150 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent-600";
const SHOW: Record<Lod, string> = {
  full: "invisible opacity-0 group-data-[lod=full]:visible group-data-[lod=full]:opacity-100",
  short: "invisible opacity-0 group-data-[lod=short]:visible group-data-[lod=short]:opacity-100",
  dot: "invisible opacity-0 group-data-[lod=dot]:visible group-data-[lod=dot]:opacity-100",
};
/** A white pill, picked deep teal with white ink. */
const PILL = `${TURF_FACE} h-7 px-2.5 flex items-center rounded-full bg-white whitespace-nowrap group-hover:scale-[1.06] group-data-[on=true]:bg-(--tt-deep) group-data-[on=true]:border-white group-data-[on=true]:scale-[1.1]`;
const PIN = {
  /** A turf with a price: a teal edge, and the price in deep teal (7.2:1). */
  priced: `${PILL} border border-(--tt-teal)/45 shadow-[0_1px_4px_rgba(0,0,0,0.22)]`,
  /** A turf with no price to show: quieter, so the prices read first. */
  bare: `${PILL} border border-black/10 shadow-[0_1px_4px_rgba(0,0,0,0.18)]`,
  /** A dot in TapTurf teal with a white ring and a soft halo; a bigger target than it looks. */
  dot: `${TURF_FACE} relative w-3.5 h-3.5 rounded-full border-2 border-white bg-(--tt-deep) shadow-[0_0_0_3px_rgba(0,166,153,0.22),0_1px_3px_rgba(0,0,0,0.35)] after:absolute after:-inset-[7px] after:rounded-full group-hover:scale-125`,
};
/** The name in ink (16:1 on white), then a light "|", then the price in deep teal or the sport in grey (5.1:1). */
const INK = {
  name: "text-[12.5px] font-semibold text-primary-900 group-data-[on=true]:text-white",
  bar: "mx-1.5 text-[13px] font-normal text-black/20 group-data-[on=true]:text-white/50",
  price: "text-[12.5px] font-bold tabular-nums text-(--tt-deep) group-data-[on=true]:text-white",
  sport: "text-[12px] font-medium text-(--tt-muted) group-data-[on=true]:text-white/90",
  short: "text-[13px] font-bold tabular-nums text-(--tt-deep) group-data-[on=true]:text-white",
};
/** The bubble's face (it carries the hover scale) holds the disc and, for turfs, the price tag hanging off its bottom edge. */
const BUBBLE = "relative block transition-[scale] duration-150 group-hover:scale-110";
/**
 * A turf disc is solid teal; with the heat layer on (.tt-heat-on on the
 * map) it turns frosted white with a teal count, so the glow under it and
 * around it reads as the colour on the map (the price pills are white
 * already). Deep teal on that white, with the heat's coral under it, stays
 * above 4.5:1.
 */
const DISC = {
  turf: "rounded-full text-white font-bold tabular-nums flex items-center justify-center border-2 border-white bg-[linear-gradient(180deg,var(--tt-face),var(--tt-deep))] [text-shadow:0_1px_1px_rgba(0,0,0,0.18)] transition-colors duration-200 [.tt-heat-on_&]:bg-none [.tt-heat-on_&]:bg-white/80 [.tt-heat-on_&]:text-(--tt-deep) [.tt-heat-on_&]:[text-shadow:none] [.tt-heat-on_&]:border-(--tt-teal)/60 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent-600",
  game: "rounded-full text-white font-bold tabular-nums flex items-center justify-center border-2 border-white bg-(--tt-game) group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary-900",
};
/**
 * "avg ₹1.2k/hr", white, under a turf bubble (its button's data-tag, set
 * by layout: over it when "above", hidden when "none"); its ink is the
 * deep teal (7.2:1), "avg" the muted grey (5.1:1). TAG_TUCK is its 8 px.
 */
const TAG =
  "tt-tag absolute left-1/2 top-[calc(100%-8px)] -translate-x-1/2 h-[18px] px-1.5 flex items-center rounded-full bg-white text-(--tt-deep) text-[10.5px] leading-none font-bold tabular-nums whitespace-nowrap shadow-[0_1px_3px_rgba(0,0,0,0.2)] ring-1 ring-black/5 group-data-[tag=above]:top-auto group-data-[tag=above]:bottom-[calc(100%-8px)] group-data-[tag=none]:invisible";
/** A small calendar on a game's bubble, in a white badge at its shoulder. */
const BADGE = "absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-white text-(--tt-game) flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.25)]";
/** A small calendar on a game's pin. */
const GAME_GLYPH =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>';
/** Trending's rising arrow (lucide's trending-up, as on the chip), white on coral. */
const TREND_GLYPH =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/></svg>';
/**
 * Trending: on a turf bubble, a coral badge at its shoulder with the arrow
 * and how many of its turfs trend; on a trending turf's pin, the arrow in
 * a coral dot at its other shoulder, and a coral edge. White on that coral
 * is 5.0:1. Both are measured for the labels to make way (tt-badge).
 */
const TREND_BADGE =
  "tt-badge absolute -top-2.5 -right-3.5 h-5 min-w-5 pl-[3px] pr-[5px] flex items-center justify-center gap-px rounded-full bg-(--tt-trend) text-white text-[11px] leading-none font-bold tabular-nums ring-2 ring-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]";
const TREND_DOT =
  "tt-badge absolute -top-2 -left-2 w-[18px] h-[18px] flex items-center justify-center rounded-full bg-(--tt-trend) text-white ring-2 ring-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]";
/** A trending pin's face: room for the dot, and the coral edge; its dot face is coral. */
const TREND_FACE = "relative border-(--tt-trend)/70! ring-1 ring-(--tt-trend)/25";
const TREND_DOT_FACE = "bg-(--tt-trend)! shadow-[0_0_0_3px_rgba(216,27,79,0.22),0_1px_3px_rgba(0,0,0,0.35)]!";

/** "#00A699" at `a` opacity. */
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

/** A bubble grows with its count, and so does its soft teal (or green) halo. */
function bubbleSize(n: number): { cls: string; halo: number } {
  return n < 10
    ? { cls: "w-9 h-9 text-[13px]", halo: 3 }
    : n < 100
      ? { cls: "w-10 h-10 text-[14px]", halo: 4 }
      : n < 1000
        ? { cls: "w-12 h-12 text-[15px]", halo: 5 }
        : { cls: "w-14 h-14 text-[15px]", halo: 6 };
}

/** The invisible symbol layer under the markers that the street map's labels make way for, and the heat layers. */
const HOLD = "tt-hold";
const HEAT = "tt-heat";
const HEAT_SPOT = "tt-heat-spot";
const NONE: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * The "Popular" layer has two looks. Zoomed out (HEAT), a heatmap: each
 * popular turf's level (1 to 5) weighs its point, and the colour runs
 * from clear through TapTurf teal to amber and coral where the most
 * viewed turfs crowd together. A heatmap sums its points, and one point
 * alone peaks at weight × intensity × 0.4 (MapLibre's Gaussian kernel),
 * so in a city, where popular turfs stand apart, it would show where they
 * are, not how popular each is. So from HEAT_SPOT_ZOOM (about a city and
 * its suburbs across a phone) it fades into HEAT_SPOT: each popular
 * turf's own soft spot, in its own level's colour from the same ramp (the
 * legend's), never summed. Both glow out from under the bubbles and pins.
 */
const HEAT_SPOT_ZOOM = 8.5;
const HEAT_FADE = 1;
/** A level's colour, as the heatmap's ramp has it at that share of its top. */
const HEAT_RAMP = [rgba(MAP_COLORS.teal, 0.32), rgba(MAP_COLORS.teal, 0.55), "rgba(255,190,80,0.72)", "rgba(255,120,72,0.8)", rgba(MAP_COLORS.hot, 0.86)];
const HEAT_PAINT = {
  "heatmap-weight": ["interpolate", ["linear"], ["get", "l"], 1, 0.2, 5, 1],
  "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.15, 6, 0.2, 9, 0.24],
  "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 34, 6, 38],
  "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.85, HEAT_SPOT_ZOOM, 0.8, HEAT_SPOT_ZOOM + HEAT_FADE, 0],
  "heatmap-color": [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0,
    rgba(MAP_COLORS.teal, 0),
    0.12,
    rgba(MAP_COLORS.teal, 0.25),
    0.4,
    rgba(MAP_COLORS.teal, 0.5),
    0.65,
    "rgba(255,190,80,0.68)",
    0.85,
    "rgba(255,120,72,0.76)",
    1,
    rgba(MAP_COLORS.hot, 0.82),
  ],
} as const;
/** A soft spot a little wider than a pin's dot, wider the more popular, so its colour rings the pin or bubble over it. */
const HEAT_SPOT_PAINT = {
  "circle-color": ["match", ["get", "l"], 1, HEAT_RAMP[0], 2, HEAT_RAMP[1], 3, HEAT_RAMP[2], 4, HEAT_RAMP[3], HEAT_RAMP[4]],
  "circle-radius": ["interpolate", ["linear"], ["zoom"], HEAT_SPOT_ZOOM, ["+", 5, ["get", "l"]], 10, ["+", 8, ["get", "l"]], 12, ["+", 11, ["*", 1.5, ["get", "l"]]], 15, ["+", 16, ["*", 2, ["get", "l"]]]],
  "circle-blur": 0.55,
  "circle-opacity": ["interpolate", ["linear"], ["zoom"], HEAT_SPOT_ZOOM, 0, HEAT_SPOT_ZOOM + HEAT_FADE, 1],
} as const;

const toBounds = (m: MapLibre): Bounds => {
  const b = m.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
};

export function createEngine(container: HTMLElement, opts: EngineOptions): Engine {
  // The worker as its own file, from our origin (MapLibre 6 finds it next to
  // its module only when that module is served as is, which a bundle is not).
  setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

  // The palette, for the markers' classes (text-(--tt-deep) and the like).
  for (const [name, hex] of Object.entries(MAP_COLORS)) container.style.setProperty(`--tt-${name}`, hex);

  const map = new MapLibre({
    container,
    style: STYLE_URL,
    bounds: [opts.bounds[0], opts.bounds[1], opts.bounds[2], opts.bounds[3]],
    fitBoundsOptions: { padding: opts.exact ? 0 : opts.padding() },
    maxBounds: [MAX_BOUNDS[0], MAX_BOUNDS[1], MAX_BOUNDS[2], MAX_BOUNDS[3]],
    minZoom: 2,
    maxZoom: CLUSTER_MAX_ZOOM,
    renderWorldCopies: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,
    // What a screen reader hears on the map itself (the list beside it has every place).
    locale: { "Map.Title": "Map. Arrow keys move it, plus and minus zoom." },
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // OpenFreeMap's credit (© OpenMapTiles, OpenStreetMap contributors) comes from the style. Compact on narrow maps.
  map.addControl(new AttributionControl(), "bottom-left");
  if (opts.zoomButtons) map.addControl(new NavigationControl({ showCompass: false }), "top-right");

  let styleOk = false;
  map.once("style.load", () => {
    styleOk = true;
    hold();
    paintHeat();
  });
  map.on("error", (e) => {
    // A failed tile here and there is normal; only a style that never came is "no map".
    if (!styleOk && !map.isStyleLoaded()) {
      console.warn("map: street map unavailable", e.error?.message ?? e);
      opts.onStyleError();
    }
  });

  let kind: PinKind = "turf";
  let pins: readonly Pin[] = [];
  let index: Supercluster<Props, Partial<BubbleSum>> | null = null;
  let markers = new Map<string, Marker>();
  let active: string | null = null;
  let hot: string | null = null;
  let me: Marker | null = null;
  let heat: HeatFeatures | null = null;
  /** Where a bubble opened from the keyboard was: after its zoom, focus goes to the marker nearest it. */
  let refocus: [number, number] | null = null;
  /** The turf pin under the mouse, and the one with keyboard focus (their marker keys): both show in full. */
  let hover: string | null = null;
  let focused: string | null = null;
  /** A turf pin's place in the declutter: its order (top rated first), its Trending rank, whether it has a price. */
  const spots = new WeakMap<HTMLElement, { order: number; trend: number | null; priced: boolean }>();
  /** A turf pin's faces' sizes, and a turf bubble's disc and price tag sizes and its badge around its spot, once measured. */
  let sizes = new WeakMap<HTMLElement, { full: Size; short: Size | null }>();
  let parts = new WeakMap<HTMLElement, Pick<BubbleSpot, "disc" | "tag" | "badge" | "count">>();
  let dead = false;

  const mark = (key: string, el: HTMLElement, at: [number, number]) => {
    const m = new Marker({ element: el, anchor: "center" }).setLngLat(at).addTo(map);
    markers.set(key, m);
    return m;
  };

  /**
   * A marker's box on the map, px from `frame` (the map's own box): a turf
   * pin's face that shows (the others are hidden on the same spot), else
   * the marker, with a bubble's price tag where it hangs and a Trending
   * badge, which reach outside the button. Null when not laid out.
   */
  const boxOf = (el: HTMLElement, frame: DOMRect): Rect | null => {
    const root = (el.dataset.lod && el.querySelector<HTMLElement>(`[data-face="${el.dataset.lod}"]`)) || el;
    let { left, right, top, bottom } = root.getBoundingClientRect();
    for (const part of root.querySelectorAll(el.dataset.tag === "none" ? ".tt-badge" : ".tt-tag, .tt-badge")) {
      const p = part.getBoundingClientRect();
      [left, right, top, bottom] = [Math.min(left, p.left), Math.max(right, p.right), Math.min(top, p.top), Math.max(bottom, p.bottom)];
    }
    if (right - left < 1 || bottom - top < 1) return null;
    return [left - frame.left, top - frame.top, right - frame.left, bottom - frame.top];
  };

  /**
   * The street map's labels make way for the markers: one invisible icon
   * per marker, its size and place (a turf bubble's price tag included),
   * on a symbol layer above every other. MapLibre places the top layer's
   * symbols first and hides any later label that would overlap one, so a
   * city name under a bubble fades out, and back in when the bubble moves.
   */
  const hold = () => {
    if (!styleOk) return;
    try {
      if (!map.getSource(HOLD)) {
        map.addSource(HOLD, { type: "geojson", data: NONE });
        map.addLayer({
          id: HOLD,
          type: "symbol",
          source: HOLD,
          layout: { "icon-image": ["get", "img"], "icon-offset": ["get", "off"], "icon-allow-overlap": true, "icon-ignore-placement": false, "icon-padding": 0 },
          paint: { "icon-opacity": 0 },
        });
      }
      const frame = container.getBoundingClientRect();
      const feats: GeoJSON.Feature[] = [];
      for (const m of markers.values()) {
        const box = boxOf(m.getElement(), frame);
        if (!box) continue;
        const [left, top, right, bottom] = box;
        const at = map.project(m.getLngLat());
        const w = Math.ceil((right - left) / 4) * 4;
        const h = Math.ceil((bottom - top) / 4) * 4;
        const img = `${HOLD}-${w}x${h}`;
        if (!map.hasImage(img)) map.addImage(img, { width: w, height: h, data: new Uint8Array(w * h * 4) });
        const off = [Math.round((left + right) / 2 - at.x), Math.round((top + bottom) / 2 - at.y)];
        feats.push({ type: "Feature", geometry: { type: "Point", coordinates: m.getLngLat().toArray() }, properties: { img, off } });
      }
      (map.getSource(HOLD) as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    } catch (e) {
      // The labels then simply stay as the street map draws them.
      console.warn("map: labels cannot make way", e);
    }
  };

  /**
   * The heat layers, under the street map's labels (its first symbol
   * layer), shown or hidden. While they show, the map carries .tt-heat-on
   * and the turf bubbles turn frosted white (DISC), so the glow under them
   * reads.
   */
  const paintHeat = () => {
    container.classList.toggle("tt-heat-on", styleOk && !!heat?.features.length);
    if (!styleOk) return;
    try {
      const src = map.getSource(HEAT) as GeoJSONSource | undefined;
      if (!heat) {
        for (const id of [HEAT, HEAT_SPOT]) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
        return;
      }
      if (src) src.setData(heat);
      else {
        map.addSource(HEAT, { type: "geojson", data: heat });
        const labels = map.getStyle().layers.find((l) => l.type === "symbol" && l.id !== HOLD)?.id;
        map.addLayer({ id: HEAT, type: "heatmap", source: HEAT, maxzoom: HEAT_SPOT_ZOOM + HEAT_FADE, paint: HEAT_PAINT as never }, labels);
        map.addLayer({ id: HEAT_SPOT, type: "circle", source: HEAT, minzoom: HEAT_SPOT_ZOOM, layout: { "circle-sort-key": ["get", "l"] }, paint: HEAT_SPOT_PAINT as never }, labels);
      }
      for (const id of [HEAT, HEAT_SPOT]) map.setLayoutProperty(id, "visibility", "visible");
    } catch (e) {
      console.warn("map: heat layer unavailable", e);
    }
  };

  const paintOn = () => {
    for (const [key, m] of markers) {
      const el = m.getElement();
      const on = key === `p:${active}` || key === `p:${hot}`;
      el.dataset.on = String(on);
      if (key.startsWith("p:")) el.setAttribute("aria-pressed", String(key === `p:${active}`));
      // The picked pin on top, then a hovered or focused one, then a trending one; a name over a dot.
      el.style.zIndex =
        key === `p:${active}` ? "4" : on || key === hover || key === focused ? "3" : el.dataset.trend ? "2" : key.startsWith("c:") || el.dataset.lod === "full" ? "1" : "";
    }
  };

  /**
   * Where each turf bubble's price tag hangs (lib/map/pins.ts placeTags:
   * under its disc, else over it, else left off) and which face each turf
   * pin shows (declutter): with the bubbles, their tags and what floats
   * over the map in the way, in the order of claimOrder, each pin takes its
   * name and price where they run into nothing, else its price alone, else
   * a dot; names from NAME_ZOOM. Sizes are measured once per marker (one
   * layout read for the new ones); after that a run is arithmetic, cheap
   * enough for every frame of a zoom. True when a face or a tag changed.
   */
  const layout = (): boolean => {
    if (kind !== "turf") return false;
    const over = opts.covered();
    const bubbles: (BubbleSpot & { el: HTMLElement })[] = [];
    const list: PinSpot[] = [];
    for (const [key, m] of markers) {
      const el = m.getElement();
      const at = map.project(m.getLngLat());
      if (key.startsWith("c:")) {
        let p = parts.get(el);
        if (!p) {
          const disc = el.querySelector<HTMLElement>(".tt-disc");
          // Not laid out yet (a hidden page): measured next time.
          if (!disc?.offsetWidth) continue;
          const [w, h] = [disc.offsetWidth, disc.offsetHeight];
          const tag = el.querySelector<HTMLElement>(".tt-tag");
          // Offsets from the bubble's face (the disc's box), so a hover's scale does not count.
          const badge = el.querySelector<HTMLElement>(".tt-badge");
          p = {
            disc: [w, h],
            tag: tag ? [tag.offsetWidth, tag.offsetHeight] : null,
            badge: badge ? [badge.offsetLeft - w / 2, badge.offsetTop - h / 2, badge.offsetLeft + badge.offsetWidth - w / 2, badge.offsetTop + badge.offsetHeight - h / 2] : null,
            count: Number(el.dataset.count) || 0,
          };
          parts.set(el, p);
        }
        bubbles.push({ key, x: at.x, y: at.y, ...p, el });
        continue;
      }
      const s = spots.get(el);
      if (!s) continue;
      let size = sizes.get(el);
      if (!size) {
        const face = (lod: Lod) => el.querySelector<HTMLElement>(`[data-face="${lod}"]`);
        const full = face("full");
        const short = face("short");
        if (!full?.offsetWidth) continue;
        size = { full: [full.offsetWidth, full.offsetHeight], short: short ? [short.offsetWidth, short.offsetHeight] : null };
        sizes.set(el, size);
      }
      const k = key.slice(2);
      list.push({ key, x: at.x, y: at.y, ...size, priced: s.priced, trend: s.trend, order: s.order, pinned: k === active || k === hot || key === hover || key === focused });
    }
    let changed = false;
    const tags = placeTags(bubbles, over);
    const blocked: Rect[] = [...over];
    for (const b of bubbles) {
      blocked.push(discRect(b));
      const badge = badgeRect(b);
      if (badge) blocked.push(badge);
      if (!b.tag) continue;
      const at = tags.get(b.key) ?? "none";
      if (at !== "none") blocked.push(tagRect(b, at));
      if (b.el.dataset.tag !== at) {
        b.el.dataset.tag = at;
        changed = true;
      }
    }
    for (const [key, lod] of declutter(list, blocked, map.getZoom() >= NAME_ZOOM)) {
      const el = markers.get(key)?.getElement();
      if (el && el.dataset.lod !== lod) {
        el.dataset.lod = lod;
        changed = true;
      }
    }
    return changed;
  };
  /** After a pick, a hover or a focus: the faces, the stacking, and the street map's labels around them. */
  const relayout = () => {
    layout();
    paintOn();
    hold();
  };

  /** A count bubble's button: its disc, and a turf bubble's average price under it and Trending badge (or a game bubble's calendar). */
  const bubble = (count: number, sums: Partial<BubbleSum>): { el: HTMLButtonElement; avg: number | null } => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `${MARK} block tt-bubble`;
    el.dataset.count = String(count);
    const size = bubbleSize(count);
    const face = document.createElement("span");
    face.className = BUBBLE;
    const disc = document.createElement("span");
    disc.className = `tt-disc ${DISC[kind]} ${size.cls}`;
    const ink = kind === "game" ? MAP_COLORS.game : MAP_COLORS.teal;
    disc.style.boxShadow = `0 0 0 ${size.halo}px ${rgba(ink, 0.22)}, 0 3px 10px ${rgba(kind === "game" ? MAP_COLORS.game : MAP_COLORS.deep, 0.35)}`;
    disc.textContent = countText(count);
    face.append(disc);
    const avg = kind === "turf" ? averagePrice(sums) : null;
    if (avg != null) {
      const tag = document.createElement("span");
      tag.className = TAG;
      tag.setAttribute("aria-hidden", "true");
      const word = document.createElement("span");
      word.className = "font-semibold text-(--tt-muted) mr-[3px]";
      word.textContent = "avg";
      const per = document.createElement("span");
      per.className = "font-semibold";
      per.textContent = "/hr";
      tag.append(word, avgPriceShort(avg), per);
      face.append(tag);
      el.dataset.tag = "below";
    } else if (kind === "game") {
      const badge = document.createElement("span");
      badge.className = BADGE;
      badge.innerHTML = GAME_GLYPH.replace(/width="15" height="15"/, 'width="11" height="11"');
      face.append(badge);
    }
    if (kind === "turf" && sums.tn) {
      const badge = document.createElement("span");
      badge.className = TREND_BADGE;
      badge.setAttribute("aria-hidden", "true");
      badge.innerHTML = TREND_GLYPH;
      badge.append(String(sums.tn));
      face.append(badge);
    }
    el.append(face);
    return { el, avg };
  };

  const span = (cls: string, text: string) => {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = text;
    return s;
  };

  /**
   * A turf's pin: its faces (TURF_FACE) for layout to choose from. Full:
   * "O2 Turf | ₹500/hr" (or the sport, or the name alone); short: "₹500",
   * or the name alone when it has no price; and a dot. With Trending on, a
   * trending turf's pill faces wear the coral edge and arrow, its dot is coral.
   */
  const turfPinEl = (pin: Pin, key: string, order: number): HTMLButtonElement => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `${MARK} tt-pin grid place-items-center pointer-events-none`;
    el.setAttribute("aria-label", pin.label);
    el.dataset.lod = "full";
    const priced = pin.short != null;
    const trend = !!pin.trend;
    const full = document.createElement("span");
    full.className = `${priced ? PIN.priced : PIN.bare} ${SHOW.full}`;
    full.append(span(INK.name, pin.name || pin.text));
    if (pin.tail) {
      const bar = span(INK.bar, "|");
      bar.setAttribute("aria-hidden", "true");
      full.append(bar, span(priced ? INK.price : INK.sport, pin.tail));
    }
    const faces: [Lod, HTMLElement][] = [["full", full]];
    // The price alone; with no price, the name alone, when the full face has more than the name.
    if (priced || pin.tail) {
      const short = document.createElement("span");
      short.className = `${priced ? PIN.priced : PIN.bare} ${SHOW.short}`;
      short.append(span(priced ? INK.short : INK.name, priced ? (pin.short as string) : pin.name || pin.text));
      faces.push(["short", short]);
    }
    const dot = document.createElement("span");
    dot.className = `${PIN.dot} ${SHOW.dot}${trend ? ` ${TREND_DOT_FACE}` : ""}`;
    faces.push(["dot", dot]);
    for (const [lod, face] of faces) {
      face.dataset.face = lod;
      if (trend && lod !== "dot") {
        face.className += ` ${TREND_FACE}`;
        const badge = document.createElement("span");
        badge.className = TREND_DOT;
        badge.setAttribute("aria-hidden", "true");
        badge.innerHTML = TREND_GLYPH;
        face.append(badge);
      }
      el.append(face);
    }
    if (trend) el.dataset.trend = "true";
    spots.set(el, { order, trend: pin.trend ?? null, priced });
    // The mouse over it, or keyboard focus on it: in full while it lasts.
    el.addEventListener("pointerover", (ev) => {
      if (ev.pointerType !== "mouse" || hover === key) return;
      hover = key;
      relayout();
    });
    el.addEventListener("pointerout", (ev) => {
      if (ev.pointerType !== "mouse" || hover !== key || el.contains(ev.relatedTarget as Node | null)) return;
      hover = null;
      relayout();
    });
    el.addEventListener("focus", () => {
      if (!el.matches(":focus-visible")) return;
      focused = key;
      relayout();
    });
    el.addEventListener("blur", () => {
      if (focused !== key) return;
      focused = null;
      relayout();
    });
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      opts.onPick([pin.key], el, ev.detail === 0);
    });
    return el;
  };

  /** `settled`: after a move, when a bubble that had the keyboard hands it on. */
  const render = (settled = false) => {
    const idx = index;
    if (!idx) return;
    const z = Math.floor(map.getZoom());
    const [w, s, e, n] = toBounds(map);
    const dx = (e - w) * 0.15;
    const dy = (n - s) * 0.15;
    const feats = idx.getClusters([Math.max(-180, w - dx), Math.max(-85, s - dy), Math.min(180, e + dx), Math.min(85, n + dy)], z);
    const old = markers;
    markers = new Map();
    for (const f of feats) {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const props = f.properties as Partial<ClusterProperties> & Partial<Props> & Partial<BubbleSum>;
      if (props.cluster && props.cluster_id != null) {
        const key = `c:${props.cluster_id}`;
        const kept = old.get(key);
        if (kept) {
          markers.set(key, kept);
          old.delete(key);
          continue;
        }
        const id = props.cluster_id;
        const count = props.point_count ?? 0;
        const to = idx.getClusterExpansionZoom(id);
        // One site: zooming cannot split it, so a tap lists its pins.
        const leaves = to > CLUSTER_MAX_ZOOM ? idx.getLeaves(id, Infinity).map((l) => pins[(l.properties as Props).i]).filter((p): p is Pin => !!p) : null;
        const { el, avg } = bubble(count, props);
        el.setAttribute(
          "aria-label",
          bubbleLabel(count, kind === "game" ? "games" : "turfs", leaves && leaves.map((p) => p.place), avg != null ? { avg, n: props.pn ?? 0 } : null, props.tn ?? 0),
        );
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          // A click from Enter or Space carries no pointer.
          const keyboard = ev.detail === 0;
          if (leaves) {
            opts.onPick(leaves.map((p) => p.key), el, keyboard);
            return;
          }
          if (keyboard) refocus = [lng, lat];
          map.easeTo({ center: [lng, lat], zoom: Math.min(to + 0.25, map.getMaxZoom()), duration: 450 }, { tapped: true });
        });
        mark(key, el, [lng, lat]);
      } else if (props.i != null) {
        const pin = pins[props.i];
        if (!pin) continue;
        const key = `p:${pin.key}`;
        const kept = old.get(key);
        if (kept) {
          markers.set(key, kept);
          old.delete(key);
          continue;
        }
        if (kind === "turf") {
          mark(key, turfPinEl(pin, key, props.i), [lng, lat]);
          continue;
        }
        const el = document.createElement("button");
        el.type = "button";
        el.className = `${MARK} block tt-pin`;
        el.setAttribute("aria-label", pin.label);
        const face = document.createElement("span");
        face.className = GAME_PIN;
        face.innerHTML = GAME_GLYPH;
        face.append(pin.text);
        el.append(face);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          opts.onPick([pin.key], el, ev.detail === 0);
        });
        mark(key, el, [lng, lat]);
      }
    }
    // The bubble that had the keyboard is about to go: its nearest marker takes over, else the map.
    if (refocus && settled) {
      const at = map.project(refocus);
      let best: HTMLElement | null = null;
      let d = Infinity;
      for (const m of markers.values()) {
        const p = map.project(m.getLngLat());
        const dd = (p.x - at.x) ** 2 + (p.y - at.y) ** 2;
        if (dd < d) [best, d] = [m.getElement(), dd];
      }
      refocus = null;
      if (best) best.focus({ preventScroll: true });
      else map.getCanvas().focus({ preventScroll: true });
    }
    for (const m of old.values()) m.remove();
    relayout();
  };

  // Pins come closer or part as the map zooms: they make way (or take their names back) as it goes.
  map.on("zoom", () => {
    if (layout()) paintOn();
  });
  // The page's font in (if it was not yet): the markers measured again.
  document.fonts?.ready.then(() => {
    if (dead) return;
    sizes = new WeakMap();
    parts = new WeakMap();
    relayout();
  });

  map.on("moveend", (e) => {
    render(true);
    // A drag, wheel, key or zoom button carries its event; a bubble's zoom says it was tapped.
    const by = e as { originalEvent?: unknown; tapped?: boolean };
    opts.onView(toBounds(map), map.getZoom(), !!by.originalEvent || by.tapped === true);
  });
  // A tap on the map itself (not a pin) puts the picked card away.
  map.on("click", (e) => {
    const t = e.originalEvent?.target as Element | null;
    if (!t?.closest?.(".tt-mark")) opts.onPick(null);
  });

  return {
    setPins(k, next) {
      // The same pins again (the list's clock ticked, nothing changed): the markers stay, and so does focus.
      const same =
        k === kind &&
        next.length === pins.length &&
        next.every((p, i) => {
          const q = pins[i];
          return (
            p.key === q.key && p.lat === q.lat && p.lng === q.lng && p.text === q.text && p.label === q.label && p.place === q.place && p.hourly === q.hourly && p.trend === q.trend && p.short === q.short
          );
        });
      pins = next;
      if (same && index) return;
      kind = k;
      // Turf bubbles sum their turfs' hourly prices (and count the trending ones) as they cluster, for their tag and badge.
      index =
        k === "turf"
          ? new Supercluster<Props, Partial<BubbleSum>>({
              radius: RADIUS,
              maxZoom: CLUSTER_MAX_ZOOM,
              minPoints: 2,
              map: (p) => bubbleSum(p.h, !!p.t),
              reduce: (acc, p) => addBubbleSum(acc as BubbleSum, p as BubbleSum),
            })
          : new Supercluster<Props, Partial<BubbleSum>>({ radius: RADIUS, maxZoom: CLUSTER_MAX_ZOOM, minPoints: 2 });
      index.load(
        next.map((p, i) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          properties: k === "turf" ? { i, h: p.hourly ?? null, t: !!p.trend } : { i },
        })),
      );
      for (const m of markers.values()) m.remove();
      markers = new Map();
      render();
    },
    setHeat(points) {
      heat = points;
      paintHeat();
    },
    fitTo(b, animate = true) {
      map.fitBounds([b[0], b[1], b[2], b[3]], { padding: opts.padding(), duration: animate ? 600 : 0, maxZoom: 15 });
    },
    flyTo(at, zoom) {
      map.flyTo({ center: [at.lng, at.lat], zoom, duration: 900 });
    },
    setActive(key) {
      active = key;
      relayout();
    },
    setHot(key) {
      hot = key;
      relayout();
    },
    reveal(boxes, from) {
      if (!boxes.length) return;
      const frame = container.getBoundingClientRect();
      const to = Math.max(...boxes.map((b) => b[3]));
      // A marker that was in view (its middle below `from`) and is now under them.
      const under = [...markers.values()].some((m) => {
        const r = boxOf(m.getElement(), frame);
        return !!r && (r[1] + r[3]) / 2 >= from && boxes.some((b) => collide(b, r, 0));
      });
      // Down by the room they take, so all that was in view below `from` is in view below them; a nudge, never a jump.
      if (under && to > from && to - from <= 120) map.panBy([0, from - to], { duration: 300 });
    },
    setMe(at) {
      me?.remove();
      me = null;
      if (!at) return;
      const el = document.createElement("div");
      el.className = "tt-mark w-4 h-4 rounded-full bg-[#2563eb] border-2 border-white shadow-[0_0_0_6px_rgba(37,99,235,0.22)] pointer-events-none";
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", "You are here");
      me = new Marker({ element: el, anchor: "center" }).setLngLat([at.lng, at.lat]).addTo(map);
    },
    focusMap: () => map.getCanvas().focus({ preventScroll: true }),
    view: () => ({ bounds: toBounds(map), zoom: map.getZoom() }),
    destroy() {
      dead = true;
      for (const m of markers.values()) m.remove();
      me?.remove();
      map.remove();
    },
  };
}
