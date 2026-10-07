import { createReadOnlyClient } from "@/lib/supabase/server";
import { isCity } from "@/lib/city";

/**
 * Row-level lists behind the /admin number tiles (server-only).
 * Each view takes a filter key from the URL (?f=...) so a tile can link
 * straight to "the records that make up this number".
 */

const supa = () => createReadOnlyClient();
const DAY = 86_400_000;
const isoDaysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();

/** "YYYY-MM-DD HH:MM" in IST, for comparing with game date + time. */
function nowIST(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).slice(0, 16);
}

// ── Games ───────────────────────────────────────────────

export type GameState = "upcoming" | "live" | "expired" | "cancelled";

export interface AdminGame {
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
  turf: { id: string; name: string; city: string | null } | null;
  state: GameState;
  requests: { total: number; pending: number; accepted: number };
}

export const GAME_FILTERS = {
  all: "All games",
  upcoming: "Upcoming",
  live: "Live now",
  expired: "Expired",
  cancelled: "Cancelled",
  week: "Hosted this week",
  month: "Hosted in 30 days",
} as const;
export type GameFilter = keyof typeof GAME_FILTERS;

/**
 * Stored status stays "open" after a game ends, so the real state is
 * worked out from date + time in IST (the server runs in UTC).
 */
function gameState(g: { date: string; start_time: string; end_time: string; status: string | null }): GameState {
  if (g.status && /cancel/i.test(g.status)) return "cancelled";
  const now = nowIST();
  const start = `${g.date} ${(g.start_time || "00:00").slice(0, 5)}`;
  let end = `${g.date} ${(g.end_time || g.start_time || "23:59").slice(0, 5)}`;
  if (end < start) end = `${g.date} 23:59`; // past-midnight games: treat as ending that day
  if (end < now) return "expired";
  if (start <= now) return "live";
  return "upcoming";
}

export async function getAdminGames(filter: GameFilter = "all", limit = 500): Promise<AdminGame[]> {
  const s = supa();
  let q = s
    .from("games")
    .select("id, title, sport, date, start_time, end_time, max_players, current_players, price_per_player, status, host_name, host_phone, creator_id, created_at, turf_id")
    .order("date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(limit);
  if (filter === "week") q = q.gte("created_at", isoDaysAgo(7));
  if (filter === "month") q = q.gte("created_at", isoDaysAgo(30));
  const { data: games } = await q;
  const rows = games ?? [];
  if (rows.length === 0) return [];

  const turfIds = [...new Set(rows.map((g) => g.turf_id).filter(Boolean))] as string[];
  const gameIds = rows.map((g) => g.id);
  const [{ data: turfs }, { data: reqs }] = await Promise.all([
    turfIds.length
      ? s.from("turfs").select("id, name, city").in("id", turfIds)
      : Promise.resolve({ data: [] as { id: string; name: string; city: string | null }[] }),
    s.from("game_requests").select("game_id, status").in("game_id", gameIds),
  ]);
  const turfMap = new Map((turfs ?? []).map((t) => [t.id, t]));
  const reqMap = new Map<string, { total: number; pending: number; accepted: number }>();
  for (const r of reqs ?? []) {
    const m = reqMap.get(r.game_id) ?? { total: 0, pending: 0, accepted: 0 };
    m.total += 1;
    if (r.status === "pending") m.pending += 1;
    if (r.status === "accepted") m.accepted += 1;
    reqMap.set(r.game_id, m);
  }

  const out: AdminGame[] = rows.map((g) => ({
    ...g,
    turf: g.turf_id ? turfMap.get(g.turf_id) ?? null : null,
    state: gameState(g),
    requests: reqMap.get(g.id) ?? { total: 0, pending: 0, accepted: 0 },
  }));
  if (filter === "upcoming" || filter === "live" || filter === "expired" || filter === "cancelled") {
    const f = out.filter((g) => g.state === filter);
    // Upcoming reads best soonest-first.
    return filter === "upcoming" ? f.reverse() : f;
  }
  return out;
}

// ── Users ───────────────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_verified: boolean | null;
  created_at: string | null;
  method: "google" | "phone" | "unknown";
  gamesHosted: number;
  requestsMade: number;
  duplicateOf: number; // size of this person's group if > 1
}

