import { createReadOnlyClient } from "@/lib/supabase/server";
import { sportBySlug } from "@/lib/sports";
import { haversineKm, type Coords } from "@/lib/utils/location";
import { isGameExpired, sortGamesByDateTime } from "@/lib/utils/game";
import type { CityId } from "@/lib/city";
import type { Game } from "@/types/game";
import type { AskFilters } from "./ask";

/**
 * Open games for Ask TapTurf, server side. Same rows the /games page
 * shows, joined to their turf for city and distance. Host phone
 * numbers never leave the server here: the game page shows them to
 * signed-in players only.
 */

export type AskGame = Game & { distanceKm?: number };

const TURF_COLS = 'id, name, address, city, lat, lng, "Gmap Embed link"';

/** Today in India as YYYY-MM-DD, since game dates are stored that way. */
function istToday(): Date {
  const now = new Date();
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  ist.setHours(0, 0, 0, 0);
  return ist;
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function loadOpenGames(): Promise<Game[]> {
  const supabase = createReadOnlyClient();
  const { data, error } = await supabase
    .from("games")
    .select("*")
    .in("status", ["open", "upcoming", "active"])
    .gte("date", ymd(istToday()))
    .order("date", { ascending: true })
    .limit(300);
  if (error || !data) return [];
  const turfIds = [...new Set(data.map((g) => g.turf_id).filter(Boolean))];
  const turfsMap: Record<string, Game["turfs"]> = {};
  if (turfIds.length) {
    const { data: turfs } = await supabase.from("turfs").select(TURF_COLS).in("id", turfIds);
    for (const t of turfs ?? []) turfsMap[(t as { id: string }).id] = t as Game["turfs"];
  }
  return (data as Game[])
    .map((g) => ({ ...g, host_phone: "", turfs: g.turf_id ? turfsMap[g.turf_id] : undefined }))
    .filter((g) => !isGameExpired(g));
}

export type GamesResult = { games: AskGame[]; total: number; relaxed: string[] };

/** Date window for "when": [from, to] inclusive, as YYYY-MM-DD. */
function whenWindow(when: AskFilters["when"]): [string, string] | null {
  const today = istToday();
  const add = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d;
  };
  switch (when) {
    case "today":
      return [ymd(today), ymd(today)];
    case "tomorrow":
      return [ymd(add(1)), ymd(add(1))];
    case "weekend": {
      // Next Saturday and Sunday; on a weekend, this one.
      const dow = today.getDay(); // 0 Sun .. 6 Sat
      const toSat = dow === 0 ? -1 : (6 - dow) % 7;
      const sat = add(toSat);
      const sun = add(toSat + 1);
      return [ymd(dow === 0 ? today : sat), ymd(sun)];
    }
    case "this_week":
      return [ymd(today), ymd(add(7))];
    default:
      return null;
  }
}

export function applyGameFilters(
  all: Game[],
  f: AskFilters,
  opts: { prefCity?: CityId | null; loc?: Coords | null; limit?: number } = {},
): GamesResult {
  const limit = opts.limit ?? 10;
  const sport = f.sport ? sportBySlug(f.sport) : undefined;
  const city = f.city ?? (!f.wants_nearby ? (opts.prefCity ?? null) : null);
  const window = whenWindow(f.when);

  type Step = { key: string; keep: (g: Game) => boolean };
  const steps: Step[] = [];
  if (sport) {
    const labels = sport.labels.map((l) => l.toLowerCase());
    steps.push({ key: "sport", keep: (g) => labels.some((l) => (g.sport ?? "").toLowerCase().includes(l)) });
  }
  if (city) steps.push({ key: f.city ? "city" : "pref_city", keep: (g) => g.turfs?.city === city });
  if (window) steps.push({ key: "when", keep: (g) => g.date >= window[0] && g.date <= window[1] });
  if (f.skill) steps.push({ key: "skill", keep: (g) => g.skill_level === f.skill || g.skill_level === "all" });
  if (f.max_price_per_hour != null) {
    const max = f.max_price_per_hour;
    steps.push({ key: "price", keep: (g) => Number(g.price_per_player ?? 0) <= max });
  }

  const dropOrder = ["price", "skill", "when", "pref_city", "sport"];
  const active = new Set(steps.map((s) => s.key));
  const relaxed: string[] = [];
  let matched: Game[] = [];
  for (;;) {
    matched = all.filter((g) => steps.every((s) => !active.has(s.key) || s.keep(g)));
    if (matched.length > 0) break;
    const next = dropOrder.find((k) => active.has(k));
    if (!next) break;
    active.delete(next);
    relaxed.push(next);
  }

  let games: AskGame[] = sortGamesByDateTime(matched);
  if (opts.loc) {
    games = games.map((g) => {
      const lat = g.turfs?.lat;
      const lng = g.turfs?.lng;
      const km = lat != null && lng != null ? haversineKm(opts.loc!, { lat: Number(lat), lng: Number(lng) }) : undefined;
      return km != null && Number.isFinite(km) ? { ...g, distanceKm: km } : g;
    });
    if (f.wants_nearby || f.sort === "nearby") {
      games.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    }
  }
  return { games: games.slice(0, limit), total: games.length, relaxed };
}
