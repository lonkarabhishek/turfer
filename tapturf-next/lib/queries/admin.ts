import { fetchAllRows } from "@/lib/queries/turfs";
import { createReadOnlyClient } from "@/lib/supabase/server";
import { adminConfirmed, adminUserRows } from "@/lib/queries/adminUsers";
import { isVerified } from "@/lib/admin/people";
import { notFinishedSignupRows } from "@/lib/admin/links";
import { googleUnfinishedRows } from "@/lib/queries/adminLinks";

/**
 * Admin dashboard queries. All read-only. Every function is scoped to
 * returning aggregates + short lists suitable for a single owner-only
 * page. Nothing here should leak into a client bundle: import from a
 * server component only.
 */

const supa = () => createReadOnlyClient();

// ── Types ──

export interface AdminHeadline {
  /** Accounts, plus the Google sign-ups that never came back (unfinishedSignups), as the sign-ups chart counts. */
  totalUsers: number;
  /** Google sign-ins that made no account (each used to be a users row the auth trigger made). */
  unfinishedSignups: number;
  uniquePeople: number;
  duplicateUsers: number;
  verifiedUsers: number;
  signups7d: number;
  signups30d: number;
  uniqueSignups7d: number;
  uniqueSignups30d: number;
  totalGames: number;
  games7d: number;
  games30d: number;
  activeTurfs: number;
  totalRequests: number;
  totalNotifications: number;
  unreadNotifications: number;
  // Bookings + monetisation (new tables from the recent DB update)
  totalBookings: number;
  bookings7d: number;
  paidBookings: number;
  pendingBookings: number;
  bookingRevenue: number;   // sum of total_amount across paid bookings
  totalReviews: number;      // live TapTurf reports (not the imported Google rows)
  avgRating: number;         // over those, 0..5
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface CountByLabel {
  label: string;
  count: number;
}

export interface TopHost {
  id: string;
  name: string | null;
  email: string | null;
  games: number;
}

// ── Queries ──

/**
 * Reduces a raw phone string to a comparable form: digits only, drop
 * an Indian country code if present. Matches `normalisePhone` in
 * lib/admin/auth.ts so lookups line up.
 */
function normPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Group users so one real person counts once even if they signed up with
 * both a phone and a Google account. Returns the count of unique people
 * and, in-place, the earliest created_at per person (used for daily
 * unique-signup charts).
 *
 * The rule: two rows are the same person if they share (a) email OR
 * (b) normalised phone. Otherwise each row is its own person.
 */
export interface Person {
  key: string; // stable id: email if present, else phone, else row id
  earliestSignup: string; // ISO
  rowCount: number;
}
function dedupeUsers(
  rows: { id: string; email: string | null; phone: string | null; created_at: string | null }[]
): Person[] {
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

  const byRoot = new Map<string, Person>();
  rows.forEach((r) => {
    const primary = rowKey.get(r.id)!;
    const root = find(primary);
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

export async function getHeadline(): Promise<AdminHeadline> {
  const s = supa();
  const now = new Date();
  const iso7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const iso30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    unfinished,
    allUsers,
    games,
    games7,
    games30,
    turfs,
    reqs,
    notif,
    unread,
    verified,
    bookingRows,
    reviewRows,
  ] = await Promise.all([
    // Google sign-ins that never came back (no account since 20261026_account_links.sql): counted
    // as the sign-ups chart counts them, since each used to be a users row ([] before that migration).
    googleUnfinishedRows(),
    // Full user set so we can dedupe in memory. Only ~50 rows today, and
    // even at 10k this is fine for an owner-only page.
    adminUserRows().then((data) => ({ data })),
    s.from("games").select("*", { count: "exact", head: true }),
    s.from("games").select("*", { count: "exact", head: true }).gte("created_at", iso7d),
    s.from("games").select("*", { count: "exact", head: true }).gte("created_at", iso30d),
    s.from("turfs").select("*", { count: "exact", head: true }).eq("is_active", true),
    s.from("game_requests").select("*", { count: "exact", head: true }),
    s.from("notifications").select("*", { count: "exact", head: true }),
    s.from("notifications").select("*", { count: "exact", head: true }).eq("is_read", false),
    // What sign-ins confirmed (Google's email, a checked phone code), not the old app's flag.
    adminConfirmed(),
    // Full bookings set — table has just been added, so row count is
    // tiny. Fetching amounts inline lets us compute revenue without a
    // second round-trip. Cheap for now, revisit at >5k rows.
    s.from("bookings").select("total_amount, status, payment_status, created_at"),
    // TapTurf's own reports only: the 80 imported Google reviews are counted on the turfs.
    s.from("reviews").select("rating").is("source", null),
  ]);

  const accounts = allUsers.data || [];
  const unfinishedSignups = notFinishedSignupRows(unfinished).filter((u) => !accounts.some((a) => a.id === u.id));
  const rows = [...accounts, ...unfinishedSignups];
  const totalUsers = rows.length;
  const people = dedupeUsers(rows);
  const uniquePeople = people.length;
  const duplicateUsers = totalUsers - uniquePeople;

  // Signup windows: count both raw rows AND unique people.
  const signups7d = rows.filter((r) => r.created_at && r.created_at >= iso7d).length;
  const signups30d = rows.filter((r) => r.created_at && r.created_at >= iso30d).length;
  const uniqueSignups7d = people.filter((p) => p.earliestSignup >= iso7d).length;
  const uniqueSignups30d = people.filter((p) => p.earliestSignup >= iso30d).length;

  const bookings = (bookingRows.data || []) as {
    total_amount: number | null;
    status: string | null;
    payment_status: string | null;
    created_at: string | null;
  }[];
  const totalBookings = bookings.length;
  const bookings7d = bookings.filter((b) => b.created_at && b.created_at >= iso7d).length;
  const paidBookings = bookings.filter((b) => b.payment_status === "paid").length;
  const pendingBookings = bookings.filter((b) => b.status === "pending").length;
  const bookingRevenue = bookings
    .filter((b) => b.payment_status === "paid" && typeof b.total_amount === "number")
    .reduce((sum, b) => sum + (b.total_amount || 0), 0);

  const reviews = (reviewRows.data || []) as { rating: number | null }[];
  const totalReviews = reviews.length;
  const avgRating =
    totalReviews === 0
      ? 0
      : Math.round(
          (reviews.reduce((s, r) => s + (r.rating || 0), 0) / totalReviews) * 10,
        ) / 10;

  return {
    totalUsers,
    uniquePeople,
    duplicateUsers,
    unfinishedSignups: unfinishedSignups.length,
    verifiedUsers: accounts.filter((r) => isVerified(verified ? (verified.get(r.id) ?? { email: null, phone: false }) : null, r.is_verified)).length,
    signups7d,
    signups30d,
    uniqueSignups7d,
    uniqueSignups30d,
    totalGames: games.count ?? 0,
    games7d: games7.count ?? 0,
    games30d: games30.count ?? 0,
    activeTurfs: turfs.count ?? 0,
    totalRequests: reqs.count ?? 0,
    totalNotifications: notif.count ?? 0,
    unreadNotifications: unread.count ?? 0,
    totalBookings,
    bookings7d,
    paidBookings,
    pendingBookings,
    bookingRevenue,
    totalReviews,
    avgRating,
  };
}

/**
 * Games created per day for the last N days.
 */
export async function getDailyGames(days = 30): Promise<DailyPoint[]> {
  const s = supa();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const { data } = await s
    .from("games")
    .select("created_at")
    .gte("created_at", since.toISOString());

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  (data || []).forEach((row) => {
    if (!row.created_at) return;
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  });

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

export async function getGamesByCity(): Promise<CountByLabel[]> {
  const s = supa();
  const { data } = await s
    .from("games")
    .select("turf_id");

  // Games don't carry city directly; join through turfs.
  const turfIds = Array.from(new Set((data || []).map((g) => g.turf_id).filter(Boolean)));
  if (turfIds.length === 0) return [];

  const { data: turfs } = await s
    .from("turfs")
    .select("id, city")
    .in("id", turfIds);

  const cityByTurf = new Map<string, string>();
  (turfs || []).forEach((t) => {
    cityByTurf.set(t.id, (t.city || "unknown").toLowerCase());
  });

  const counts = new Map<string, number>();
  (data || []).forEach((g) => {
    const c = cityByTurf.get(g.turf_id) || "unknown";
    counts.set(c, (counts.get(c) || 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getGamesBySport(): Promise<CountByLabel[]> {
  const s = supa();
  const { data } = await s.from("games").select("sport");
  const counts = new Map<string, number>();
  (data || []).forEach((g) => {
    const k = (g.sport || "other").toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getGamesByStatus(): Promise<CountByLabel[]> {
  const s = supa();
  const { data } = await s.from("games").select("status");
  const counts = new Map<string, number>();
  (data || []).forEach((g) => {
    const k = (g.status || "unknown").toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getTurfsByCity(): Promise<CountByLabel[]> {
  const s = supa();
  const data = await fetchAllRows<{ city: string | null }>((from, to) => s.from("turfs").select("city").eq("is_active", true).order("id").range(from, to));
  const counts = new Map<string, number>();
  (data || []).forEach((t) => {
    const k = (t.city || "unknown").toLowerCase();
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getTopHosts(limit = 10): Promise<TopHost[]> {
  const s = supa();
  const { data } = await s
    .from("games")
    .select("creator_id");

  const counts = new Map<string, number>();
  (data || []).forEach((g) => {
    if (!g.creator_id) return;
    counts.set(g.creator_id, (counts.get(g.creator_id) || 0) + 1);
  });

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (sorted.length === 0) return [];

  const ids = sorted.map(([id]) => id);
  const users = await adminUserRows(ids);

  const byId = new Map<string, { name: string | null; email: string | null }>();
  (users || []).forEach((u) => byId.set(u.id, { name: u.name ?? null, email: u.email ?? null }));

  return sorted.map(([id, games]) => ({
    id,
    games,
    name: byId.get(id)?.name ?? null,
    email: byId.get(id)?.email ?? null,
  }));
}

/**
 * Active users = distinct users who created a game OR made a request
 * in the last N days. Best proxy we have without a session events table.
 */
export async function getActiveUsers(days = 7): Promise<number> {
  const s = supa();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: g }, { data: r }] = await Promise.all([
    s.from("games").select("creator_id").gte("created_at", since),
    s.from("game_requests").select("user_id").gte("created_at", since),
  ]);

  const set = new Set<string>();
  (g || []).forEach((row) => row.creator_id && set.add(row.creator_id));
  (r || []).forEach((row) => row.user_id && set.add(row.user_id));
  return set.size;
}

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
export async function getContactClickStats(days = 30): Promise<ContactClickStats | null> {
  try {
    const { data, error } = await supa().rpc("get_contact_click_stats", { p_days: days });
    if (error || !data) return null;
    return data as ContactClickStats;
  } catch {
    return null;
  }
}
