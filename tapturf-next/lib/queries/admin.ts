import { cache } from "react";
import { anonRead } from "@/lib/admin/db";
import { adminConfirmed, adminUserRows, adminUsers } from "@/lib/queries/adminUsers";
import { googleUnfinished } from "@/lib/queries/adminLinks";
import { isVerified } from "@/lib/admin/people";
import { notFinishedSignupRows } from "@/lib/admin/links";
import {
  activeUsers,
  bookingTotals,
  countByLabel,
  createdSince,
  dailyCounts,
  gamesByCity,
  peopleTotals,
  reviewTotals,
  topHostCounts,
  turfsByCity,
  type CountByLabel,
  type DailyPoint,
  type GameRow,
  type PeopleTotals,
  type RequestRow,
} from "@/lib/admin/home";
import { both, countOf, dataOf, mapSection, okSection, readAllPages, ReadFailed, rowsOf, type Section } from "@/lib/admin/section";

/**
 * Admin dashboard queries. All read-only, all settled (lib/admin/db.ts):
 * each returns its numbers or why it couldn't read them, never a throw and
 * never a failure dressed up as 0. Each read is made once per render
 * (React cache()) however many sections show it. The games and join
 * requests are read once, whole (paged), and every games number is worked
 * out from those rows (lib/admin/home.ts). Nothing here should leak into a
 * client bundle: import from a server component only.
 */

export type { CountByLabel, DailyPoint } from "@/lib/admin/home";

export interface TopHost {
  id: string;
  name: string | null;
  email: string | null;
  games: number;
}

const DAY = 86_400_000;

/** The games columns the admin shows (the home's list and /admin/games). */
const GAME_COLUMNS = "id, title, sport, date, start_time, end_time, max_players, current_players, price_per_player, status, host_name, host_phone, creator_id, created_at, turf_id";

/** Every game, paged (PostgREST returns at most 1,000 rows a request), once per render. */
export const gameRows = cache(() =>
  anonRead("games", (s, signal) =>
    readAllPages<GameRow>((from, to) => s.from("games").select(GAME_COLUMNS).order("id").range(from, to).abortSignal(signal), "games"),
  ),
);

/** Every join request (its game, who, status and time), paged, once per render. */
export const requestRows = cache(() =>
  anonRead("game_requests", (s, signal) =>
    readAllPages<RequestRow>((from, to) => s.from("game_requests").select("game_id, user_id, status, created_at").order("id").range(from, to).abortSignal(signal), "game_requests"),
  ),
);

export type TurfBrief = { id: string; name: string; city: string | null };

const turfsByKey = cache((key: string) =>
  anonRead("turfs of games", async (s, signal) => {
    const ids = key ? key.split(",") : [];
    const out = new Map<string, TurfBrief>();
    // In chunks: a long list of ids doesn't fit in one request's URL.
    for (let i = 0; i < ids.length; i += 150) {
      const rows = rowsOf<TurfBrief>(await s.from("turfs").select("id, name, city").in("id", ids.slice(i, i + 150)).abortSignal(signal), "turfs");
      for (const t of rows) out.set(t.id, t);
    }
    return out;
  }),
);

/** These turfs' name and city, once per render for each set of ids. */
export function turfsById(ids: (string | null | undefined)[]): Promise<Section<Map<string, TurfBrief>>> {
  return turfsByKey([...new Set(ids.filter((x): x is string => !!x))].sort().join(","));
}

/** Active turfs, counted on their ids (a count over select * built up to 1,000 wide rows: 1.4 s against 16 ms). */
export const activeTurfCount = cache(() =>
  anonRead("active turfs", async (s, signal) =>
    countOf(await s.from("turfs").select("id", { count: "exact", head: true }).eq("is_active", true).abortSignal(signal), "active turfs"),
  ),
);

/**
 * Active turfs by city: the city_turf_counts view (one row a city) and the
 * active count for the turfs without a city ("unknown"). Before, every
 * active turf's city was paged in seven reads, and a failed page threw out
 * of the whole admin home (27 Oct).
 */
export const turfsByCitySection = cache(async (): Promise<Section<CountByLabel[]>> => {
  const [view, active] = await Promise.all([
    anonRead("city_turf_counts", async (s, signal) =>
      rowsOf<{ city: string | null; n: number }>(await s.from("city_turf_counts").select("city, n").abortSignal(signal), "city_turf_counts"),
    ),
    activeTurfCount(),
  ]);
  return mapSection(both(view, active), ([rows, n]) => turfsByCity(rows, Math.max(0, n - rows.reduce((sum, r) => sum + Number(r.n || 0), 0))));
});

export type GameNumbers = {
  totalGames: number;
  games7d: number;
  games30d: number;
  /** Games created per day, the last 30 days. */
  daily: DailyPoint[];
  bySport: CountByLabel[];
  byStatus: CountByLabel[];
};

/** Every games number the home shows, from the games read once. */
export const gameNumbers = cache(async (): Promise<Section<GameNumbers>> => {
  const now = Date.now();
  return mapSection(await gameRows(), (games) => ({
    totalGames: games.length,
    games7d: createdSince(games, now - 7 * DAY).length,
    games30d: createdSince(games, now - 30 * DAY).length,
    daily: dailyCounts(games, 30, now),
    bySport: countByLabel(games.map((g) => g.sport), "other"),
    byStatus: countByLabel(games.map((g) => g.status), "unknown"),
  }));
});