export const USER_FILTERS = {
  all: "All users",
  new7: "Signed up in 7 days",
  new30: "Signed up in 30 days",
  active7: "Active in 7 days",
  active30: "Active in 30 days",
  verified: "Verified",
  duplicates: "Duplicate accounts",
} as const;
export type UserFilter = keyof typeof USER_FILTERS;

const normPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D+/g, "");
  return d.length > 10 ? d.slice(-10) : d;
};

export async function getAdminUsers(filter: UserFilter = "all"): Promise<AdminUser[]> {
  const s = supa();
  const [{ data: users }, { data: games }, { data: reqs }] = await Promise.all([
    s.from("users").select("id, name, email, phone, is_verified, created_at").order("created_at", { ascending: false }),
    s.from("games").select("creator_id, created_at"),
    s.from("game_requests").select("user_id, created_at"),
  ]);
  const rows = users ?? [];

  // Same person = same email or same phone (matches the headline count).
  const groupSize = new Map<string, number>();
  const keyOf = (u: { email: string | null; phone: string | null; id: string }) =>
    u.email ? `e:${u.email.toLowerCase().trim()}` : u.phone ? `p:${normPhone(u.phone)}` : `i:${u.id}`;
  const phoneToEmail = new Map<string, string>();
  for (const u of rows) if (u.email && u.phone) phoneToEmail.set(normPhone(u.phone), `e:${u.email.toLowerCase().trim()}`);
  const personKey = (u: (typeof rows)[number]) =>
    !u.email && u.phone && phoneToEmail.has(normPhone(u.phone)) ? phoneToEmail.get(normPhone(u.phone))! : keyOf(u);
  for (const u of rows) groupSize.set(personKey(u), (groupSize.get(personKey(u)) ?? 0) + 1);

  const hosted = new Map<string, number>();
  for (const g of games ?? []) if (g.creator_id) hosted.set(g.creator_id, (hosted.get(g.creator_id) ?? 0) + 1);
  const requested = new Map<string, number>();
  for (const r of reqs ?? []) if (r.user_id) requested.set(r.user_id, (requested.get(r.user_id) ?? 0) + 1);

  const activeSince = (days: number) => {
    const since = isoDaysAgo(days);
    const ids = new Set<string>();
    for (const g of games ?? []) if (g.creator_id && g.created_at >= since) ids.add(g.creator_id);
    for (const r of reqs ?? []) if (r.user_id && r.created_at >= since) ids.add(r.user_id);
    return ids;
  };

  let list: AdminUser[] = rows.map((u) => ({
    ...u,
    method: u.email ? "google" : u.phone ? "phone" : "unknown",
    gamesHosted: hosted.get(u.id) ?? 0,
    requestsMade: requested.get(u.id) ?? 0,
    duplicateOf: groupSize.get(personKey(u)) ?? 1,
  }));

  if (filter === "new7") list = list.filter((u) => (u.created_at ?? "") >= isoDaysAgo(7));
  if (filter === "new30") list = list.filter((u) => (u.created_at ?? "") >= isoDaysAgo(30));
  if (filter === "verified") list = list.filter((u) => u.is_verified);
  if (filter === "duplicates") list = list.filter((u) => u.duplicateOf > 1).sort((a, b) => personKeySort(a, b));
  if (filter === "active7" || filter === "active30") {
    const ids = activeSince(filter === "active7" ? 7 : 30);
    list = list.filter((u) => ids.has(u.id));
  }
  return list;

  function personKeySort(a: AdminUser, b: AdminUser) {
    const ka = (a.email ?? normPhone(a.phone)).toLowerCase();
    const kb = (b.email ?? normPhone(b.phone)).toLowerCase();
    return ka.localeCompare(kb);
  }
}

// ── Join requests ───────────────────────────────────────

export const REQUEST_FILTERS = { all: "All", pending: "Pending", accepted: "Accepted", declined: "Declined" } as const;
export type RequestFilter = keyof typeof REQUEST_FILTERS;

