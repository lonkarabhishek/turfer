import type { PriceMention, PriceUnit, SportBands, Turf } from "../../types/turf";
import type { Game } from "../../types/game";
import { areaFor } from "../utils/area";
import { turfPhotos } from "../utils/images";
import { cardPrice, type CardSport } from "../utils/cardSport";
import { priceRangeText } from "../utils/prices";
import { formatClock, formatGameDay, sortGamesByDateTime } from "../utils/game";
import { sportLabel } from "../utils/sport";

/**
 * What /map shows, as it travels (GET /api/map/turfs and /api/map/games)
 * and as the page reads it back. Every active turf with a location goes
 * to the browser at once (3,826 of 3,830 on 1 Nov), so a turf is cut to
 * what its pin, its list card (TurfCard) and the picked card read, under
 * short keys, with empty values left out: one photo, the six slot prices,
 * the reported prices as forCard() keeps them, and its sport bands, so
 * cardPrice() gives every card and pin the price the rest of the site
 * shows for it, sport chip or not. No phone, owner or contact field is
 * read here. Relative imports only, so `npm run test:list` compiles it on
 * its own.
 */

/** A turf on the map, as sent. */
export type MapTurfWire = {
  /** The turf page's key: its slug, else its id (/turf/<k>). */
  k: string;
  n: string;
  /** Where it is: the area, else the address (TurfCard's areaFor ?? address). */
  p?: string;
  /** City id. */
  c?: string;
  /** Latitude and longitude, 5 decimals (about a metre). */
  y: number;
  x: number;
  /** Sports, as stored. */
  s?: string[];
  /** Rating and review count. */
  r?: number;
  v?: number;
  /** Morning, afternoon and evening, then the same at weekends; null for none. */
  pr?: (number | null)[];
  /** The price unit, when it is not per hour (null and "per_hour" read the same). */
  u?: PriceUnit;
  sm?: number;
  /** Reported prices, in order: the price, or 0 for a note without one (forCard keeps no more). */
  m?: number[];
  /** One photo, the card's first. */
  ph?: string;
  /** Open 24 hours. */
  h?: 1;
  /** Claimed by its owner. */
  o?: 1;
  /** The ranges its price bands give each sport (lib/queries/sportBands.ts). */
  b?: SportBands;
};

const PRICE_KEYS = [
  "morning_price",
  "afternoon_price",
  "evening_price",
  "weekend_morning_price",
  "weekend_afternoon_price",
  "weekend_evening_price",
] as const;

/** 18.5645738 -> 18.56457 */
export function roundDeg(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}