/**
 * Active users = distinct users who created a game OR made a request
 * in the last N days. Best proxy we have without a session events table.
 */
export const activeUserNumbers = cache(async (): Promise<Section<{ active7: number; active30: number }>> => {
  const now = Date.now();
  const [games, requests] = await Promise.all([gameRows(), requestRows()]);
  return mapSection(both(games, requests), ([g, r]) => ({ active7: activeUsers(g, r, 7, now), active30: activeUsers(g, r, 30, now) }));
});

/** Games by their turf's city. Games don't carry the city: it comes from their turfs. */
export const gamesByCitySection = cache(async (): Promise<Section<CountByLabel[]>> => {
  const games = await gameRows();
  if (!games.ok) return games;
  const ids = games.data.map((g) => g.turf_id).filter(Boolean);
  if (ids.length === 0) return okSection([]);
  const turfs = await turfsById(ids);
  return mapSection(turfs, (byId) => gamesByCity(games.data, new Map([...byId].map(([id, t]) => [id, t.city]))));
});

/** The hosts with the most games, with their names (a name that can't be read shows the id). */
export async function getTopHosts(limit = 10): Promise<Section<TopHost[]>> {
  const games = await gameRows();
  if (!games.ok) return games;
  const sorted = topHostCounts(games.data, limit);
  if (sorted.length === 0) return okSection([]);
  const users = await adminUserRows(sorted.map(([id]) => id));
  const byId = new Map(users.map((u) => [u.id, u]));
  return okSection(sorted.map(([id, n]) => ({ id, games: n, name: byId.get(id)?.name ?? null, email: byId.get(id)?.email ?? null })));
}

export type PeopleNumbers = PeopleTotals & {
  /** Accounts a sign-in confirmed something for (the old app's flag where that can't be read). */
  verifiedUsers: number;
};

/**
 * The people tiles: every account (admin_users) with the Google sign-ins
 * that made none (admin_google_unfinished, nothing before
 * 20261026_account_links.sql), as the sign-ups chart counts them, one
 * person counted once (same email or phone).
 */
export const peopleNumbers = cache(async (): Promise<Section<PeopleNumbers>> => {
  const [accounts, unfinished, confirmed] = await Promise.all([adminUsers(), googleUnfinished(), adminConfirmed()]);
  if (!accounts.ok) return accounts;
  if (!unfinished.ok && unfinished.reason !== "not_set_up") return unfinished;
  const rows = accounts.data;
  return okSection({
    ...peopleTotals(rows, notFinishedSignupRows(unfinished.ok ? unfinished.data : []), Date.now()),
    // What sign-ins confirmed (Google's email, a checked phone code), not the old app's flag.
    verifiedUsers: rows.filter((r) => isVerified(confirmed ? (confirmed.get(r.id) ?? { email: null, phone: false }) : null, r.is_verified)).length,
  });
});

/** All notifications and the unread ones, counted on ids. */
export const notificationNumbers = cache(() =>
  anonRead("notifications", async (s, signal) => {
    const [all, unread] = await Promise.all([
      s.from("notifications").select("id", { count: "exact", head: true }).abortSignal(signal),
      s.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false).abortSignal(signal),
    ]);
    return { total: countOf(all, "notifications"), unread: countOf(unread, "unread notifications") };
  }),
);

/** Bookings and revenue (every booking, paged). */
export const bookingNumbers = cache(() =>
  anonRead("bookings", async (s, signal) =>
    bookingTotals(
      await readAllPages<{ total_amount: number | null; status: string | null; payment_status: string | null; created_at: string | null }>(
        (from, to) => s.from("bookings").select("id, total_amount, status, payment_status, created_at").order("id").range(from, to).abortSignal(signal),
        "bookings",
      ),
      Date.now(),
    ),
  ),
);

/** TapTurf's own reports only: the imported Google reviews are counted on the turfs. */
export const reviewNumbers = cache(() =>
  anonRead("reviews", async (s, signal) =>
    reviewTotals(
      await readAllPages<{ rating: number | null }>((from, to) => s.from("reviews").select("id, rating").is("source", null).order("id").range(from, to).abortSignal(signal), "reviews"),
    ),
  ),
);

// ── Turf contact taps (Call / WhatsApp) ─────────────────

export interface ContactClickStats {
  days: number;
  calls: number;
  whatsapps: number;
  login_prompts: number;
  unique_users: number;
  turfs: number;
  top: { id: string; name: string; city: string | null; calls: number; whatsapps: number; login_prompts: number }[];
}

/** Aggregated Call / WhatsApp taps over the last `days` days. */
export const getContactClickStats = cache((days: number) =>
  anonRead(`get_contact_click_stats ${days}d`, async (s, signal) => {
    const data = dataOf<ContactClickStats>(await s.rpc("get_contact_click_stats", { p_days: days }).abortSignal(signal), "get_contact_click_stats");
    if (!data) throw new ReadFailed("error", "get_contact_click_stats: no answer");
    return { ...data, top: Array.isArray(data.top) ? data.top : [] };
  }),
);