export async function getAdminRequests(filter: RequestFilter = "all") {
  const s = supa();
  let q = s
    .from("game_requests")
    .select("id, game_id, user_id, status, note, requester_name, requester_phone, created_at, responded_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter !== "all") q = q.eq("status", filter);
  const { data } = await q;
  const rows = data ?? [];
  const gameIds = [...new Set(rows.map((r) => r.game_id))];
  const { data: games } = gameIds.length
    ? await s.from("games").select("id, sport, date, start_time, host_name, turf_id").in("id", gameIds)
    : { data: [] as { id: string; sport: string; date: string; start_time: string; host_name: string | null; turf_id: string | null }[] };
  const turfIds = [...new Set((games ?? []).map((g) => g.turf_id).filter(Boolean))] as string[];
  const { data: turfs } = turfIds.length
    ? await s.from("turfs").select("id, name").in("id", turfIds)
    : { data: [] as { id: string; name: string }[] };
  const gameMap = new Map((games ?? []).map((g) => [g.id, g]));
  const turfMap = new Map((turfs ?? []).map((t) => [t.id, t.name]));
  return rows.map((r) => {
    const g = gameMap.get(r.game_id);
    return { ...r, game: g ? { ...g, turfName: g.turf_id ? turfMap.get(g.turf_id) ?? null : null } : null };
  });
}

// ── Turfs ───────────────────────────────────────────────

export const TURF_FILTERS = { all: "All active", nashik: "Nashik", pune: "Pune", mumbai: "Mumbai", nagpur: "Nagpur", nophone: "No phone" } as const;
export type TurfFilter = keyof typeof TURF_FILTERS;

export async function getAdminTurfs(filter: TurfFilter = "all") {
  let q = supa()
    .from("turfs")
    .select("id, name, city, address, rating, total_reviews, owner_phone, contact_info, images, updated_at")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (isCity(filter)) q = q.eq("city", filter);
  const { data } = await q;
  let rows = (data ?? []).map((t) => ({
    ...t,
    phone: (t.owner_phone as string | null) || ((t.contact_info as { phone?: string } | null)?.phone ?? null),
    photos: Array.isArray(t.images) ? t.images.length : 0,
  }));
  if (filter === "nophone") rows = rows.filter((t) => !t.phone);
  return rows;
}

// ── Bookings, reviews, notifications ────────────────────

export const BOOKING_FILTERS = { all: "All", pending: "Pending", paid: "Paid", week: "This week" } as const;
export type BookingFilter = keyof typeof BOOKING_FILTERS;

export async function getAdminBookings(filter: BookingFilter = "all") {
  let q = supa()
    .from("bookings")
    .select("id, user_id, turf_id, date, start_time, end_time, total_players, total_amount, status, payment_status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter === "pending") q = q.eq("status", "pending");
  if (filter === "paid") q = q.eq("payment_status", "paid");
  if (filter === "week") q = q.gte("created_at", isoDaysAgo(7));
  const { data } = await q;
  return data ?? [];
}

export async function getAdminReviews() {
  const s = supa();
  const { data } = await s
    .from("reviews")
    .select("id, user_id, turf_id, rating, comment, source, author_name, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = data ?? [];
  const turfIds = [...new Set(rows.map((r) => r.turf_id).filter(Boolean))] as string[];
  const { data: turfs } = turfIds.length
    ? await s.from("turfs").select("id, name").in("id", turfIds)
    : { data: [] as { id: string; name: string }[] };
  const turfMap = new Map((turfs ?? []).map((t) => [t.id, t.name]));
  return rows.map((r) => ({ ...r, turfName: r.turf_id ? turfMap.get(r.turf_id) ?? null : null }));
}

export const NOTIFICATION_FILTERS = { all: "All", unread: "Unread" } as const;
export type NotificationFilter = keyof typeof NOTIFICATION_FILTERS;

export async function getAdminNotifications(filter: NotificationFilter = "all") {
  let q = supa()
    .from("notifications")
    .select("id, user_id, type, title, message, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (filter === "unread") q = q.eq("is_read", false);
  const { data } = await q;
  return data ?? [];
}

/** user id -> display name, for tables that only store ids. */
export async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (unique.length === 0) return new Map();
  const { data } = await supa().from("users").select("id, name, email, phone").in("id", unique);
  return new Map((data ?? []).map((u) => [u.id, u.name || u.email || u.phone || "Unnamed"]));
}
