/**
 * /map's turf pins up close: each one names its turf and its price per
 * hour ("O2 Turf | ₹500/hr"), its name cut short to fit a phone, and pins
 * that would run into each other give way, top rated last to go: a pin
 * shows its name and price where there is room, else its price alone
 * (a turf with no price, its name alone), else a dot. The picked or
 * hovered pin always shows in full. Pure, relative imports only, so
 * `npm run test:list` compiles it on its own.
 */

/**
 * The most of a turf's name a pin shows, the ellipsis included. On 1 Nov
 * half of the 3,826 turfs on the map had a name of 19 characters or more,
 * and 1,466 one of 16 or fewer; 16 keeps a named pill with its price
 * near half a phone's width.
 */
export const PIN_NAME_MAX = 16;

/** Where a cut name may end: never on a space, a dash, a comma or an open bracket. */
const TRAILING = /[\s\-–—|·,:;&/(+.]+$/u;
/** A mark that belongs to the letter before it (a Devanagari vowel sign, an accent): never the first thing cut off. */
const JOINS = /^[\p{M}‌‍️]/u;

/**
 * A turf's name as its pin shows it: whole when it fits in `max`
 * characters, else cut at the last word that fits (or mid-word when that
 * would leave too little) and ended with "…". A "|" in the name (a chain
 * and its branch: "ClayGrounds | Vasant Kunj") reads " · ", so the pin's
 * own "|" before the price is the only one.
 */
export function pinName(name: string | null | undefined, max = PIN_NAME_MAX): string {
  const clean = (name ?? "").replace(/\s*\|\s*/g, " · ").replace(/\s+/g, " ").trim();
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  let end = max - 1;
  while (end > 1 && JOINS.test(chars[end])) end--;
  const cut = chars.slice(0, end).join("");
  // The last whole word, when it keeps most of the room.
  const space = cut.lastIndexOf(" ");
  const words = space >= Math.ceil(max * 0.55) ? cut.slice(0, space) : cut;
  return `${words.replace(TRAILING, "") || cut}…`;
}

/** The pin's line: "O2 Turf | ₹500/hr", or the name alone. */
export function pinLine(name: string, tail: string | null | undefined): string {
  return tail ? `${name} | ${tail}` : name;
}

/** A card's price unit, short for a pin: "/hr", "/slot" (of any length), "/person". */
export function pinUnit(unit: string): string {
  return /slot/.test(unit) ? "/slot" : unit;
}

/** How much of itself a pin shows. */
export type Lod = "full" | "short" | "dot";

/** Width and height, px. */
export type Size = readonly [w: number, h: number];
/** Left, top, right, bottom, px on the map. */
export type Rect = readonly [x0: number, y0: number, x1: number, y1: number];

/** A dot's room: its 14 px and its white ring. */
export const DOT: Size = [16, 16];
/** Room kept between two pins' faces. */
export const PIN_GAP = 4;
/**
 * Names show from this zoom (about a city's middle across a phone); out
 * from there a priced pin shows its price, the others a dot, as the map
 * of India is for the bubbles.
 */
export const NAME_ZOOM = 10;

export type PinSpot = {
  key: string;
  /** Where the pin is, px on the map (its face is centred there). */
  x: number;
  y: number;
  /** Its name and price (or sport). */
  full: Size;
  /** Its price alone, or for a turf with no price its name alone; null when the full face is all it has. */
  short: Size | null;
  /** Its short face is a price (else it is a name). */
  priced: boolean;
  /** Picked, hovered or focused: in full whatever it covers, and placed first. */
  pinned?: boolean;
  /** With Trending on, its rank (1 the most viewed): placed before the rest. */
  trend?: number | null;
  /** Its place among the turfs, top rated first: the rest are placed in this order. */
  order: number;
};

function around(s: PinSpot, [w, h]: Size): Rect {
  return [s.x - w / 2, s.y - h / 2, s.x + w / 2, s.y + h / 2];
}

/** The two boxes overlap, or come closer than `gap`. */
export function collide(a: Rect, b: Rect, gap = PIN_GAP): boolean {
  return a[0] < b[2] + gap && b[0] < a[2] + gap && a[1] < b[3] + gap && b[1] < a[3] + gap;
}

/** The order pins claim room in: pinned, then trending by rank, then top rated first. */
export function claimOrder(a: PinSpot, b: PinSpot): number {
  return (
    Number(!!b.pinned) - Number(!!a.pinned) ||
    (a.trend || Infinity) - (b.trend || Infinity) ||
    a.order - b.order ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/**
 * What each pin shows. In claimOrder, each takes the most of itself that
 * runs into nothing already placed (the bubbles in `blocked`, and the pins
 * before it): its full face (from NAME_ZOOM, `names`), else its short one,
 * else a dot, which is always placed. A pinned pin is placed in full first.
 */
export function declutter(spots: readonly PinSpot[], blocked: readonly Rect[], names: boolean, gap = PIN_GAP): Map<string, Lod> {
  const placed: Rect[] = [...blocked];
  const out = new Map<string, Lod>();
  for (const s of [...spots].sort(claimOrder)) {
    const tries: [Lod, Size][] = [];
    if (s.pinned) tries.push(["full", s.full]);
    else {
      if (names) tries.push(["full", s.full]);
      if (s.short && (names || s.priced)) tries.push(["short", s.short]);
    }
    let lod: Lod = "dot";
    let box = around(s, DOT);
    for (const [l, size] of tries) {
      const r = around(s, size);
      if (s.pinned || !placed.some((p) => collide(p, r, gap))) {
        [lod, box] = [l, r];
        break;
      }
    }
    placed.push(box);
    out.set(s.key, lod);
  }
  return out;
}
