import { AttributionControl, Map as MapLibre, Marker, NavigationControl, setWorkerUrl } from "maplibre-gl";
import Supercluster, { type ClusterProperties } from "supercluster";
import { MAX_BOUNDS, bubbleLabel, type Bounds } from "@/lib/map/view";

/**
 * /map's map: MapLibre GL (bundled from npm, loaded only by /map, after
 * the page is up: MapExplorer imports this module dynamically) over
 * OpenFreeMap's street map, with our own HTML pins. Clustering is
 * Supercluster's, here in the page, so the pins for exactly the view are
 * one call away; the pins are buttons (keyboard, screen readers), and
 * only the ones in view (and a margin) are in the page: clusters keep
 * them at least RADIUS px apart, so a phone has a few dozen at most.
 *
 * Requests: the style, its tiles, fonts and sprites from
 * tiles.openfreemap.org (free, no key, no cookies), made only once the
 * map is on screen; MapLibre itself sends nothing else. Its worker comes
 * from our own origin.
 */

/** OpenFreeMap's light street map: quiet colours, so the pins read first. */
export const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/** Pins closer than this many px share a bubble. */
const RADIUS = 56;
/**
 * The map's closest zoom, and the bubbles' too, so pins on one spot never
 * stack: a bubble that does not split by then (a turf's weekly games,
 * turfs sharing a gate) lists its pins when tapped.
 */
const CLUSTER_MAX_ZOOM = 18;

export type PinKind = "turf" | "game";
/** `place`: the turf's name, so a bubble at one turf can say so. */
export type Pin = { key: string; lat: number; lng: number; text: string; label: string; place: string };

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

type Props = { i: number };

/**
 * A pin is two boxes: the button MapLibre places (its `transform`, which
 * nothing else may touch: a `scale` on it would scale that translation too
 * and throw the pin across the map) and the face inside it, which grows on
 * hover, when picked (data-on) and shows the keyboard focus.
 */
const MARK = "tt-mark group block p-0 m-0 border-0 bg-transparent cursor-pointer hover:z-10 focus:outline-none";
const FACE = "block transition-[scale,background-color,color] duration-150 group-focus-visible:outline-2 group-focus-visible:outline-offset-2";
const PIN = {
  turf: `${FACE} h-7 px-2.5 flex items-center rounded-full bg-white text-primary-900 text-[13px] font-bold tabular-nums whitespace-nowrap border border-black/10 shadow-[0_1px_4px_rgba(0,0,0,0.25)] group-hover:scale-[1.08] group-data-[on=true]:bg-primary-900 group-data-[on=true]:text-white group-data-[on=true]:scale-[1.12] group-focus-visible:outline-accent-600`,
  game: `${FACE} h-7 pl-1.5 pr-2.5 flex items-center gap-1 rounded-full bg-accent-600 text-white text-[13px] font-bold whitespace-nowrap border border-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] group-hover:scale-[1.08] group-data-[on=true]:bg-accent-900 group-data-[on=true]:scale-[1.12] group-focus-visible:outline-primary-900`,
};
const BUBBLE = {
  turf: `${FACE} rounded-full bg-primary-900 text-white font-bold tabular-nums flex items-center justify-center ring-4 ring-primary-900/20 shadow-[0_2px_6px_rgba(0,0,0,0.3)] group-hover:scale-110 group-focus-visible:outline-accent-600`,
  game: `${FACE} rounded-full bg-accent-600 text-white font-bold tabular-nums flex items-center justify-center ring-4 ring-accent-600/25 border-2 border-white shadow-[0_2px_6px_rgba(0,0,0,0.3)] group-hover:scale-110 group-focus-visible:outline-primary-900`,
};
/** A small calendar on a game's pin. */
const GAME_GLYPH =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>';

function bubbleSize(n: number): string {
  return n < 10 ? "w-9 h-9 text-[13px]" : n < 100 ? "w-10 h-10 text-[13px]" : n < 1000 ? "w-12 h-12 text-[14px]" : "w-14 h-14 text-[14px]";
}

const toBounds = (m: MapLibre): Bounds => {
  const b = m.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
};

export function createEngine(container: HTMLElement, opts: EngineOptions): Engine {
  // The worker as its own file, from our origin (MapLibre 6 finds it next to
  // its module only when that module is served as is, which a bundle is not).
  setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

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
  map.once("style.load", () => (styleOk = true));
  map.on("error", (e) => {
    // A failed tile here and there is normal; only a style that never came is "no map".
    if (!styleOk && !map.isStyleLoaded()) {
      console.warn("map: street map unavailable", e.error?.message ?? e);
      opts.onStyleError();
    }
  });

  let kind: PinKind = "turf";
  let pins: readonly Pin[] = [];
  let index: Supercluster<Props> | null = null;
  let markers = new Map<string, Marker>();
  let active: string | null = null;
  let hot: string | null = null;
  let me: Marker | null = null;
  /** Where a bubble opened from the keyboard was: after its zoom, focus goes to the marker nearest it. */
  let refocus: [number, number] | null = null;

  const mark = (key: string, el: HTMLElement, at: [number, number]) => {
    const m = new Marker({ element: el, anchor: "center" }).setLngLat(at).addTo(map);
    markers.set(key, m);
    return m;
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
      const props = f.properties as Partial<ClusterProperties> & Partial<Props>;
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
        const el = document.createElement("button");
        el.type = "button";
        el.className = `${MARK} tt-bubble`;
        const face = document.createElement("span");
        face.className = `${BUBBLE[kind]} ${bubbleSize(count)}`;
        face.textContent = String(props.point_count_abbreviated ?? count);
        el.append(face);
        el.setAttribute("aria-label", bubbleLabel(count, kind === "game" ? "games" : "turfs", leaves && leaves.map((p) => p.place)));
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
        face.className = PIN[kind];
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
          return p.key === q.key && p.lat === q.lat && p.lng === q.lng && p.text === q.text && p.label === q.label && p.place === q.place;
        });
      pins = next;
      if (same && index) return;
      kind = k;
      index = new Supercluster<Props>({ radius: RADIUS, maxZoom: CLUSTER_MAX_ZOOM, minPoints: 2 });
      index.load(next.map((p, i) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { i } })));
      for (const m of markers.values()) m.remove();
      markers = new Map();
      render();
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
