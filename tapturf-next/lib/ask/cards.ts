import { haversineKm, type Coords } from "../utils/location";
import { cardPrice, sportBandMap, sportBandTimeRange, sportPrice, type CardSport, type SportBandTimeMap } from "../utils/cardSport";
import { positivePrice, summarisePrice } from "../utils/prices";
import { formatSpan, normaliseOpeningHours } from "../utils/hours";
import { areaFor } from "../utils/area";
import { getPhone, getWhatsAppPhone } from "../utils/seo";
import { sportBySlug } from "../sports";
import { isCity, labelFor } from "../city";
import type { Turf } from "../../types/turf";
import { MAP_ASPECT, type AskVisuals, type CompareTable, type CompareVenue, type HostPreview, type PriceChart, type ResultsMap, type Visual } from "./visuals";

export { MAP_ASPECT };
export type { AskVisuals, CompareTable, CompareVenue, HostPreview, PriceChart, ResultsMap, Visual };

/**
 * The pictures under an Ask answer: "Claude chooses, the database fills".
 *
 * Claude's reading of the question (lib/ai/ask.ts AskFilters, or the
 * quick and keyword readings that stand in for it) already says what was
 * asked: the intent, the sport, a time, a budget, "near me". This file
 * turns that reading and the rows the answer found into which pictures
 * show (visualsFor) and what is in them: a comparison table, each shown
 * venue's price at the time asked, a small map of where they are, and the
 * game a host is about to set up. Every number and fact comes from our
 * rows, never from the model's words, and the selection is plain code, so
 * the same question gets the same pictures.
 *
 * Pure, relative imports only, so npm run test:ask compiles it
 * (lib/ask/cards.test.ts).
 */

/** What of the reading (AskFilters) decides the pictures. */
export type Reading = {
  intent: string;
  sport: string | null;
  time: "morning" | "afternoon" | "evening" | "late_night" | null;
  when: "today" | "tomorrow" | "weekend" | "this_week" | null;
  sort: string;
  max_price_per_hour: number | null;
  wants_nearby: boolean;
};

/** The question is about what it costs, or when: a time, cheapest first, or a budget. */
export const asksPrice = (r: Pick<Reading, "time" | "sort" | "max_price_per_hour">): boolean =>
  r.time != null || r.sort === "price_low" || r.max_price_per_hour != null;

/**
 * Which pictures an answer shows, in order. `got` is what the rows made
 * possible: venues compared, venues with a price for the chart, whether a
 * map fits (resultsMap), and whether the cards are the venues a name found
 * (`named`) or headed rows of closest names (`headed`), which get none.
 * - compare: the table, once two venues are found.
 * - create_game: the host card.
 * - find_turf: the price chart when the question is about price or a time
 *   and two venues or more have a price for it (one bar is no chart), and
 *   the map when it fits. Near me sorted by distance shows the map first.
 * Everything else, games included, shows what it always did.
 */
export function visualsFor(r: Reading, got: { compared?: number; priced?: number; map?: boolean; named?: boolean; headed?: boolean }): Visual[] {
  switch (r.intent) {
    case "compare":
      return (got.compared ?? 0) >= 2 ? ["compare"] : [];
    case "create_game":
      return ["host"];
    case "find_turf": {
      if (got.named || got.headed) return [];
      const out: Visual[] = [];
      if (asksPrice(r) && (got.priced ?? 0) >= 2) out.push("prices");
      if (got.map) out.push("map");
      return r.sort === "nearby" ? out.reverse() : out;
    }
    default:
      return [];
  }
}

/** The sport's card rule (lib/utils/cardSport.ts), from a reading's sport slug. */
export function cardSportOf(slug: string | null | undefined): CardSport | null {
  const page = slug ? sportBySlug(slug) : undefined;
  return page ? { labels: page.labels } : null;
}

