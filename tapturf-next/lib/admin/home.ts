// The admin home's numbers, worked out from rows already read.
// No "@/" imports, so the unit test compiles it on its own (npm run test:trend).
//
// The games and join requests are read once per render (all rows, paged)
// and every games number comes from those rows: the counts, the daily chart,
// the breakdowns, the top hosts, the active users and the games list. Before,
// each was its own read of the same tables (14 a render), and a failed one
// quietly read 0.

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface CountByLabel {
  label: string;
  count: number;
}

export type GameRow = {
  id: string;
  title: string | null;
  sport: string;
  date: string;
  start_time: string;
  end_time: string;
  max_players: number;
  current_players: number;
  price_per_player: number | null;
  status: string | null;
  host_name: string | null;
  host_phone: string | null;
  creator_id: string | null;
  created_at: string;
  turf_id: string | null;
};

export type RequestRow = { game_id: string; user_id: string | null; status: string | null; created_at: string | null };

const DAY = 86_400_000;
const at = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : NaN);

/** Rows created at or after `since` (ms). */
export function createdSince<R extends { created_at: string | null }>(rows: readonly R[], since: number): R[] {
  return rows.filter((r) => at(r.created_at) >= since);
}

/** Games created per UTC day for the last `days` days, today last; days with none read 0. */
export function dailyCounts(rows: readonly { created_at: string | null }[], days: number, now: number): DailyPoint[] {
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of createdSince(rows, since.getTime())) {
    const key = new Date(r.created_at!).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

/** Counts by lowercased label (an empty or missing one is `fallback`), most first, then by label. */
export function countByLabel(values: readonly (string | null | undefined)[], fallback: string): CountByLabel[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = (v || fallback).toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return sortCounts(counts);
}

function sortCounts(counts: Map<string, number>): CountByLabel[] {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** Games by their turf's city (lowercased; "unknown" without a turf or a city). */
export function gamesByCity(games: readonly { turf_id: string | null }[], cityByTurf: ReadonlyMap<string, string | null>): CountByLabel[] {
  return countByLabel(games.map((g) => (g.turf_id ? cityByTurf.get(g.turf_id) : null)), "unknown");
}

/**
 * Active turfs by city from the city_turf_counts view (active turfs with a
 * city, by city as stored) and the count of active turfs without one,
 * lowercased and merged as the admin always showed them ("unknown" for none).
 */
export function turfsByCity(viewRows: readonly { city: string | null; n: number }[], withoutCity: number): CountByLabel[] {
  const counts = new Map<string, number>();
  for (const r of viewRows) {
    const k = (r.city || "unknown").toLowerCase();
    counts.set(k, (counts.get(k) ?? 0) + Number(r.n || 0));
  }
  if (withoutCity > 0) counts.set("unknown", (counts.get("unknown") ?? 0) + withoutCity);
  return sortCounts(counts);
}

/** The hosts with the most games, most first (ties by id), at most `limit`. */
export function topHostCounts(games: readonly { creator_id: string | null }[], limit: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const g of games) if (g.creator_id) counts.set(g.creator_id, (counts.get(g.creator_id) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit);
}

/** People who hosted a game or asked to join one in the last `days` days. */
export function activeUsers(games: readonly { creator_id: string | null; created_at: string | null }[], requests: readonly RequestRow[], days: number, now: number): number {
  const since = now - days * DAY;
  const ids = new Set<string>();
  for (const g of createdSince(games, since)) if (g.creator_id) ids.add(g.creator_id);
  for (const r of createdSince(requests, since)) if (r.user_id) ids.add(r.user_id);
  return ids.size;
}

/** Join requests per game: all, pending, accepted. */
export function requestsByGame(requests: readonly RequestRow[]): Map<string, { total: number; pending: number; accepted: number }> {
  const out = new Map<string, { total: number; pending: number; accepted: number }>();
  for (const r of requests) {
    const m = out.get(r.game_id) ?? { total: 0, pending: 0, accepted: 0 };
    m.total += 1;
    if (r.status === "pending") m.pending += 1;
    if (r.status === "accepted") m.accepted += 1;
    out.set(r.game_id, m);
  }
  return out;
}

/** Newest game day first, then the latest start (the order the games list always had), at most `limit`. */
export function latestGames<G extends Pick<GameRow, "date" | "start_time" | "id">>(games: readonly G[], limit: number): G[] {
  const key = (g: G) => `${g.date ?? ""} ${g.start_time ?? ""}`;
  return [...games].sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : a.id < b.id ? -1 : 1)).slice(0, limit);
}

/** Paid bookings' revenue and the booking counts the tiles show. */
export function bookingTotals(rows: readonly { total_amount: number | null; status: string | null; payment_status: string | null; created_at: string | null }[], now: number) {
  const since7 = now - 7 * DAY;
  return {
    totalBookings: rows.length,
    bookings7d: createdSince(rows, since7).length,
    paidBookings: rows.filter((b) => b.payment_status === "paid").length,
    pendingBookings: rows.filter((b) => b.status === "pending").length,
    bookingRevenue: rows.filter((b) => b.payment_status === "paid" && typeof b.total_amount === "number").reduce((sum, b) => sum + (b.total_amount || 0), 0),
  };
}

