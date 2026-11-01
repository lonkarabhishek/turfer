/**
 * /map's turf pins up close: each one names its turf and its price per
 * hour ("O2 Turf | ₹500/hr"), its name cut short to fit a phone, and pins
 * that would run into each other give way, top rated last to go: a pin
 * shows its name and price where there is room, else its price alone
 * (a turf with no price, its name alone), else a dot. The picked or
 * hovered pin always shows in full. A turf bubble's price tag makes way
 * the same way (placeTags): under its disc, else over it, else left off.
 * Pure, relative imports only, so `npm run test:list` compiles it on its
 * own.
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

function around(s: { x: number; y: number }, [w, h]: Size): Rect {
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

/** Where a turf bubble's price tag hangs: under its disc, over it, or nowhere (its label still says the average). */
export type TagAt = "below" | "above" | "none";

/** How far a price tag tucks under the edge of its disc, px. */
export const TAG_TUCK = 8;

export type BubbleSpot = {
  key: string;
  /** Its spot, px on the map (its disc is centred there). */
  x: number;
  y: number;
  /** Its disc's size. */
  disc: Size;
  /** Its price tag's size; null when no turf in it lists a price. */
  tag: Size | null;
  /** Its Trending badge, from its spot (left, top, right, bottom); null when it has none. */
  badge: Rect | null;
  /** How many turfs it holds: the bigger bubbles keep their tags first. */
  count: number;
};

/** A bubble's disc on the map. */
export function discRect(b: BubbleSpot): Rect {
  return around(b, b.disc);
}

/** Its price tag on the map, hung under or over its disc. */
export function tagRect(b: BubbleSpot, at: "below" | "above"): Rect {
  const [w, h] = b.tag ?? [0, 0];
  const y0 = at === "below" ? b.y + b.disc[1] / 2 - TAG_TUCK : b.y - b.disc[1] / 2 + TAG_TUCK - h;
  return [b.x - w / 2, y0, b.x + w / 2, y0 + h];
}

/** Its Trending badge on the map. */
export function badgeRect(b: BubbleSpot): Rect | null {
  return b.badge && [b.x + b.badge[0], b.y + b.badge[1], b.x + b.badge[2], b.y + b.badge[3]];
}

/**
 * Where each bubble's price tag hangs. Bubbles sit at least the cluster
 * radius apart, but a tag is wider than its disc, so one can run into the
 * next bubble. Biggest first, each tag hangs under its disc where that
 * runs into no other disc, no badge, no tag already hung and nothing in
 * `blocked` (the bar and legends over the map), else over it, else it is
 * left off.
 */
export function placeTags(bubbles: readonly BubbleSpot[], blocked: readonly Rect[] = []): Map<string, TagAt> {
  const fixed: Rect[] = [...blocked];
  for (const b of bubbles) {
    const badge = badgeRect(b);
    if (badge) fixed.push(badge);
  }
  const discs = new Map(bubbles.map((b) => [b, discRect(b)]));
  const hung: Rect[] = [];
  const out = new Map<string, TagAt>();
  const order = [...bubbles].sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const b of order) {
    if (!b.tag) continue;
    const free = (r: Rect) => !fixed.some((p) => collide(p, r, 1)) && !hung.some((p) => collide(p, r, 1)) && ![...discs].some(([o, d]) => o !== b && collide(d, r, 1));
    const at = (["below", "above"] as const).find((side) => free(tagRect(b, side))) ?? "none";
    if (at !== "none") hung.push(tagRect(b, at));
    out.set(b.key, at);
  }
  return out;
}
