import { createReadOnlyClient } from "@/lib/supabase/server";

/**
 * Admin dashboard queries. All read-only. Every function is scoped to
 * returning aggregates + short lists suitable for a single owner-only
 * page. Nothing here should leak into a client bundle: import from a
 * server component only.
 */

const supa = () => createReadOnlyClient();

// ── Types ──

export interface AdminHeadline {
  totalUsers: number;
  signups7d: number;
  signups30d: number;
  totalGames: number;
  games7d: number;
  games30d: number;
  activeTurfs: number;
  totalRequests: number;
  totalNotifications: number;
  unreadNotifications: number;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface RecentUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  created_at: string | null;
  method: "google" | "phone" | "unknown";
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

export async function getHeadline(): Promise<AdminHeadline> {
  const s = supa();
  const now = new Date();
  const iso7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const iso30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    users,
    signups7,
    signups30,
    games,
    games7,
    games30,
    turfs,
    reqs,
    notif,
    unread,
  ] = await Promise.all([
    s.from("users").select("*", { count: "exact", head: true }),
    s.from("users").select("*", { count: "exact", head: true }).gte("created_at", iso7d),
    s.from("users").select("*", { count: "exact", head: true }).gte("created_at", iso30d),
    s.from("games").select("*", { count: "exact", head: true }),
    s.from("games").select("*", { count: "exact", head: true }).gte("created_at", iso7d),
    s.from("games").select("*", { count: "exact", head: true }).gte("created_at", iso30d),
    s.from("turfs").select("*", { count: "exact", head: true }).eq("is_active", true),
    s.from("game_requests").select("*", { count: "exact", head: true }),
    s.from("notifications").select("*", { count: "exact", head: true }),
    s.from("notifications").select("*", { count: "exact", head: true }).eq("is_read", false),
  ]);

  return {
    totalUsers: users.count ?? 0,
    signups7d: signups7.count ?? 0,
    signups30d: signups30.count ?? 0,
    totalGames: games.count ?? 0,
    games7d: games7.count ?? 0,
    games30d: games30.count ?? 0,
    activeTurfs: turfs.count ?? 0,
    totalRequests: reqs.count ?? 0,
    totalNotifications: notif.count ?? 0,
    unreadNotifications: unread.count ?? 0,
  };
}

/**
 * Signups grouped by day for the last N days. Days with no signups
 * are still returned with count 0 so the chart doesn't look sparse.
 */
export async function getDailySignups(days = 30): Promise<DailyPoint[]> {
  const s = supa();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const { data } = await s
    .from("users")
    .select("created_at")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: true });

  // Bucket by YYYY-MM-DD (UTC).
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

export async function getRecentUsers(limit = 20): Promise<RecentUser[]> {
  const s = supa();
  const { data } = await s
    .from("users")
    .select("id, name, email, phone, role, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data || []).map((u) => ({
    id: u.id,
    name: u.name ?? null,
    email: u.email ?? null,
    phone: u.phone ?? null,
    role: u.role ?? null,
    created_at: u.created_at ?? null,
    // Inferred: users with email but no phone are Google users; phone-only are phone-auth.
    method: u.email && !u.phone ? "google" : u.phone && !u.email ? "phone" : u.email && u.phone ? "google" : "unknown",
  }));
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
  const { data } = await s
    .from("turfs")
    .select("city")
    .eq("is_active", true);
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
  const { data: users } = await s
    .from("users")
    .select("id, name, email")
    .in("id", ids);

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