function finiteCoord(v: unknown, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

/**
 * A turf's key and point on the map (its pin's), or null when it has no
 * usable location. A 0,0 point (the sea off Africa) is no location either.
 */
export function mapPoint(t: { id: string; slug?: string | null; lat?: unknown; lng?: unknown }): Pick<MapTurfWire, "k" | "y" | "x"> | null {
  const lat = finiteCoord(t.lat, 90);
  const lng = finiteCoord(t.lng, 180);
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;
  return { k: t.slug || t.id, y: roundDeg(lat), x: roundDeg(lng) };
}

/**
 * One turf for the map, from a card row (forCard, with its sport bands
 * when it has any), or null when it has no usable location (mapPoint).
 */
export function toMapTurf(t: Turf): MapTurfWire | null {
  const at = mapPoint(t);
  if (!at) return null;
  const w: MapTurfWire = { k: at.k, n: t.name, y: at.y, x: at.x };
  const place = areaFor(t) ?? t.address;
  if (place) w.p = place;
  if (t.city) w.c = t.city;
  if (t.sports?.length) w.s = t.sports;
  if (t.rating) w.r = t.rating;
  if (t.total_reviews) w.v = t.total_reviews;
  const pr = PRICE_KEYS.map((k) => t[k] ?? null);
  if (pr.some((p) => p != null)) w.pr = pr;
  if (t.price_unit && t.price_unit !== "per_hour") w.u = t.price_unit;
  if (t.slot_minutes) w.sm = t.slot_minutes;
  if (t.price_mentions?.length) w.m = t.price_mentions.map((m) => (m?.price_inr ? m.price_inr : 0));
  const photo = turfPhotos(t)[0];
  if (photo) w.ph = photo;
  if (t.is_24x7) w.h = 1;
  if (t.claimed) w.o = 1;
  if (t.sport_bands) w.b = t.sport_bands;
  return w;
}

/**
 * The turf back, shaped as the card row TurfCard and cardPrice() read
 * (a Turf with only those fields): exactly what forCard() would give for
 * prices, place, sports and the one photo. `id` and `slug` are both the
 * key, so turfPath() links to the same page.
 */
export function fromMapTurf(w: MapTurfWire): Turf {
  const t: Record<string, unknown> = {
    id: w.k,
    slug: w.k,
    name: w.n,
    address: w.p ?? "",
    area: w.p ?? null,
    city: w.c ?? null,
    lat: w.y,
    lng: w.x,
    rating: w.r ?? 0,
    total_reviews: w.v ?? 0,
    cover_image: w.ph ?? null,
    images: [],
    sports: w.s ?? [],
    price_mentions: w.m ? w.m.map((p): PriceMention => (p ? { price_inr: p } : { text: "." })) : null,
    price_unit: w.u ?? null,
    slot_minutes: w.sm ?? null,
    is_24x7: w.h === 1 ? true : null,
    claimed: w.o === 1 ? true : undefined,
    sport_bands: w.b ?? null,
  };
  PRICE_KEYS.forEach((k, i) => (t[k] = w.pr?.[i] ?? null));
  return t as unknown as Turf;
}

/** A game on the map, as sent: the fields GameCard and the pin read, nothing else (never the host's number). */
export type MapGame = Pick<
  Game,
  | "id"
  | "creator_id"
  | "sport"
  | "skill_level"
  | "date"
  | "start_time"
  | "end_time"
  | "current_players"
  | "max_players"
  | "price_per_player"
  | "turf_booked"
  | "status"
  | "host_name"
  | "host_profile_image_url"
> & { turfs: NonNullable<Game["turfs"]> & { lat: number; lng: number } };

/**
 * One open game for the map, from a /games card row (cardGame), or null
 * when its turf has no location. Its turf keeps what GameCard shows (name,
 * place, two photos) and where to put the pin.
 */
export function toMapGame(g: Game): MapGame | null {
  const t = g.turfs;
  const lat = finiteCoord(t?.lat, 90);
  const lng = finiteCoord(t?.lng, 180);
  if (!t || lat == null || lng == null || (lat === 0 && lng === 0)) return null;
  const out: MapGame = {
    id: g.id,
    creator_id: g.creator_id,
    sport: g.sport,
    skill_level: g.skill_level,
    date: g.date,
    start_time: g.start_time,
    end_time: g.end_time,
    current_players: g.current_players,
    max_players: g.max_players,
    price_per_player: g.price_per_player,
    turf_booked: g.turf_booked,
    status: g.status,
    host_name: g.host_name,
    turfs: {
      id: t.id,
      slug: t.slug ?? null,
      name: t.name,
      address: t.address,
      area: t.area ?? null,
      city: t.city ?? null,
      lat: roundDeg(lat),
      lng: roundDeg(lng),
      photos: (t.photos ?? []).slice(0, 2),
    },
  };
  if (g.host_profile_image_url) out.host_profile_image_url = g.host_profile_image_url;
  return out;
}

/** The games a tap picked (a pin, or every game in a bubble at one turf), soonest first. */
export function pickedGames<G extends Pick<MapGame, "id" | "date" | "start_time">>(keys: readonly string[], games: readonly G[]): G[] {
  const want = new Set(keys);
  return sortGamesByDateTime(games.filter((g) => want.has(g.id)));
}

/** A pin's words: `text` on the pin, `label` for a screen reader. */
export type PinText = { text: string; label: string };

/**
 * A turf's pin: the low end of the price its card shows (cardPrice, so a
 * sport chip shows only that sport's price, and a reported price reads
 * "~"), else the sport it leads with. Never "₹0".
 */
export function turfPin(t: Turf, sport?: CardSport | null): PinText {
  const price = cardPrice(t, sport);
  const from = price.kind === "real" || price.kind === "reported" ? priceRangeText(price.min, price.min) : null;
  const range = price.kind === "real" || price.kind === "reported" ? priceRangeText(price.min, price.max) : null;
  const lead = sport && "chip" in sport ? (t.sports.find((s) => s.toLowerCase().includes(sport.chip.toLowerCase())) ?? t.sports[0]) : t.sports[0];
  if (from && range) {
    const reported = price.kind === "reported";
    return {
      text: reported ? `~${from}` : from,
      label: `${t.name}, ${reported ? "players reported " : ""}${range}${price.unit}`,
    };
  }
  return { text: lead || "Turf", label: `${t.name}${lead ? `, ${lead}` : ""}, prices not listed yet` };
}

/**
 * A turf's share of its bubble's average: the low end of the price its
 * pin shows (cardPrice, so the sport chip's rule applies), per hour, when
 * that price is listed. A reported price ("~₹700") is not listed and
 * counts for nothing. A price per slot of a known length becomes its
 * hourly rate (₹1,500 for a 90-minute slot is ₹1,000 an hour); one per
 * slot of no stated length, or per person, has no hourly rate and counts
 * for nothing. A band's price is per hour. On 1 Nov every listed price
 * was per hour: 1,183 of the 1,212 active turfs with one said so, the
 * other 29 named no unit, which the site reads as per hour, and none was
 * per slot or per person.
 */
export function turfHourly(t: Turf, sport?: CardSport | null): number | null {
  const price = cardPrice(t, sport);
  if (price.kind !== "real" || price.min == null || !(price.min > 0)) return null;
  if (price.unit === "/hr") return price.min;
  const slot = /^\/(\d+)-min slot$/.exec(price.unit);
  const minutes = slot ? Number(slot[1]) : 0;
  return minutes > 0 ? (price.min * 60) / minutes : null;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A game's pin: when it starts, short ("Today 7 PM", "Tmrw 6:30 AM",
 * "Sat 7 PM" this week, "9 Nov" after), India time as stored.
 */
export function gamePin(g: Pick<MapGame, "date" | "start_time" | "sport" | "turfs">, now: number = Date.now()): PinText {
  const day = formatGameDay(g.date, now);
  const clock = formatClock(g.start_time);
  const [y, m, d] = (g.date ?? "").split("-").map(Number);
  const weekday = Number.isFinite(y) ? WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] : "";
  const when =
    day.diff === 0 ? `Today ${clock}` : day.diff === 1 ? `Tmrw ${clock}` : day.diff > 1 && day.diff < 7 && weekday ? `${weekday} ${clock}` : day.plain.replace(/^\w+ /, "");
  return { text: when, label: `${sportLabel(g.sport)} game at ${g.turfs?.name ?? "a turf"}, ${day.title}, ${clock.replace(/ /g, " ")}` };
}
