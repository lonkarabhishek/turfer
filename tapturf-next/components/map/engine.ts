import { AttributionControl, Map as MapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import Supercluster, { type ClusterProperties } from "supercluster";
import { MAX_BOUNDS, bubbleLabel, type Bounds } from "@/lib/map/view";
import { MAP_COLORS, addPriceSum, averagePrice, avgPriceShort, countText, priceSum, type PriceSum } from "@/lib/map/clusters";
import type { HeatFeatures } from "@/lib/map/heat";

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
 * Supercluster's map and reduce); a game bubble is the site's green with a
 * calendar. The street map's own labels give way under every bubble and
 * pin (an invisible symbol layer the size of each one, HOLD), so a city
 * name does not run under a bubble. The "Popular" heat layer (setHeat)
 * sits under the street map's labels.
 *
 * Requests: the style, its tiles, fonts and sprites from
 * tiles.openfreemap.org (free, no key, no cookies), made only once the
 * map is on screen; MapLibre itself sends nothing else. Its worker comes
 * from our own origin.
 */

/** OpenFreeMap's light street map: quiet colours, so the pins read first. */
export const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Pins closer than this many px share a bubble; a turf bubble's price tag needs a little more room. */
const RADIUS: Record<PinKind, number> = { turf: 62, game: 56 };
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
 */
export type Pin = { key: string; lat: number; lng: number; text: string; label: string; place: string; hourly?: number | null };

export type Padding = { top: number; bottom: number; left: number; right: number };

export type EngineOptions = {
  /** The first view. */
  bounds: Bounds;
  /** It is exactly the view someone left (a ?b= alone): fitted edge to edge, not inside the padding. */
  exact: boolean;
  /** Room the camera keeps clear of the bars over the map. */
  padding: () => Padding;
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
  setMe: (at: { lat: number; lng: number } | null) => void;
  /** Keyboard focus on the map itself (its marker gone). */
  focusMap: () => void;
  view: () => { bounds: Bounds; zoom: number };
  destroy: () => void;
};

/** A point's own properties: its pin, and a turf's hourly price for the average (`h`). */
type Props = { i: number; h?: number | null };

/**
 * A pin is two boxes: the button MapLibre places (its `transform`, which
 * nothing else may touch: a `scale` on it would scale that translation too
 * and throw the pin across the map) and the face inside it, which grows on
 * hover, when picked (data-on) and shows the keyboard focus. Colours come
 * from MAP_COLORS as CSS variables on the map (--tt-*).
 */
const MARK = "tt-mark group block p-0 m-0 border-0 bg-transparent cursor-pointer hover:z-10 focus:outline-none";
const FACE = "block transition-[scale,background-color,color] duration-150 group-focus-visible:outline-2 group-focus-visible:outline-offset-2";
const PIN = {
  turf: `${FACE} h-7 px-2.5 flex items-center rounded-full bg-white text-(--tt-deep) text-[13px] font-bold tabular-nums whitespace-nowrap border border-(--tt-teal)/45 shadow-[0_1px_4px_rgba(0,0,0,0.22)] group-hover:scale-[1.08] group-data-[on=true]:bg-(--tt-deep) group-data-[on=true]:border-white group-data-[on=true]:text-white group-data-[on=true]:scale-[1.12] group-focus-visible:outline-accent-600`,
  game: `${FACE} h-7 pl-1.5 pr-2.5 flex items-center gap-1 rounded-full bg-(--tt-game) text-white text-[13px] font-bold whitespace-nowrap border border-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] group-hover:scale-[1.08] group-data-[on=true]:bg-accent-900 group-data-[on=true]:scale-[1.12] group-focus-visible:outline-primary-900`,
  /** A turf with no price to show (its pin names its sport): quieter, so the prices read first. */
  bare: `${FACE} h-7 px-2.5 flex items-center rounded-full bg-white text-(--tt-muted) text-[12px] font-semibold whitespace-nowrap border border-black/10 shadow-[0_1px_4px_rgba(0,0,0,0.18)] group-hover:scale-[1.08] group-data-[on=true]:bg-(--tt-deep) group-data-[on=true]:border-white group-data-[on=true]:text-white group-data-[on=true]:scale-[1.12] group-focus-visible:outline-accent-600`,
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
/** "avg ₹1.2k/hr", white, under a turf bubble; its ink is the deep teal (7.2:1), "avg" the muted grey (5.1:1). */
const TAG =
  "tt-tag absolute left-1/2 top-[calc(100%-8px)] -translate-x-1/2 h-[18px] px-1.5 flex items-center rounded-full bg-white text-(--tt-deep) text-[10.5px] leading-none font-bold tabular-nums whitespace-nowrap shadow-[0_1px_3px_rgba(0,0,0,0.2)] ring-1 ring-black/5";
/** A small calendar on a game's bubble, in a white badge at its shoulder. */
const BADGE = "absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-white text-(--tt-game) flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.25)]";
/** A small calendar on a game's pin. */
const GAME_GLYPH =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>';

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

/** The invisible symbol layer under the markers that the street map's labels make way for, and the heat layer. */
const HOLD = "tt-hold";
const HEAT = "tt-heat";
const NONE: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * The "Popular" layer: each popular turf's level (1 to 5) weighs its
 * point; the colour runs from clear through TapTurf teal to amber and
 * coral where the most viewed turfs crowd together. Wide enough at every
 * zoom to glow out from under the bubbles, and gentle enough in a city
 * that one turf at the top level alone reads orange, not a coral blot.
 */
const HEAT_PAINT = {
  "heatmap-weight": ["interpolate", ["linear"], ["get", "l"], 1, 0.2, 5, 1],
  "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 0.15, 6, 0.2, 9, 0.24, 12, 0.42, 15, 0.85],
  "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 34, 6, 38, 9, 38, 12, 44, 15, 60],
  "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.85, 15, 0.75],
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
  let index: Supercluster<Props, Partial<PriceSum>> | null = null;
  let markers = new Map<string, Marker>();
  let active: string | null = null;
  let hot: string | null = null;
  let me: Marker | null = null;
  let heat: HeatFeatures | null = null;
  /** Where a bubble opened from the keyboard was: after its zoom, focus goes to the marker nearest it. */
  let refocus: [number, number] | null = null;

  const mark = (key: string, el: HTMLElement, at: [number, number]) => {
    const m = new Marker({ element: el, anchor: "center" }).setLngLat(at).addTo(map);
    markers.set(key, m);
    return m;
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
      const box = container.getBoundingClientRect();
      const feats: GeoJSON.Feature[] = [];
      for (const m of markers.values()) {
        const el = m.getElement();
        const r = el.getBoundingClientRect();
        const tag = el.querySelector(".tt-tag")?.getBoundingClientRect();
        const left = Math.min(r.left, tag?.left ?? r.left);
        const right = Math.max(r.right, tag?.right ?? r.right);
        const top = Math.min(r.top, tag?.top ?? r.top);
        const bottom = Math.max(r.bottom, tag?.bottom ?? r.bottom);
        if (right - left < 1 || bottom - top < 1) continue;
        const at = map.project(m.getLngLat());
        const w = Math.ceil((right - left) / 4) * 4;
        const h = Math.ceil((bottom - top) / 4) * 4;
        const img = `${HOLD}-${w}x${h}`;
        if (!map.hasImage(img)) map.addImage(img, { width: w, height: h, data: new Uint8Array(w * h * 4) });
        const off = [Math.round((left + right) / 2 - box.left - at.x), Math.round((top + bottom) / 2 - box.top - at.y)];
        feats.push({ type: "Feature", geometry: { type: "Point", coordinates: m.getLngLat().toArray() }, properties: { img, off } });
      }
      (map.getSource(HOLD) as GeoJSONSource).setData({ type: "FeatureCollection", features: feats });
    } catch (e) {
      // The labels then simply stay as the street map draws them.
      console.warn("map: labels cannot make way", e);
    }
  };

  /**
   * The heat layer, under the street map's labels (its first symbol layer),
   * shown or hidden. While it shows, the map carries .tt-heat-on and the
   * turf bubbles turn frosted white (DISC), so the glow under them reads.
   */
  const paintHeat = () => {
    container.classList.toggle("tt-heat-on", styleOk && !!heat?.features.length);
    if (!styleOk) return;
    try {
      const src = map.getSource(HEAT) as GeoJSONSource | undefined;
      if (!heat) {
        if (map.getLayer(HEAT)) map.setLayoutProperty(HEAT, "visibility", "none");
        return;
      }
      if (src) src.setData(heat);
      else {
        map.addSource(HEAT, { type: "geojson", data: heat });
        const labels = map.getStyle().layers.find((l) => l.type === "symbol" && l.id !== HOLD)?.id;
        map.addLayer({ id: HEAT, type: "heatmap", source: HEAT, maxzoom: CLUSTER_MAX_ZOOM + 1, paint: HEAT_PAINT as never }, labels);
      }
      map.setLayoutProperty(HEAT, "visibility", "visible");
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
      el.style.zIndex = key === `p:${active}` ? "3" : on ? "2" : key.startsWith("c:") ? "1" : "";
    }
  };

  /** A count bubble's button: its disc, and a turf bubble's average price under it (or a game bubble's calendar). */
  const bubble = (count: number, sums: Partial<PriceSum>): { el: HTMLButtonElement; avg: number | null } => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `${MARK} tt-bubble`;
    const size = bubbleSize(count);
    const face = document.createElement("span");
    face.className = BUBBLE;
    const disc = document.createElement("span");
    disc.className = `${DISC[kind]} ${size.cls}`;
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
    } else if (kind === "game") {
      const badge = document.createElement("span");
      badge.className = BADGE;
      badge.innerHTML = GAME_GLYPH.replace(/width="15" height="15"/, 'width="11" height="11"');
      face.append(badge);
    }
    el.append(face);
    return { el, avg };
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
      const props = f.properties as Partial<ClusterProperties> & Partial<Props> & Partial<PriceSum>;
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
          bubbleLabel(count, kind === "game" ? "games" : "turfs", leaves && leaves.map((p) => p.place), avg != null ? { avg, n: props.pn ?? 0 } : null),
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
        const el = document.createElement("button");
        el.type = "button";
        el.className = `${MARK} tt-pin`;
        el.setAttribute("aria-label", pin.label);
        const face = document.createElement("span");
        face.className = kind === "turf" && !/^~?₹/.test(pin.text) ? PIN.bare : PIN[kind];
        if (kind === "game") face.innerHTML = GAME_GLYPH;
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
    paintOn();
    hold();
  };

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
          return p.key === q.key && p.lat === q.lat && p.lng === q.lng && p.text === q.text && p.label === q.label && p.place === q.place && p.hourly === q.hourly;
        });
      pins = next;
      if (same && index) return;
      kind = k;
      // Turf bubbles sum their turfs' hourly prices as they cluster, for the average on their tag.
      index =
        k === "turf"
          ? new Supercluster<Props, Partial<PriceSum>>({
              radius: RADIUS.turf,
              maxZoom: CLUSTER_MAX_ZOOM,
              minPoints: 2,
              map: (p) => priceSum(p.h),
              reduce: (acc, p) => addPriceSum(acc as PriceSum, p as PriceSum),
            })
          : new Supercluster<Props, Partial<PriceSum>>({ radius: RADIUS.game, maxZoom: CLUSTER_MAX_ZOOM, minPoints: 2 });
      index.load(
        next.map((p, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: k === "turf" ? { i, h: p.hourly ?? null } : { i } })),
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
      paintOn();
    },
    setHot(key) {
      hot = key;
      paintOn();
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
      for (const m of markers.values()) m.remove();
      me?.remove();
      map.remove();
    },
  };
}
