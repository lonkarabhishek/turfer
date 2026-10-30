/**
 * The pictures an Ask answer carries (built on the server by
 * lib/ask/cards.ts, drawn by components/ask/AskVisuals.tsx): their shapes,
 * and the check the chat runs before drawing one. No imports, so the
 * browser bundle gets only this.
 */

export type Visual = "compare" | "prices" | "map" | "host";

/** The pictures an answer carries, each with its data, in the order they show (`show`). */
export type AskVisuals = {
  show: Visual[];
  compare?: CompareTable;
  prices?: PriceChart;
  map?: ResultsMap;
  host?: HostPreview;
};

export type PriceChart = {
  /** What is plotted: "Evening rate per hour, weekdays". */
  title: string;
  /** The sport, the order, the budget: "Football, cheapest first". */
  note: string;
  /** Cheapest first: the card's id, the price and how it reads. */
  bars: { id: string; value: number; display: string }[];
  /** Shown venues not on the chart, in card order, and why ("Prices not listed yet"). */
  off: { id: string; why: string }[];
};

/**
 * A map we draw ourselves: no tiles, no map service, nothing loaded from
 * anyone. Positions are a local equirectangular projection, the same scale
 * both ways, so the scale bar is true. x and y are fractions of a frame
 * MAP_ASPECT wide per unit high, north up.
 */
export type ResultsMap = {
  /** n: the card's number in the answer (1 is the first card). */
  pins: { id: string; n: number; x: number; y: number }[];
  me: { x: number; y: number } | null;
  /** Each area's name once, near its venues, where it fits. */
  areas: { name: string; x: number; y: number }[];
  /** A scale bar: the distance it stands for, its length as a fraction of the frame's width, and the corner clear of pins it sits in. */
  scale: { km: number; w: number; at: "bl" | "br" | "tl" | "tr" };
  /** Shown venues not on the map: no location listed, or far from the rest. */
  left: number;
  /** Pins that sat on top of each other were moved apart a little. */
  nudged: boolean;
};

export const MAP_ASPECT = 1.6;

/** One venue's column in the comparison: every value from its row, null where it lists none ("Not listed"). */
export type CompareVenue = {
  id: string;
  /**
   * The price as a card shows it: the sport's own when a sport was asked
   * (cardPrice), else summarisePrice; null when none is listed. The cards
   * under the table show this same price.
   */
  price: { label: string; kind: "real" | "reported" | "reported_text" } | null;
  /** Google's rating and review count, said as Google's. */
  google: { rating: string; reviews: string | null } | null;
  /** TapTurf players' own live reports. */
  players: { count: number; average: string } | null;
  hours: string | null;
  /** From the visitor, when their location is known. */
  km: number | null;
  sports: string[];
  facilities: string[];
  claimed: boolean;
  /** The numbers the venue's page calls and WhatsApps (getPhone, getWhatsAppPhone), for the same buttons. */
  contact: { phone: string | null; whatsapp: string | null; membersOnly: boolean; address: string };
};

export type CompareTable = { venues: CompareVenue[]; distance: boolean };

export type HostPreview = {
  /** What was read, each only when known: Sport, Day, Time, Players, Level. */
  lines: { label: string; value: string }[];
  /** The venue named (or the page's, for "here"), when it is one we list. */
  turf: { id: string; slug: string | null; name: string; place: string | null } | null;
  /** The wizard, drafted from the same sentence, with the venue picked when we have it. */
  href: string;
};

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The pictures to draw, in order, each with what it needs. The thread is
 * kept in sessionStorage, so a reply saved by an older chat (no visuals)
 * or a newer one (a kind this one doesn't know) comes back here: anything
 * missing or misshapen is left out, and an old reply draws as it did.
 */
export function visualsToDraw(v: unknown): Visual[] {
  if (!isObj(v) || !isArr(v.show)) return [];
  const ok: Record<Visual, (x: unknown) => boolean> = {
    compare: (x) => isObj(x) && isArr(x.venues) && x.venues.length >= 2 && x.venues.every((c) => isObj(c) && typeof c.id === "string" && isObj(c.contact)),
    prices: (x) => isObj(x) && typeof x.title === "string" && isArr(x.bars) && isArr(x.off) && x.bars.every((b) => isObj(b) && typeof b.id === "string" && Number.isFinite(b.value)),
    map: (x) => isObj(x) && isArr(x.pins) && x.pins.length >= 2 && isObj(x.scale) && isArr(x.areas),
    host: (x) => isObj(x) && isArr(x.lines) && typeof x.href === "string" && x.href.startsWith("/game/create"),
  };
  const out: Visual[] = [];
  for (const k of v.show) {
    if (typeof k !== "string" || !(k in ok) || out.includes(k as Visual)) continue;
    if (ok[k as Visual](v[k])) out.push(k as Visual);
  }
  return out;
}