/** A row with its own sport bands (cardPrice reads turf.sport_bands), from the bands it carries. */
export function withOwnBands(t: Turf): Turf {
  if (t.sport_bands !== undefined || !t.pricing_bands?.length) return t;
  const bands = sportBandMap([{ id: t.id, pricing_bands: t.pricing_bands, price_owner_confirmed: t.price_owner_confirmed ?? null }])[t.id];
  return bands ? { ...t, sport_bands: bands } : t;
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// ── Price by time ──────────────────────────────────────────────────

const TIME_WORD = { morning: "morning", afternoon: "afternoon", evening: "evening", late_night: "late-night" } as const;

/**
 * Which rates the time asked for reads: weekend ones for "this weekend",
 * and for today or tomorrow when that is a Saturday or Sunday in India;
 * else the weekday ones.
 */
export function dayType(when: Reading["when"], now: Date): "weekday" | "weekend" {
  if (when === "weekend") return "weekend";
  if (when !== "today" && when !== "tomorrow") return "weekday";
  const dow = new Date(now.getTime() + 330 * 60_000).getUTCDay();
  const day = when === "tomorrow" ? (dow + 1) % 7 : dow;
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

type PriceColumn = "morning_price" | "afternoon_price" | "evening_price" | "weekend_morning_price" | "weekend_afternoon_price" | "weekend_evening_price";

/** The price bands' time for each time asked (the turf page's Pricing table: Morning, Afternoon 12 to 5 pm, Evening 5 to 9 pm). */
const BAND_AT = { morning: "morning", afternoon: "day", evening: "evening" } as const;

/**
 * Each shown venue's listed per-hour rate for the time asked, cheapest
 * first. Only a price the site's card would show for the sport counts
 * (cardPrice, sportPrice): a venue whose rates are another sport's, or
 * that lists none, is named under the chart with what its price is
 * instead, never charted. Morning, afternoon and evening read their own
 * column (the weekend one on a weekend, dayType), or, where the card shows
 * the range a venue's price bands give the sport, that sport's band at the
 * time (`times`, getSportBandTimes; without them such a venue is named
 * under the chart with its range). Late night and no time read the card's
 * own lowest listed rate. Reported prices (from reviews) and rates per
 * slot or per person are never charted beside per-hour ones.
 */
export function priceChart(
  turfs: readonly Turf[],
  r: Pick<Reading, "sport" | "time" | "when" | "max_price_per_hour">,
  now: Date,
  times: SportBandTimeMap | null = null,
): PriceChart {
  const sport = cardSportOf(r.sport);
  const sportName = r.sport ? (sportBySlug(r.sport)?.name ?? null) : null;
  const day = dayType(r.when, now);
  const timed = r.time && r.time !== "late_night" ? r.time : null;
  const column: PriceColumn | null = timed ? (`${day === "weekend" ? "weekend_" : ""}${timed}_price` as PriceColumn) : null;
  // "No evening rate listed", "No weekend evening rate listed": the column read.
  const timeWord = timed ? `${day === "weekend" ? "weekend " : ""}${TIME_WORD[timed]}` : "";
  const bars: PriceChart["bars"] = [];
  const off: PriceChart["off"] = [];
  turfs.forEach((t) => {
    const shown = cardPrice(t, sport);
    if (shown.kind !== "real") {
      // The sport rule took the card's price away: say whose it isn't, not that there is none.
      const own = sport && sportName && summarisePrice(t).kind === "real";
      off.push({ id: t.id, why: own ? `No ${sportName.toLowerCase()} rate listed` : shown.label });
      return;
    }
    if (shown.unit !== "/hr" || shown.min == null) {
      off.push({ id: t.id, why: shown.label });
      return;
    }
    if (!column) {
      bars.push({ id: t.id, value: shown.min, display: shown.min === shown.max ? rupees(shown.min) : `from ${rupees(shown.min)}` });
      return;
    }
    // The slot columns are the sport's only when the card shows them as they are.
    if (!sport || sportPrice(t, summarisePrice(t), sport).from === "card") {
      const v = positivePrice(t[column]);
      if (v != null) bars.push({ id: t.id, value: v, display: rupees(v) });
      else off.push({ id: t.id, why: `No ${timeWord} rate listed (${shown.label})` });
      return;
    }
    // Else the card shows the range the venue's bands give the sport: the sport's band at the time.
    const sportWord = sportName ?? "This sport";
    if (!times) {
      off.push({ id: t.id, why: `${sportWord} ${shown.label}; its page has the rate by time` });
      return;
    }
    const band = sportBandTimeRange(times[t.id], sport, BAND_AT[timed!], day);
    if (band) bars.push({ id: t.id, value: band[0], display: band[0] === band[1] ? rupees(band[0]) : `from ${rupees(band[0])}` });
    else off.push({ id: t.id, why: `No ${timeWord} ${sportWord.toLowerCase()} rate listed (${shown.label})` });
  });
  const order = new Map(turfs.map((t, i) => [t.id, i]));
  bars.sort((a, b) => a.value - b.value || order.get(a.id)! - order.get(b.id)!);
  const title = timed ? `${cap(TIME_WORD[timed])} rate per hour, ${day === "weekend" ? "weekends" : "weekdays"}` : "Lowest listed rate per hour";
  const note = [
    sportName ? `${sportName}, cheapest first` : "Cheapest first",
    r.time === "late_night" ? "late-night rates aren't charted here, so this is each venue's lowest listed rate" : null,
    r.max_price_per_hour != null && r.max_price_per_hour > 0 ? `your budget ${rupees(r.max_price_per_hour)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title, note, bars, off };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Map ────────────────────────────────────────────────────────────

// The map (lib/ask/visuals.ts ResultsMap) is drawn by us, from our rows' own coordinates.

/** With the visitor's location: venues this far away or more stay off the map. */
const NEAR_KM = 40;
/** Without it, a map only for venues in one stretch of a city... */
const SPAN_KM = 60;
/** ...that are not all in one spot. */
const MIN_SPREAD_KM = 0.3;
/** The width the pins are kept apart for: the frame on a 320px phone. */
const NOMINAL_PX = 288;
/** Each pin's round tap target is this wide (AskVisuals), so pins this far apart never cover a neighbour's disc. */
const PIN_GAP_PX = 30;

type Point = { id: string; n: number; lat: number; lng: number; area: string | null };

const validPoint = (lat: unknown, lng: unknown) => {
  const a = Number(lat);
  const b = Number(lng);
  return lat != null && lng != null && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
};

/**
 * Where the shown venues are, numbered as their cards, or null when a map
 * would say nothing: fewer than two placed, or (without the visitor's
 * location) venues spread over more than one city or all in one area. With
 * the location, the visitor's dot and the venues within NEAR_KM of it; when
 * fewer than two are that close, the map is drawn without the dot, by the
 * same rules as without it.
 */
export function resultsMap(items: readonly { id: string; lat?: unknown; lng?: unknown; area: string | null }[], loc: Coords | null): ResultsMap | null {
  const placed: Point[] = items.flatMap((t, i) => (validPoint(t.lat, t.lng) ? [{ id: t.id, n: i + 1, lat: Number(t.lat), lng: Number(t.lng), area: t.area }] : []));
  let me = loc && validPoint(loc.lat, loc.lng) ? loc : null;
  let pts = placed;
  if (me) {
    const near = placed.filter((p) => haversineKm(me!, p) < NEAR_KM);
    if (near.length >= 2) pts = near;
    else me = null;
  }
  if (pts.length < 2) return null;
  if (!me) {
    let spread = 0;
    for (const a of pts) for (const b of pts) spread = Math.max(spread, haversineKm(a, b));
    const areas = new Set(pts.map((p) => p.area?.trim().toLowerCase()).filter(Boolean));
    if (spread > SPAN_KM || spread < MIN_SPREAD_KM || areas.size < 2) return null;
  }

  // Kilometres east and north of the middle, then into the frame with a margin.
  const all = me ? [...pts, me] : pts;
  const lat0 = (Math.min(...all.map((p) => p.lat)) + Math.max(...all.map((p) => p.lat))) / 2;
  const lng0 = (Math.min(...all.map((p) => p.lng)) + Math.max(...all.map((p) => p.lng))) / 2;
  const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110.574;
  const km = (p: Coords) => ({ x: (p.lng - lng0) * kx, y: (p.lat - lat0) * ky });
  const spanX = Math.max(...all.map((p) => Math.abs(km(p).x))) * 2;
  const spanY = Math.max(...all.map((p) => Math.abs(km(p).y))) * 2;
  const PAD_X = 0.09;
  const PAD_Y = 0.15;
  // The kilometres the frame's width stands for: whichever way is fuller sets it, at least a kilometre.
  const across = Math.max(spanX / (1 - 2 * PAD_X), (spanY * MAP_ASPECT) / (1 - 2 * PAD_Y), 1);
  const at = (p: Coords) => {
    const k = km(p);
    return { x: 0.5 + k.x / across, y: 0.5 - (k.y * MAP_ASPECT) / across };
  };
  const pins = pts.map((p) => ({ id: p.id, n: p.n, ...at(p) }));
  const you = me ? at(me) : null;

  // Pins closer than PIN_GAP_PX on the narrowest frame move apart, a little at a time.
  const H = NOMINAL_PX / MAP_ASPECT;
  const start = pins.map((p) => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    const others = [...pins, ...(you ? [{ id: "", n: 0, ...you }] : [])];
    pins.forEach((p, i) => {
      for (const q of others) {
        if (q === p) continue;
        let dx = (p.x - q.x) * NOMINAL_PX;
        let dy = (p.y - q.y) * H;
        let d = Math.hypot(dx, dy);
        if (d >= PIN_GAP_PX) continue;
        if (d < 0.01) {
          // The same spot: fan out by the card's number.
          const a = (i * 2.4) % (2 * Math.PI);
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1;
        }
        // The pin moves the whole gap away from the visitor's dot, half of it away from another pin.
        const push = ((PIN_GAP_PX - d) / (q.id === "" ? 1 : 2)) / d;
        p.x += (dx * push) / NOMINAL_PX;
        p.y += (dy * push) / H;
        moved = true;
      }
      p.x = Math.min(1 - PAD_X / 2, Math.max(PAD_X / 2, p.x));
      p.y = Math.min(1 - PAD_Y / 2, Math.max(PAD_Y / 2, p.y));
    });
    if (!moved) break;
  }
  const nudged = pins.some((p, i) => Math.hypot((p.x - start[i].x) * NOMINAL_PX, (p.y - start[i].y) * H) > 2);

  // A round distance, under a third of the frame's width.
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  const kmBar = [...steps].reverse().find((s) => s <= across / 3) ?? 0.1;

  // The scale bar in the first corner no pin covers, then the area names
  // under (else over) their venues, where they clear every pin, the dot,
  // the scale bar and each other.
  type Box = { x0: number; x1: number; y0: number; y1: number };
  const boxes: Box[] = [];
  const clear = (b: Box) =>
    b.x0 >= 0 &&
    b.x1 <= NOMINAL_PX &&
    b.y0 >= 0 &&
    b.y1 <= H &&
    [...pins, ...(you ? [you] : [])].every((p) => {
      const cx = p.x * NOMINAL_PX;
      const cy = p.y * H;
      return cx + 13 < b.x0 || cx - 13 > b.x1 || cy + 13 < b.y0 || cy - 13 > b.y1;
    }) &&
    boxes.every((o) => o.x1 < b.x0 || o.x0 > b.x1 || o.y1 < b.y0 || o.y0 > b.y1);
  const barW = Math.max(36, (kmBar / across) * NOMINAL_PX) + 4;
  const corners = {
    bl: { x0: 6, x1: 6 + barW, y0: H - 28, y1: H - 4 },
    br: { x0: NOMINAL_PX - 6 - barW, x1: NOMINAL_PX - 6, y0: H - 28, y1: H - 4 },
    tl: { x0: 6, x1: 6 + barW, y0: 4, y1: 28 },
    tr: { x0: NOMINAL_PX - 6 - barW, x1: NOMINAL_PX - 6, y0: 4, y1: 28 },
  } as const;
  const corner = (Object.keys(corners) as (keyof typeof corners)[]).find((k) => clear(corners[k])) ?? "bl";
  boxes.push(corners[corner]);
  const byArea = new Map<string, { name: string; ps: typeof pins }>();
  pts.forEach((p, i) => {
    const name = p.area?.trim();
    if (!name) return;
    const key = name.toLowerCase();
    const hit = byArea.get(key) ?? { name, ps: [] };
    hit.ps.push(pins[i]);
    byArea.set(key, hit);
  });
  const areas: ResultsMap["areas"] = [];
  for (const { name, ps } of [...byArea.values()].sort((a, b) => b.ps.length - a.ps.length).slice(0, 6)) {
    const cx = (ps.reduce((s, p) => s + p.x, 0) / ps.length) * NOMINAL_PX;
    const cy = (ps.reduce((s, p) => s + p.y, 0) / ps.length) * H;
    const w = Math.min(name.length, 18) * 6.2 + 6;
    for (const dy of [21, -21, 34, -34]) {
      const b = { x0: cx - w / 2, x1: cx + w / 2, y0: cy + dy - 7, y1: cy + dy + 7 };
      if (!clear(b)) continue;
      boxes.push(b);
      areas.push({ name, x: round(cx / NOMINAL_PX), y: round((cy + dy) / H) });
      break;
    }
  }

  return {
    pins: pins.map((p) => ({ id: p.id, n: p.n, x: round(p.x), y: round(p.y) })),
    me: you ? { x: round(you.x), y: round(you.y) } : null,
    areas,
    scale: { km: kmBar, w: round(kmBar / across), at: corner },
    left: items.length - pins.length,
    nudged,
  };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

// ── Comparison ─────────────────────────────────────────────────────

const FACILITIES: [keyof Turf, string][] = [
  ["has_floodlights", "Floodlights"],
  ["is_covered", "Covered"],
  ["parking_available", "Parking"],
  ["washroom_available", "Washroom"],
  ["changing_room_available", "Changing room"],
  ["has_cafeteria", "Cafeteria"],
  ["equipment_provided", "Equipment"],
];

/**
 * A venue's hours in one line: "Open 24 hours", "6:00 AM – 10:00 PM", or
 * the most common hours then the days that differ ("6:00 AM – 10:00 PM;
 * Sun 7:00 AM – 10:00 PM"). When most days are closed, the open days come
 * first, then the closed ones ("Tue, Thu 7:00 PM – 9:00 PM; Mon, Wed, Sat,
 * Sun closed"), not a "Closed" first that reads as shut all week. Null
 * when none are listed.
 */
export function hoursLine(t: Pick<Turf, "opening_hours" | "start_time" | "end_time" | "is_24x7">): string | null {
  const rows = normaliseOpeningHours(t.opening_hours, { start_time: t.start_time, end_time: t.end_time, is_24x7: t.is_24x7 });
  const said = rows.flatMap((r) => {
    const text = r.closed ? "Closed" : r.spans.length ? r.spans.map(formatSpan).join(", ") : null;
    return text ? [{ day: r.day.slice(0, 3), text }] : [];
  });
  if (!said.length) return null;
  const count = new Map<string, number>();
  for (const s of said) count.set(s.text, (count.get(s.text) ?? 0) + 1);
  const base = [...count].sort((a, b) => b[1] - a[1])[0][0];
  const rest = new Map<string, string[]>();
  for (const s of said) if (s.text !== base) rest.set(s.text, [...(rest.get(s.text) ?? []), s.day]);
  const others = [...rest].map(([text, days]) => `${days.join(", ")} ${text}`);
  if (base !== "Closed") return [base, ...others].join("; ");
  const closed = said.filter((s) => s.text === "Closed").map((s) => s.day);
  return others.length ? `${others.join("; ")}; ${closed.join(", ")} closed` : "Closed";
}

/**
 * The comparison's rows from the venues' own rows (turf_page's, as their
 * pages read them): price, Google's rating, TapTurf players' reports,
 * hours, distance, sports, facilities, the Claimed mark and the page's
 * Call and WhatsApp numbers. `reports`: each venue's TapTurf players'
 * count and average (the fact sheet's tapturf_reports), when it has any.
 * The price is a card's (cardPrice: the sport's own when a sport was
 * asked, summarisePrice otherwise), and the cards under the table show
 * this same price (AskResults' compare view hands it to them), so the two
 * never disagree; a venue that lists only price bands reads "Not listed"
 * here as on its card, though its page shows the bands
 * (summarisePagePrice; which wins on cards is the owner's call).
 */
export function compareTable(
  turfs: readonly Turf[],
  opts: { sport?: string | null; loc?: Coords | null; reports?: readonly ({ players: number; average: string } | null)[] } = {},
): CompareTable {
  const sport = cardSportOf(opts.sport);
  const loc = opts.loc && validPoint(opts.loc.lat, opts.loc.lng) ? opts.loc : null;
  const venues = turfs.map((t, i): CompareVenue => {
    const p = cardPrice(sport ? withOwnBands(t) : t, sport);
    const rating = Number(t.rating) || 0;
    const km = loc && validPoint(t.lat, t.lng) ? haversineKm(loc, { lat: Number(t.lat), lng: Number(t.lng) }) : null;
    const rep = opts.reports?.[i] ?? null;
    return {
      id: t.id,
      price: p.kind === "unknown" ? null : { label: p.label, kind: p.kind },
      google: rating > 0 ? { rating: rating.toFixed(1), reviews: t.total_reviews > 0 ? t.total_reviews.toLocaleString("en-IN") : null } : null,
      players: rep && rep.players > 0 ? { count: rep.players, average: rep.average } : null,
      hours: hoursLine(t),
      km: km != null && Number.isFinite(km) ? Math.round(km * 10) / 10 : null,
      sports: [...new Set((t.sports ?? []).map((s) => s.trim()).filter(Boolean))],
      facilities: FACILITIES.filter(([k]) => t[k] === true).map(([, label]) => label),
      claimed: t.claimed === true,
      contact: { phone: getPhone(t), whatsapp: getWhatsAppPhone(t), membersOnly: t.membership_required === true, address: t.address ?? "" },
    };
  });
  return { venues, distance: venues.some((v) => v.km != null) };
}

// ── Host this game ─────────────────────────────────────────────────

const DAY_WORD: Record<string, string> = { today: "Today", tomorrow: "Tomorrow", weekend: "This weekend", this_week: "This week" };
const TIME_LABEL: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night" };
const SKILL_WORD: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };

/** "Here", "this turf", "yahan": the venue page the player is on. */
const HERE = /\b(?:here|this (?:turf|ground|venue|place|court|one)|yahan|yaha|idhar|ithe|isi turf)\b/i;
export const saysHere = (q: string): boolean => HERE.test(q);

/**
 * The venue part of a hosting sentence: what follows "at" or "@", up to a
 * comma or the next detail ("at Hindu Gymkhana Kothrud with 10 players"),
 * or null. Only a candidate: the caller checks it names a venue we list.
 */
export function hostVenueWords(q: string): string | null {
  const text = q.trim();
  for (const m of text.matchAll(/(?:\bat|@)\s+/gi)) {
    const words = text
      .slice(m.index + m[0].length)
      .split(/\s*[,.;!?]\s*|\s+(?:with|for|on|from|need|needs|and|tomorrow|today|tonight|this|next|at)\s+/i)[0]
      .trim();
    // "at 7 pm", "at 7:30": a time, not a place.
    if (words && !/^\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|baje)?$/i.test(words)) return words.slice(0, 80);
  }
  return null;
}

/** The host card: what the reading says of the game, the venue, and the wizard's link. */
export function hostPreview(
  r: { sport: string | null; when: string | null; time: string | null; players: number | null; skill: string | null },
  turf: Pick<Turf, "id" | "slug" | "name" | "area" | "address" | "city"> | null,
  draft: string,
): HostPreview {
  const lines: HostPreview["lines"] = [];
  const sport = r.sport ? sportBySlug(r.sport)?.name : null;
  if (sport) lines.push({ label: "Sport", value: sport });
  if (r.when && DAY_WORD[r.when]) lines.push({ label: "Day", value: DAY_WORD[r.when] });
  if (r.time && TIME_LABEL[r.time]) lines.push({ label: "Time", value: TIME_LABEL[r.time] });
  if (r.players != null && Number.isInteger(r.players) && r.players >= 2 && r.players <= 40) lines.push({ label: "Players", value: String(r.players) });
  if (r.skill && SKILL_WORD[r.skill]) lines.push({ label: "Level", value: SKILL_WORD[r.skill] });
  const area = turf ? areaFor(turf) : null;
  const city = turf?.city && isCity(turf.city) ? labelFor(turf.city) : null;
  const place = [area, city].filter(Boolean).join(", ") || null;
  const params = new URLSearchParams({ draft });
  if (turf) {
    params.set("turf", turf.id);
    params.set("turfName", turf.name);
  }
  return {
    lines,
    turf: turf ? { id: turf.id, slug: turf.slug ?? null, name: turf.name, place } : null,
    href: `/game/create?${params}`,
  };
}
