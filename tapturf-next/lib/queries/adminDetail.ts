import { adminConfirmed, adminUserRows, adminUsers, signupPeople } from "@/lib/queries/adminUsers";
import { gameRows, requestRows, turfsById, type TurfBrief } from "@/lib/queries/admin";
import { anonRead } from "@/lib/admin/db";
import { createdSince, gameState, istMinute, latestGames, requestsByGame, type GameRow, type GameState } from "@/lib/admin/home";
import { isVerified, userCity, type Confirmed, type UserCity } from "@/lib/admin/people";
import { both, okSection, readAllPages, rowsOf, type Section } from "@/lib/admin/section";
import { isCity } from "@/lib/city";

/**
 * Row-level lists behind the /admin number tiles (server-only).
 * Each view takes a filter key from the URL (?f=...) so a tile can link
 * straight to "the records that make up this number". Each list is
 * settled (lib/admin/db.ts): its rows, or why it couldn't be read, which
 * the view says instead of "Nothing here".
 */

const DAY = 86_400_000;
const isoDaysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();

// ── Games ───────────────────────────────────────────────

export type { GameState } from "@/lib/admin/home";

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
  turf: TurfBrief | null;
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
 * The latest games (newest game day first), from the games and requests
 * read once per render. Stored status stays "open" after a game ends, so
 * the state is worked out from date + time in IST (lib/admin/home.ts).
 */
export async function getAdminGames(filter: GameFilter = "all", limit = 500): Promise<Section<AdminGame[]>> {
  const [games, requests] = await Promise.all([gameRows(), requestRows()]);
  const both_ = both(games, requests);
  if (!both_.ok) return both_;
  const [all, reqs] = both_.data;
  const now = Date.now();
  const windowed = filter === "week" ? createdSince(all, now - 7 * DAY) : filter === "month" ? createdSince(all, now - 30 * DAY) : all;
  const rows = latestGames(windowed, limit);
  if (rows.length === 0) return okSection([]);
  const turfs = await turfsById(rows.map((g) => g.turf_id));
  if (!turfs.ok) return turfs;
  const reqMap = requestsByGame(reqs);
  const nowIst = istMinute(now);
  const out: AdminGame[] = rows.map(({ turf_id, ...g }: GameRow) => ({
    ...g,
    turf: turf_id ? (turfs.data.get(turf_id) ?? null) : null,
    state: gameState(g, nowIst),
    requests: reqMap.get(g.id) ?? { total: 0, pending: 0, accepted: 0 },
  }));
  if (filter === "upcoming" || filter === "live" || filter === "expired" || filter === "cancelled") {
    const f = out.filter((g) => g.state === filter);
    // Upcoming reads best soonest-first.
    return okSection(filter === "upcoming" ? f.reverse() : f);
  }
  return okSection(out);
}

// ── Users ───────────────────────────────────────────────

/** "Email confirmed by Google, phone by a code", or null when nothing was. */
export function confirmedLabel(c: Confirmed): string | null {
  const parts = [c.email === "google" ? "Email confirmed by Google" : c.email === "link" ? "Email confirmed by a link" : null, c.phone ? "phone by a code at sign-in" : null].filter(Boolean) as string[];
  if (parts.length === 0) return null;
  const text = parts.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_verified: boolean | null;
  created_at: string | null;
  method: "google" | "phone" | "unknown";
  /** A sign-in confirmed their email or phone (admin_verified; the old app's flag when that can't be read). */
  verified: boolean;
  /** What was confirmed, for the badge's tooltip ("Email confirmed by Google"), or null. */
  verifiedHow: string | null;
  gamesHosted: number;
  requestsMade: number;
  duplicateOf: number; // size of this person's group if > 1
  /** Their recorded city, else the best guess from activity (lib/admin/people.ts userCity); null when neither. */
  city: UserCity | null;
}

export const USER_FILTERS = {
  all: "All users",
  new7: "Signed up in 7 days",
  new30: "Signed up in 30 days",
  active7: "Active in 7 days",
  active30: "Active in 30 days",
  // A sign-in confirmed their email or phone; not the verified tick (both proved), which the admin home's people list filters.
  verified: "Confirmed at sign-in",
  duplicates: "Duplicate accounts",
} as const;
export type UserFilter = keyof typeof USER_FILTERS;

const normPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D+/g, "");
  return d.length > 10 ? d.slice(-10) : d;
};