/** TapTurf's own reviews: how many and their average, to one decimal (0 with none). */
export function reviewTotals(rows: readonly { rating: number | null }[]) {
  const totalReviews = rows.length;
  const avgRating = totalReviews === 0 ? 0 : Math.round((rows.reduce((s, r) => s + (r.rating || 0), 0) / totalReviews) * 10) / 10;
  return { totalReviews, avgRating };
}

export type GameState = "upcoming" | "live" | "expired" | "cancelled";

/** "YYYY-MM-DD HH:MM" in IST, for comparing with game date + time. */
export function istMinute(now: number): string {
  return new Date(now).toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16);
}

/**
 * Stored status stays "open" after a game ends, so the real state is
 * worked out from date + time in IST (the server runs in UTC).
 */
export function gameState(g: { date: string; start_time: string; end_time: string; status: string | null }, nowIst: string): GameState {
  if (g.status && /cancel/i.test(g.status)) return "cancelled";
  const start = `${g.date} ${(g.start_time || "00:00").slice(0, 5)}`;
  let end = `${g.date} ${(g.end_time || g.start_time || "23:59").slice(0, 5)}`;
  if (end < start) end = `${g.date} 23:59`; // past-midnight games: treat as ending that day
  if (end < nowIst) return "expired";
  if (start <= nowIst) return "live";
  return "upcoming";
}

// ── People ─────────────────────────────────────────────────

/**
 * Reduces a raw phone string to a comparable form: digits only, drop
 * an Indian country code if present. Matches `normalisePhone` in
 * lib/admin/auth.ts so lookups line up.
 */
export function normPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export interface DedupedPerson {
  key: string; // stable id: email if present, else phone, else row id
  earliestSignup: string; // ISO
  rowCount: number;
}

/**
 * Group users so one real person counts once even if they signed up with
 * both a phone and a Google account: two rows are the same person if they
 * share (a) email OR (b) normalised phone. Otherwise each row is its own
 * person. Each person carries their earliest created_at (for the unique
 * sign-up windows).
 */
export function dedupeUsers(rows: readonly { id: string; email: string | null; phone: string | null; created_at: string | null }[]): DedupedPerson[] {
  // Union-find over (email) and (phone) keys.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = parent.get(k) || k;
    while (r !== parent.get(r) && parent.get(r)) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const rowKey = new Map<string, string>();
  rows.forEach((r) => {
    const emailKey = r.email ? `e:${r.email.toLowerCase().trim()}` : null;
    const phoneKey = r.phone ? `p:${normPhone(r.phone)}` : null;
    const primary = emailKey || phoneKey || `i:${r.id}`;
    parent.set(primary, primary);
    if (emailKey) parent.set(emailKey, parent.get(emailKey) || emailKey);
    if (phoneKey) parent.set(phoneKey, parent.get(phoneKey) || phoneKey);
    if (emailKey && phoneKey) union(emailKey, phoneKey);
    rowKey.set(r.id, primary);
  });

  const byRoot = new Map<string, DedupedPerson>();
  rows.forEach((r) => {
    const root = find(rowKey.get(r.id)!);
    const existing = byRoot.get(root);
    const created = r.created_at || "9999";
    if (!existing) {
      byRoot.set(root, { key: root, earliestSignup: created, rowCount: 1 });
    } else {
      existing.rowCount += 1;
      if (created < existing.earliestSignup) existing.earliestSignup = created;
    }
  });
  return Array.from(byRoot.values());
}

export type PeopleTotals = {
  /** Accounts, plus the Google sign-ups that never came back (unfinishedSignups), as the sign-ups chart counts. */
  totalUsers: number;
  /** Google sign-ins that made no account (each used to be a users row the auth trigger made). */
  unfinishedSignups: number;
  uniquePeople: number;
  duplicateUsers: number;
  signups7d: number;
  signups30d: number;
  uniqueSignups7d: number;
  uniqueSignups30d: number;
};

/** The people tiles' numbers from the accounts and the Google sign-ups that never came back (already without accounts). */
export function peopleTotals(
  accounts: readonly { id: string; email: string | null; phone: string | null; created_at: string | null }[],
  notFinished: readonly { id: string; email: string | null; phone: null; created_at: string }[],
  now: number,
): PeopleTotals {
  const iso7d = new Date(now - 7 * DAY).toISOString();
  const iso30d = new Date(now - 30 * DAY).toISOString();
  const unfinished = notFinished.filter((u) => !accounts.some((a) => a.id === u.id));
  const rows = [...accounts, ...unfinished];
  const people = dedupeUsers(rows);
  return {
    totalUsers: rows.length,
    unfinishedSignups: unfinished.length,
    uniquePeople: people.length,
    duplicateUsers: rows.length - people.length,
    // Signup windows: count both raw rows AND unique people.
    signups7d: rows.filter((r) => r.created_at && r.created_at >= iso7d).length,
    signups30d: rows.filter((r) => r.created_at && r.created_at >= iso30d).length,
    uniqueSignups7d: people.filter((p) => p.earliestSignup >= iso7d).length,
    uniqueSignups30d: people.filter((p) => p.earliestSignup >= iso30d).length,
  };
}
