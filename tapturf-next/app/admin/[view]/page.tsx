import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { isAdmin } from "@/lib/admin/auth";
import { AdminGate } from "@/components/admin/AdminGate";
import { labelFor, isCity } from "@/lib/city";
import {
  BOOKING_FILTERS,
  GAME_FILTERS,
  NOTIFICATION_FILTERS,
  REQUEST_FILTERS,
  TURF_FILTERS,
  USER_FILTERS,
  getAdminBookings,
  getAdminGames,
  getAdminNotifications,
  getAdminRequests,
  getAdminReviews,
  getAdminTurfs,
  getAdminUsers,
  userNames,
  type AdminGame,
  type BookingFilter,
  type GameFilter,
  type NotificationFilter,
  type RequestFilter,
  type TurfFilter,
  type UserFilter,
} from "@/lib/queries/adminDetail";
import { LOGIN_FILTERS, filterLogins, getRecentLogins, type LoginFilter } from "@/lib/queries/adminLogins";
import { signupPeople } from "@/lib/queries/adminUsers";
import { googleUnfinishedRows } from "@/lib/queries/adminLinks";
import { UNFINISHED_LABEL, unfinishedList } from "@/lib/admin/links";
import { getPendingSuggestions } from "@/lib/queries/adminSuggestions";
import { ASK_FILTERS, askStats, askVia, filterAsks, getAskDigest, getAskTranscripts, threadAsks, type AskFilter } from "@/lib/queries/adminAsks";
import { AskDigestCard } from "@/components/admin/AskDigest";
import { getFlaggedListings } from "@/lib/queries/adminListing";
import { isAskConfigured } from "@/lib/ai/ask";
import { SuggestionQueue } from "@/components/admin/SuggestionQueue";
import { turfPath } from "@/lib/utils/turfPath";
import { LIVE_FILTERS, getAdminLiveLinks, type LiveFilter } from "@/lib/queries/adminTools";
import { SectionError } from "@/components/admin/SectionStatus";
import type { Reason } from "@/lib/admin/section";

export const revalidate = 0;
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const VIEWS = {
  games: { title: "Games", filters: GAME_FILTERS },
  users: { title: "Users", filters: USER_FILTERS },
  logins: { title: "Latest logins", filters: LOGIN_FILTERS },
  requests: { title: "Join requests", filters: REQUEST_FILTERS },
  turfs: { title: "Turfs", filters: TURF_FILTERS },
  bookings: { title: "Bookings", filters: BOOKING_FILTERS },
  reviews: { title: "Reviews", filters: { all: "All" } },
  notifications: { title: "Notifications", filters: NOTIFICATION_FILTERS },
  suggestions: { title: "Player suggestions", filters: { all: "Pending" } },
  listing: { title: "Listing checks", filters: { all: "Flagged" } },
  asks: { title: "Ask TapTurf chats", filters: ASK_FILTERS },
  live: { title: "Live scoreboard links", filters: LIVE_FILTERS },
} as const;
type View = keyof typeof VIEWS;

// ── formatting ──
const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      })
    : "-";
const fmtGameDate = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const hm = (t: string | null | undefined) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
};