/** The users for a filter; citiesRead false when the cities (admin_people) couldn't be read, so every city reads null. */
export async function getAdminUsers(filter: UserFilter = "all"): Promise<Section<{ users: AdminUser[]; citiesRead: boolean }>> {
  const [users, games, reqs, confirmed, { people }] = await Promise.all([adminUsers(), gameRows(), requestRows(), adminConfirmed(), signupPeople()]);
  // The hosted and requested columns (and the active filters) need the games: without them the list would show 0s.
  if (!users.ok) return users;
  if (!games.ok) return games;
  if (!reqs.ok) return reqs;
  const rows = users.data;
  const personById = new Map((people ?? []).map((p) => [p.id, p]));

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
  for (const g of games.data) if (g.creator_id) hosted.set(g.creator_id, (hosted.get(g.creator_id) ?? 0) + 1);
  const requested = new Map<string, number>();
  for (const r of reqs.data) if (r.user_id) requested.set(r.user_id, (requested.get(r.user_id) ?? 0) + 1);

  const activeSince = (days: number) => {
    const since = Date.now() - days * DAY;
    const ids = new Set<string>();
    for (const g of createdSince(games.data, since)) if (g.creator_id) ids.add(g.creator_id);
    for (const r of createdSince(reqs.data, since)) if (r.user_id) ids.add(r.user_id);
    return ids;
  };

  let list: AdminUser[] = rows.map((u) => {
    const c = confirmed ? (confirmed.get(u.id) ?? { email: null, phone: false }) : null;
    return {
      ...u,
      method: u.email ? "google" : u.phone ? "phone" : "unknown",
      verified: isVerified(c, u.is_verified),
      verifiedHow: c ? confirmedLabel(c) : u.is_verified ? "Marked verified by the old app" : null,
      gamesHosted: hosted.get(u.id) ?? 0,
      requestsMade: requested.get(u.id) ?? 0,
      duplicateOf: groupSize.get(personKey(u)) ?? 1,
      city: userCity(personById.get(u.id)),
    };
  });

  if (filter === "new7") list = list.filter((u) => (u.created_at ?? "") >= isoDaysAgo(7));
  if (filter === "new30") list = list.filter((u) => (u.created_at ?? "") >= isoDaysAgo(30));
  if (filter === "verified") list = list.filter((u) => u.verified);
  if (filter === "duplicates") list = list.filter((u) => u.duplicateOf > 1).sort((a, b) => personKeySort(a, b));
  if (filter === "active7" || filter === "active30") {
    const ids = activeSince(filter === "active7" ? 7 : 30);
    list = list.filter((u) => ids.has(u.id));
  }
  return okSection({ users: list, citiesRead: people !== null });

  function personKeySort(a: AdminUser, b: AdminUser) {
    const ka = (a.email ?? normPhone(a.phone)).toLowerCase();
    const kb = (b.email ?? normPhone(b.phone)).toLowerCase();
    return ka.localeCompare(kb);
  }
}

// ── Join requests ───────────────────────────────────────

export const REQUEST_FILTERS = { all: "All", pending: "Pending", accepted: "Accepted", declined: "Declined" } as const;
export type RequestFilter = keyof typeof REQUEST_FILTERS;

type RequestListRow = {
  id: string;
  game_id: string;
  user_id: string | null;
  status: string;
  note: string | null;
  requester_name: string | null;
  requester_phone: string | null;
  created_at: string;
  responded_at: string | null;
};
type RequestGame = { id: string; sport: string; date: string; start_time: string; host_name: string | null; turf_id: string | null };

export async function getAdminRequests(filter: RequestFilter = "all") {
  return anonRead("join requests", async (s, signal) => {
    let q = s
      .from("game_requests")
      .select("id, game_id, user_id, status, note, requester_name, requester_phone, created_at, responded_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (filter !== "all") q = q.eq("status", filter);
    const rows = rowsOf<RequestListRow>(await q.abortSignal(signal), "game_requests");
    const gameIds = [...new Set(rows.map((r) => r.game_id))];
    const games = gameIds.length ? rowsOf<RequestGame>(await s.from("games").select("id, sport, date, start_time, host_name, turf_id").in("id", gameIds).abortSignal(signal), "games") : [];
    const turfIds = [...new Set(games.map((g) => g.turf_id).filter(Boolean))] as string[];
    const turfs = turfIds.length ? rowsOf<{ id: string; name: string }>(await s.from("turfs").select("id, name").in("id", turfIds).abortSignal(signal), "turfs") : [];
    const gameMap = new Map(games.map((g) => [g.id, g]));
    const turfMap = new Map(turfs.map((t) => [t.id, t.name]));
    return rows.map((r) => {
      const g = gameMap.get(r.game_id);
      return { ...r, game: g ? { ...g, turfName: g.turf_id ? (turfMap.get(g.turf_id) ?? null) : null } : null };
    });
  });
}

// ── Turfs ───────────────────────────────────────────────

export const TURF_FILTERS = { all: "All active", hyderabad: "Hyderabad", bangalore: "Bangalore", mumbai: "Mumbai", pune: "Pune", delhi: "Delhi", chennai: "Chennai", nashik: "Nashik", nagpur: "Nagpur", nophone: "No phone", claimed: "Claimed" } as const;
export type TurfFilter = keyof typeof TURF_FILTERS;

type TurfListRow = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  address: string | null;
  rating: number | null;
  total_reviews: number | null;
  owner_phone: string | null;
  contact_info: { phone?: string } | null;
  images: unknown;
  updated_at: string | null;
  /** An owner manages it on myTapturf (20261025_turf_claimed.sql). */
  claimed: boolean | null;
};

