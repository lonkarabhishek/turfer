import { sportBySlug } from "../sports";
import { haversineKm, type Coords } from "../utils/location";
import { sortGamesByDateTime } from "../utils/game";
import { istToday, ymd } from "../build/reads";
import { relaxSteps } from "./relax";
import type { CityId } from "../city";
import type { Game } from "../../types/game";
import type { AskFilters, AskReading } from "./ask";
import type { RouterVersion } from "./routerVersion";

/**
 * Ask's game search over the open games lib/ai/games.ts loads. Relative
 * imports only, so npm run test:ask runs it (moved from games.ts as it was).
 */

export type AskGame = Game & { distanceKm?: number };

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

/** `version` 10: router v10's free_to_join and turf_booked, and players as the spots the player needs. */
export function applyGameFilters(
  all: Game[],
  f: AskReading,
  opts: { prefCity?: CityId | null; loc?: Coords | null; limit?: number; version?: RouterVersion } = {},
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
  // Router v10: free to join, the host's turf already booked, and as many
  // spots left as the player needs. Never dropped (not in dropOrder): a
  // free game asked for is never a paid one shown as if it were.
  if (opts.version === 10) {
    if (f.free_to_join) steps.push({ key: "free", keep: (g) => Number(g.price_per_player ?? 0) === 0 });
    if (f.turf_booked) steps.push({ key: "turf_booked", keep: (g) => g.turf_booked === true });
    if (f.players != null && f.players > 0) {
      const need = f.players;
      steps.push({ key: "spots", keep: (g) => Number(g.max_players) - Number(g.current_players ?? 0) >= need });
    }
  }

  const dropOrder = ["price", "skill", "when", "pref_city", "sport"];
  const active = new Set(steps.map((s) => s.key));
  let relaxed: string[] = [];
  let matched: Game[] = [];
  // Router v10: what the widening made possible again is put back
  // (relaxSteps), so free football this weekend in Pune, when there is
  // none, is other free games this weekend in Pune, not any day anywhere.
  if (opts.version === 10) {
    ({ matched, relaxed } = relaxSteps(all, steps, dropOrder));
  } else {
    for (;;) {
      matched = all.filter((g) => steps.every((s) => !active.has(s.key) || s.keep(g)));
      if (matched.length > 0) break;
      const next = dropOrder.find((k) => active.has(k));
      if (!next) break;
      active.delete(next);
      relaxed.push(next);
    }
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