const STATE_STYLE: Record<AdminGame["state"], string> = {
  upcoming: "bg-accent-50 text-accent-700",
  live: "bg-amber-100 text-amber-800",
  expired: "bg-primary-100 text-primary-500",
  cancelled: "bg-hot-500/10 text-hot-600",
};

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}>{children}</span>;
}

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty: boolean }) {
  return (
    <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
      {empty ? (
        <p className="px-5 py-10 text-center text-sm text-primary-400">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary-50 text-[11px] text-primary-500 font-semibold">
              <tr>
                {head.map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-100">{children}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function AdminDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<{ f?: string }>;
}) {
  if (!(await isAdmin())) return <AdminGate />;
  const { view } = await params;
  if (!(view in VIEWS)) notFound();
  const v = view as View;
  const { f } = await searchParams;
  const filters = VIEWS[v].filters as Record<string, string>;
  const filter = f && f in filters ? f : "all";

  const body = await renderView(v, filter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-900 mb-4">
        <ChevronLeft className="w-4 h-4" /> Admin
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <h1 className="font-display text-3xl md:text-4xl text-primary-900">
          {VIEWS[v].title}
          <span className="ml-3 text-primary-400 text-2xl tabular-nums">{body.count ?? ""}</span>
        </h1>
      </div>
      {Object.keys(filters).length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5 -mx-4 px-4 sm:mx-0 sm:px-0">
          {Object.entries(filters).map(([key, label]) => (
            <Link
              key={key}
              href={key === "all" ? `/admin/${v}` : `/admin/${v}?f=${key}`}
              className={`shrink-0 h-9 px-4 inline-flex items-center rounded-full text-[14px] font-medium ${
                key === filter ? "bg-primary-900 text-white" : "bg-primary-100 text-primary-900 hover:bg-primary-200"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
      {body.node}
    </div>
  );
}

const LIVE_STYLE: Record<string, string> = {
  live: "bg-amber-100 text-amber-800",
  done: "bg-accent-50 text-accent-700",
  stopped: "bg-primary-100 text-primary-500",
  expired: "bg-primary-100 text-primary-500",
};
const sportName = (s: string | null) => (s ? s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : null);

/** A view whose rows couldn't be read: why, and a retry (never "Nothing here"). */
const failedView = (reason: Reason, what: string) => ({ count: null, node: <SectionError reason={reason} what={what} /> });

async function renderView(v: View, filter: string): Promise<{ count: number | null; node: React.ReactNode }> {
  switch (v) {
    case "live": {
      const res = await getAdminLiveLinks(filter as LiveFilter);
      if (!res.ok) return failedView(res.reason, "the links");
      const links = res.data;
      return {
        count: links.length,
        node: (
          <Table head={["Link", "Sport", "Match", "Title and venue", "Status", "Updates", "Started", "Last update"]} empty={links.length === 0}>
            {links.map((l) => (
              <tr key={l.code}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <a href={`/live/${l.code}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-mono text-[12px] text-accent-700 hover:underline">
                    /live/{l.code} <ExternalLink className="w-3 h-3" />
                  </a>
                </td>
                <td className="px-4 py-3 text-primary-700 whitespace-nowrap">{sportName(l.sport) ?? <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3 text-primary-900">
                  {l.team_a || l.team_b ? `${l.team_a || "?"} vs ${l.team_b || "?"}` : <span className="text-primary-400">{l.status === "stopped" || l.status === "expired" ? "Cleared when it ended" : "-"}</span>}
                </td>
                <td className="px-4 py-3 text-primary-600">{[l.title, l.venue].filter(Boolean).join(" · ") || <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3"><Badge className={LIVE_STYLE[l.status] ?? "bg-primary-100 text-primary-500"}>{l.status}</Badge></td>
                <td className="px-4 py-3 tabular-nums" title={l.events ? `${l.events} events in the match` : undefined}>{l.writes}</td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(l.updated_at)}</td>
              </tr>
            ))}
          </Table>
        ),
      };
    }

    case "games": {
      const res = await getAdminGames(filter as GameFilter);
      if (!res.ok) return failedView(res.reason, "the games");
      const games = res.data;
      const counts = games.reduce<Record<string, number>>((m, g) => ((m[g.state] = (m[g.state] ?? 0) + 1), m), {});
      return {
        count: games.length,
        node: (
          <>
            <p className="text-sm text-primary-500 mb-3">
              {(["upcoming", "live", "expired", "cancelled"] as const)
                .filter((s) => counts[s])
                .map((s) => `${counts[s]} ${s}`)
                .join(" · ") || "No games"}
              <span className="text-primary-400"> (status worked out from date and time in IST)</span>
            </p>
            <Table head={["When", "Sport", "Turf", "Host", "Players", "₹/player", "Requests", "Status", "Hosted on", ""]} empty={games.length === 0}>
              {games.map((g) => (
                <tr key={g.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-primary-900">{fmtGameDate(g.date)}</div>
                    <div className="text-primary-500">{hm(g.start_time)} to {hm(g.end_time)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-primary-900">{g.sport}</div>
                    {g.title && <div className="text-primary-400 text-[12px] max-w-[160px] truncate">{g.title}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {g.turf ? (
                      <Link href={turfPath(g.turf)} className="text-primary-900 hover:text-accent-600">
                        {g.turf.name}
                      </Link>
                    ) : (
                      <span className="text-primary-400">-</span>
                    )}
                    {g.turf?.city && isCity(g.turf.city) && <div className="text-primary-400 text-[12px]">{labelFor(g.turf.city)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-primary-900">{g.host_name || "-"}</div>
                    {g.host_phone && (
                      <a href={`tel:${g.host_phone}`} className="text-[12px] text-accent-600">{g.host_phone}</a>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    {g.current_players}/{g.max_players}
                    {g.current_players >= g.max_players && <Badge className="ml-1.5 bg-primary-900 text-white">Full</Badge>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{g.price_per_player ? `₹${g.price_per_player}` : "Free"}</td>
                  <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                    {g.requests.total}
                    {g.requests.pending > 0 && <span className="text-amber-700"> · {g.requests.pending} pending</span>}
                  </td>
                  <td className="px-4 py-3"><Badge className={STATE_STYLE[g.state]}>{g.state}</Badge></td>
                  <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(g.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/game/${g.id}`} className="text-primary-400 hover:text-accent-600" aria-label="Open game">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        ),
      };
    }

    case "logins": {
      const res = await getRecentLogins(1000);
      if (!res.ok) {
        if (res.reason === "not_set_up") return { count: null, node: <p className="text-primary-500 py-10 text-center">The login log isn&apos;t set up in the database yet.</p> };
        return failedView(res.reason, "the logins");
      }
      const rows = filterLogins(res.rows, filter as LoginFilter);
      const people = new Set(rows.map((r) => r.user_id)).size;
      return {
        count: rows.length,
        node: (
          <>
            <p className="text-sm text-primary-500 mb-3">
              {people} {people === 1 ? "person" : "people"}
              <span className="text-primary-400">
                {" "}(one entry per person per 10 minutes; phone sign-ins are logged from 6 Oct 2026, Google ones include each account&apos;s last sign-in from before that)
              </span>
            </p>
            <UnfinishedGoogle />
            <Table head={["When", "Name", "Phone", "Email", "Via"]} empty={rows.length === 0}>
              {rows.map((r, i) => (
                <tr key={`${r.user_id}-${r.logged_in_at}-${i}`}>
                  <td className="px-4 py-3 text-primary-900 whitespace-nowrap">{fmtDateTime(r.logged_in_at)}</td>
                  <td className="px-4 py-3 text-primary-900">{r.name || <span className="text-primary-400">-</span>}</td>
                  <td className="px-4 py-3 text-primary-700 whitespace-nowrap">
                    {r.phone ? <a href={`tel:${r.phone}`} className="hover:text-accent-600">{r.phone}</a> : <span className="text-primary-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-primary-700">{r.email || <span className="text-primary-400">-</span>}</td>
                  <td className="px-4 py-3">
                    <Badge className={r.method === "google" ? "bg-blue-50 text-blue-700" : "bg-accent-50 text-accent-700"}>
                      {r.method === "google" ? "Google" : "Phone"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        ),
      };
    }

    case "users": {
      const res = await getAdminUsers(filter as UserFilter);
      if (!res.ok) return failedView(res.reason, "the users");
      const users = res.data;
      return {
        count: users.length,
        node: (
          <Table head={["Name", "Email", "Phone", "Sign-in", "Hosted", "Requests", "Joined", ""]} empty={users.length === 0}>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 text-primary-900">
                  {u.name || <span className="text-primary-400">-</span>}
                  {u.duplicateOf > 1 && <Badge className="ml-1.5 bg-amber-100 text-amber-800">{u.duplicateOf} accounts</Badge>}
                </td>
                <td className="px-4 py-3 text-primary-700">{u.email || <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3 text-primary-700 whitespace-nowrap">{u.phone || <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3"><Badge className="bg-primary-100 text-primary-700">{u.method}</Badge></td>
                <td className="px-4 py-3 tabular-nums">{u.gamesHosted}</td>
                <td className="px-4 py-3 tabular-nums">{u.requestsMade}</td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(u.created_at)}</td>
                <td className="px-4 py-3">
                  {u.verified && (
                    <span title={u.verifiedHow ?? undefined}>
                      <Badge className="bg-accent-50 text-accent-700">confirmed</Badge>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ),
      };
    }

    case "requests": {
      const res = await getAdminRequests(filter as RequestFilter);
      if (!res.ok) return failedView(res.reason, "the join requests");
      const reqs = res.data;
      const style: Record<string, string> = {
        pending: "bg-amber-100 text-amber-800",
        accepted: "bg-accent-50 text-accent-700",
        declined: "bg-primary-100 text-primary-500",
      };
      return {
        count: reqs.length,
        node: (
          <Table head={["Requester", "Game", "Status", "Note", "Sent", ""]} empty={reqs.length === 0}>
            {reqs.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3">
                  <div className="text-primary-900">{r.requester_name || "-"}</div>
                  {r.requester_phone && <a href={`tel:${r.requester_phone}`} className="text-[12px] text-accent-600">{r.requester_phone}</a>}
                </td>
                <td className="px-4 py-3">
                  {r.game ? (
                    <>
                      <div className="text-primary-900">{r.game.sport}{r.game.turfName ? ` at ${r.game.turfName}` : ""}</div>
                      <div className="text-[12px] text-primary-500">{fmtGameDate(r.game.date)}, {hm(r.game.start_time)} · host {r.game.host_name || "-"}</div>
                    </>
                  ) : (
                    <span className="text-primary-400">Game deleted</span>
                  )}
                </td>
                <td className="px-4 py-3"><Badge className={style[r.status] ?? "bg-primary-100 text-primary-600"}>{r.status}</Badge></td>
                <td className="px-4 py-3 text-primary-600 max-w-[260px]">{r.note || <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                <td className="px-4 py-3">
                  {r.game && (
                    <Link href={`/game/${r.game_id}`} className="text-primary-400 hover:text-accent-600" aria-label="Open game">
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ),
      };
    }

    case "turfs": {
      const res = await getAdminTurfs(filter as TurfFilter);
      if (!res.ok) return failedView(res.reason, "the turfs");
      const turfs = res.data;
      return {
        count: turfs.length,
        node: (
          <Table head={["Turf", "City", "Rating", "Phone", "Photos", "Updated"]} empty={turfs.length === 0}>
            {turfs.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <Link href={turfPath(t)} className="text-primary-900 hover:text-accent-600">{t.name}</Link>
                  <div className="text-[12px] text-primary-400 max-w-[280px] truncate">{t.address}</div>
                </td>
                <td className="px-4 py-3 text-primary-700">{t.city && isCity(t.city) ? labelFor(t.city) : "-"}</td>
                <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                  {Number(t.rating) > 0 ? `★ ${Number(t.rating).toFixed(1)}` : "-"}
                  {t.total_reviews ? <span className="text-primary-400"> ({t.total_reviews})</span> : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{t.phone || <Badge className="bg-hot-500/10 text-hot-600">missing</Badge>}</td>
                <td className="px-4 py-3 tabular-nums">{t.photos}</td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(t.updated_at)}</td>
              </tr>
            ))}
          </Table>
        ),
      };
    }

    case "bookings": {
      const res = await getAdminBookings(filter as BookingFilter);
      if (!res.ok) return failedView(res.reason, "the bookings");
      const bookings = res.data;
      const names = await userNames(bookings.map((b) => b.user_id));
      return {
        count: bookings.length,
        node: (
          <Table head={["Player", "Slot", "Players", "Amount", "Status", "Payment", "Created"]} empty={bookings.length === 0}>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3 text-primary-900">{(b.user_id && names.get(b.user_id)) || "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{b.date ? fmtGameDate(b.date) : "-"}, {hm(b.start_time)}</td>
                <td className="px-4 py-3 tabular-nums">{b.total_players ?? "-"}</td>
                <td className="px-4 py-3 tabular-nums">{b.total_amount != null ? `₹${Number(b.total_amount).toLocaleString("en-IN")}` : "-"}</td>
                <td className="px-4 py-3"><Badge className="bg-primary-100 text-primary-700">{b.status ?? "-"}</Badge></td>
                <td className="px-4 py-3"><Badge className="bg-primary-100 text-primary-700">{b.payment_status ?? "-"}</Badge></td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(b.created_at)}</td>
              </tr>
            ))}
          </Table>
        ),
      };
    }

    case "reviews": {
      const res = await getAdminReviews();
      if (!res.ok) return failedView(res.reason, "the reviews");
      const reviews = res.data;
      const names = await userNames(reviews.map((r) => r.user_id));
      return {
        count: reviews.length,
        node: (
          <Table head={["Turf", "Rating", "Comment", "By", "Source", "Date"]} empty={reviews.length === 0}>
            {reviews.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3">
                  {r.turf_id ? <Link href={`/turf/${r.turf_id}`} className="text-primary-900 hover:text-accent-600">{r.turfName ?? "Turf"}</Link> : "-"}
                </td>
                <td className="px-4 py-3 tabular-nums">★ {r.rating}</td>
                <td className="px-4 py-3 text-primary-600 max-w-[360px]">{r.comment || <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3 text-primary-900">{r.author_name || (r.user_id && names.get(r.user_id)) || "-"}</td>
                <td className="px-4 py-3"><Badge className="bg-primary-100 text-primary-700">{r.source ?? "app"}</Badge></td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
              </tr>
            ))}
          </Table>
        ),
      };
    }

    case "asks": {
      const f = filter as AskFilter;
      const res = await getAskTranscripts(f === "month" ? 30 : 7);
      if (!res.ok) {
        if (res.reason === "not_set_up") return { count: null, node: <p className="text-primary-500 text-sm">The transcript function is not installed yet.</p> };
        return failedView(res.reason, "the chats");
      }
      const rows = filterAsks(res.rows, f);
      const threads = threadAsks(rows);
      const digestDays = f === "month" ? 30 : 7;
      const digest = await getAskDigest(digestDays);
      const st = askStats(rows);
      const intentLabel: Record<string, string> = { find_turf: "Turf search", find_game: "Game search", compare: "Compare", question: "Question", create_game: "Host a game", tool: "Tool", blog: "Blog answer", other: "Chit-chat" };
      return {
        count: rows.length,
        node: (
          <div>
            <AskDigestCard initial={digest} days={digestDays} configured={isAskConfigured()} />
            <div className="flex flex-wrap gap-2 mb-5 text-[13px]">
              <Badge className="bg-primary-100 text-primary-700">{st.visitors} visitor{st.visitors === 1 ? "" : "s"}</Badge>
              <Badge className="bg-primary-100 text-primary-700">{threads.length} conversation{threads.length === 1 ? "" : "s"}</Badge>
              <Badge className="bg-accent-100 text-accent-800">{st.claude} via Claude</Badge>
              {st.instant > 0 && <Badge className="bg-primary-100 text-primary-800">{st.instant} instant</Badge>}
              {st.empty > 0 && <Badge className="bg-amber-100 text-amber-800">{st.empty} with no results</Badge>}
              {st.p50 != null && <Badge className="bg-primary-100 text-primary-700">{(st.p50 / 1000).toFixed(1)}s typical</Badge>}
              {Object.entries(st.byIntent)
                .sort((a, b) => b[1] - a[1])
                .map(([k, n]) => (
                  <Badge key={k} className="bg-white border border-primary-200 text-primary-700">
                    {intentLabel[k] ?? k} {n}
                  </Badge>
                ))}
            </div>
            {threads.length === 0 && <p className="text-primary-500 text-sm">No chats in this window.</p>}
            <ul className="space-y-4">
              {threads.map((t) => (
                <li key={t.key} className="rounded-2xl bg-white border border-primary-200 p-4 sm:p-5">
                  <p className="text-[12px] text-primary-400 mb-3">
                    {fmtDateTime(t.started)} · {t.rows[0].user_name ? <span className="text-primary-700 font-medium">{t.rows[0].user_name}</span> : `visitor ${t.ip_hash.slice(0, 6)}`} · {t.rows.length} message{t.rows.length === 1 ? "" : "s"}
                  </p>
                  <div className="space-y-3">
                    {t.rows.map((r) => (
                      <div key={r.id} className="space-y-1.5">
                        <div className="flex justify-end">
                          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-900 text-white text-[14px] px-3.5 py-2 leading-snug">{r.query}</p>
                        </div>
                        <div className="flex justify-start">
                          <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-primary-50 text-primary-900 text-[14px] px-3.5 py-2 leading-snug">
                            {r.reply || <span className="text-primary-400">(no reply stored)</span>}
                            <p className="mt-1 text-[11px] text-primary-400">
                              {intentLabel[r.intent ?? ""] ?? r.intent ?? "?"}
                              {r.results != null && r.intent !== "other" && r.intent !== "blog" ? ` · ${r.results} result${r.results === 1 ? "" : "s"}` : ""}
                              {r.ms != null ? ` · ${(r.ms / 1000).toFixed(1)}s` : ""}
                              {({ quick: " · ready answer", cache: " · cached reading", keywords: " · keyword fallback" } as Record<string, string>)[askVia(r) ?? ""] ?? ""}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ),
      };
    }

    case "listing": {
      const res = await getFlaggedListings();
      if (!res.ok) return failedView(res.reason, "the listing checks");
      const flagged = res.data;
      const sev: Record<string, string> = { fix: "bg-hot-100 text-hot-700", check: "bg-amber-100 text-amber-800", gap: "bg-primary-100 text-primary-700" };
      return {
        count: flagged.length,
        node: (
          <div>
            <p className="text-[13px] text-primary-500 mb-4">
              What the listing checker flagged. It reports, it does not edit: fix the row in Supabase or ask the owner, then the next run clears it.
            </p>
            {flagged.length === 0 && <p className="text-primary-500 text-sm">Nothing flagged. Run the Listing checker on the dashboard.</p>}
            <ul className="space-y-3">
              {flagged.map((t) => (
                <li key={t.id} className="rounded-2xl bg-white border border-primary-200 p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={turfPath(t)} target="_blank" className="font-semibold text-primary-900 hover:text-accent-600">
                      {t.name} <ExternalLink className="inline w-3.5 h-3.5 text-primary-400" />
                    </Link>
                    <span className="text-[12px] text-primary-400 shrink-0">
                      {t.city ? `${labelFor(t.city as never)} · ` : ""}
                      {fmtDateTime(t.listing_checked_at)}
                    </span>
                  </div>
                  <p className="text-[13px] text-primary-700 mt-0.5">{t.listing_review.summary}</p>
                  <ul className="mt-2 space-y-1.5">
                    {t.listing_review.issues.map((i, k) => (
                      <li key={k} className="text-[13px] text-primary-800 flex items-start gap-2">
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${sev[i.severity] ?? sev.gap}`}>{i.severity}</span>
                        <span>
                          <span className="font-mono text-[12px] text-primary-500">{i.field}</span> {i.note}
                          {i.suggested ? <span className="text-accent-800"> Suggested: {i.suggested}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ),
      };
    }

    case "suggestions": {
      const res = await getPendingSuggestions(300);
      if (!res.ok) {
        if (res.reason === "not_set_up") return { count: null, node: <p className="text-primary-500 text-sm">The suggestion review functions are not installed yet.</p> };
        return failedView(res.reason, "the suggestions");
      }
      return { count: res.rows.length, node: <SuggestionQueue initial={res.rows} /> };
    }

    case "notifications": {
      const res = await getAdminNotifications(filter as NotificationFilter);
      if (!res.ok) return failedView(res.reason, "the notifications");
      const notes = res.data;
      const names = await userNames(notes.map((n) => n.user_id));
      return {
        count: notes.length,
        node: (
          <Table head={["To", "Type", "Title", "Message", "Read", "Sent"]} empty={notes.length === 0}>
            {notes.map((n) => (
              <tr key={n.id} className="align-top">
                <td className="px-4 py-3 text-primary-900">{(n.user_id && names.get(n.user_id)) || "-"}</td>
                <td className="px-4 py-3"><Badge className="bg-primary-100 text-primary-700">{n.type}</Badge></td>
                <td className="px-4 py-3 text-primary-900">{n.title}</td>
                <td className="px-4 py-3 text-primary-600 max-w-[320px]">{n.message}</td>
                <td className="px-4 py-3">{n.is_read ? "yes" : <Badge className="bg-amber-100 text-amber-800">unread</Badge>}</td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(n.created_at)}</td>
              </tr>
            ))}
          </Table>
        ),
      };
    }
  }
}

/**
 * Google sign-ins that opened no TapTurf account: the ones that never came back (the old trigger made
 * an empty account for those), and the ones being added to, refused by or taken off a phone account.
 */
async function UnfinishedGoogle() {
  const [{ people }, rows] = await Promise.all([signupPeople(), googleUnfinishedRows()]);
  const list = unfinishedList(people ?? [], rows);
  if (list.length === 0) return null;
  return (
    <section className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="font-semibold text-amber-900">Google sign-ins that didn&rsquo;t finish ({list.length})</h2>
      <p className="text-[13px] text-amber-900/80">Each picked a Google account but has no TapTurf sign-in to show for it. Their email is real: Google confirmed it.</p>
      <ul className="mt-2 space-y-1 text-[13px] text-primary-800">
        {list.map((u) => (
          <li key={u.id} className="break-words">
            {fmtDateTime(new Date(u.at).toISOString())} · {u.name ?? "No name"} ·{" "}
            {u.email ? (
              <a href={`mailto:${u.email}`} className="underline underline-offset-2">
                {u.email}
              </a>
            ) : (
              "no email"
            )}{" "}
            · <Badge className="bg-white text-amber-900 border border-amber-300">{UNFINISHED_LABEL[u.state]}</Badge>
            {u.inPeople && (
              <>
                {" "}
                ·{" "}
                <a href={`/admin?person=${u.id}#people`} className="font-semibold text-accent-700 hover:underline">
                  Open in people list
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