/** Every active turf (paged: there are more than the 1,000 one request returns), by name. */
export async function getAdminTurfs(filter: TurfFilter = "all") {
  return anonRead("turfs list", async (s, signal) => {
    const all = await readAllPages<TurfListRow>((from, to) => {
      let q = s
        .from("turfs")
        .select("id, name, slug, city, address, rating, total_reviews, owner_phone, contact_info, images, updated_at, claimed")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .order("id", { ascending: true });
      // isCity is only slug-shaped: "all", "nophone" and "claimed" pass it too, and would ask for a city of that name.
      if (filter !== "all" && filter !== "nophone" && filter !== "claimed" && isCity(filter)) q = q.eq("city", filter);
      if (filter === "claimed") q = q.eq("claimed", true);
      return q.range(from, to).abortSignal(signal);
    }, "turfs");
    let rows = all.map((t) => ({
      ...t,
      phone: t.owner_phone || (t.contact_info?.phone ?? null),
      photos: Array.isArray(t.images) ? t.images.length : 0,
    }));
    if (filter === "nophone") rows = rows.filter((t) => !t.phone);
    return rows;
  });
}

// ── Bookings, reviews, notifications ────────────────────

export const BOOKING_FILTERS = { all: "All", pending: "Pending", paid: "Paid", week: "This week" } as const;
export type BookingFilter = keyof typeof BOOKING_FILTERS;

type BookingRow = {
  id: string;
  user_id: string | null;
  turf_id: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  total_players: number | null;
  total_amount: number | null;
  status: string | null;
  payment_status: string | null;
  created_at: string | null;
};

export async function getAdminBookings(filter: BookingFilter = "all") {
  return anonRead("bookings list", async (s, signal) => {
    let q = s
      .from("bookings")
      .select("id, user_id, turf_id, date, start_time, end_time, total_players, total_amount, status, payment_status, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (filter === "pending") q = q.eq("status", "pending");
    if (filter === "paid") q = q.eq("payment_status", "paid");
    if (filter === "week") q = q.gte("created_at", isoDaysAgo(7));
    return rowsOf<BookingRow>(await q.abortSignal(signal), "bookings");
  });
}

type ReviewRow = { id: string; user_id: string | null; turf_id: string | null; rating: number; comment: string | null; source: string | null; author_name: string | null; created_at: string };

export async function getAdminReviews() {
  return anonRead("reviews list", async (s, signal) => {
    const rows = rowsOf<ReviewRow>(
      await s.from("reviews").select("id, user_id, turf_id, rating, comment, source, author_name, created_at").order("created_at", { ascending: false }).limit(500).abortSignal(signal),
      "reviews",
    );
    const turfIds = [...new Set(rows.map((r) => r.turf_id).filter(Boolean))] as string[];
    const turfs = turfIds.length ? rowsOf<{ id: string; name: string }>(await s.from("turfs").select("id, name").in("id", turfIds).abortSignal(signal), "turfs") : [];
    const turfMap = new Map(turfs.map((t) => [t.id, t.name]));
    return rows.map((r) => ({ ...r, turfName: r.turf_id ? (turfMap.get(r.turf_id) ?? null) : null }));
  });
}

export const NOTIFICATION_FILTERS = { all: "All", unread: "Unread" } as const;
export type NotificationFilter = keyof typeof NOTIFICATION_FILTERS;

type NotificationRow = { id: string; user_id: string | null; type: string; title: string; message: string; is_read: boolean; created_at: string };

export async function getAdminNotifications(filter: NotificationFilter = "all") {
  return anonRead("notifications list", async (s, signal) => {
    let q = s.from("notifications").select("id, user_id, type, title, message, is_read, created_at").order("created_at", { ascending: false }).limit(500);
    if (filter === "unread") q = q.eq("is_read", false);
    return rowsOf<NotificationRow>(await q.abortSignal(signal), "notifications");
  });
}

/** user id -> display name, for tables that only store ids ("-" for a name that can't be read). */
export async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (unique.length === 0) return new Map();
  const data = await adminUserRows(unique);
  return new Map(data.map((u) => [u.id, u.name || u.email || u.phone || "Unnamed"]));
}
