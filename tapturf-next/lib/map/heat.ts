import { mapPoint } from "./data";

/**
 * /map's "Popular" layer: where turfs get the most page views. The
 * database hands out only a coarse level per turf (public.map_turf_heat,
 * 20261101_map_turf_heat.sql: 1 to 5 by rank among the active turfs with
 * at least a few views in the last 30 days, never a count); GET
 * /api/map/heat puts each level on its turf's map point (the same point
 * and key as its pin), and the page draws them as a heatmap, only once the
 * visitor turns the layer on. Pure, relative imports only, so `npm run
 * test:list` compiles it on its own.
 */

/** Levels run 1 (the least viewed of the turfs shown) to 5 (the most). */
export type HeatLevel = 1 | 2 | 3 | 4 | 5;

/** A row as map_turf_heat returns it. */
export type HeatRow = { turf_id?: unknown; level?: unknown };

/** A popular turf, as sent: its pin's key, where it is (5 decimals) and its level. */
export type HeatWire = { k: string; y: number; x: number; l: HeatLevel };

export function heatLevel(v: unknown): HeatLevel | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as HeatLevel) : null;
}

/**
 * Each row's level on its turf's map point, for the turfs on the map (an
 * active turf with a usable location: the map's own list), most popular
 * first. A row for any other turf, or with no usable level, is left out,
 * and so is a turf listed twice after its first.
 */
export function joinHeat(rows: readonly HeatRow[], turfs: readonly { id: string; slug?: string | null; lat?: unknown; lng?: unknown }[]): HeatWire[] {
  const byId = new Map(turfs.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: HeatWire[] = [];
  for (const r of rows) {
    const id = typeof r?.turf_id === "string" ? r.turf_id : null;
    const l = heatLevel(r?.level);
    const t = id ? byId.get(id) : undefined;
    if (!id || !l || !t || seen.has(id)) continue;
    const p = mapPoint(t);
    if (!p) continue;
    seen.add(id);
    out.push({ k: p.k, y: p.y, x: p.x, l });
  }
  return out.sort((a, b) => b.l - a.l);
}

/** The route's answer, read back without trusting it: anything that is not a point with a level is dropped. */
export function parseHeat(json: unknown): HeatWire[] {
  const list = (json as { heat?: unknown } | null)?.heat;
  if (!Array.isArray(list)) return [];
  const out: HeatWire[] = [];
  for (const h of list) {
    const l = heatLevel(h?.l);
    if (!l || typeof h?.k !== "string" || !h.k) continue;
    if (typeof h.y !== "number" || typeof h.x !== "number" || Math.abs(h.y) > 90 || Math.abs(h.x) > 180) continue;
    out.push({ k: h.k, y: h.y, x: h.x, l });
  }
  return out;
}

export type HeatFeatures = {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: { l: HeatLevel } }[];
};

/** GeoJSON points for the heat layer: the turfs `keep` takes (those the sport chip shows), each with its level as `l`. */
export function heatFeatures(points: readonly HeatWire[], keep: (key: string) => boolean = () => true): HeatFeatures {
  return {
    type: "FeatureCollection",
    features: points.filter((p) => keep(p.k)).map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.x, p.y] }, properties: { l: p.l } })),
  };
}
