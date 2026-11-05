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
  getAdminNoPhoneTurfs,
  getAdminTurfs,
  getAdminTypedVenues,
  getAdminUsers,
  userNames,
  type AdminGame,
  type AdminUser,
  type BookingFilter,
  type GameFilter,
  type NotificationFilter,
  type RequestFilter,
  type TurfFilter,
  type UserFilter,
} from "@/lib/queries/adminDetail";
import { LOGIN_FILTERS, filterLogins, getRecentLogins, type LoginFilter } from "@/lib/queries/adminLogins";
import { signupPeople } from "@/lib/queries/adminUsers";
import { CITY_HOW, NO_CITY, ago, cityLabel, cityParam, countCities, rowInCity } from "@/lib/admin/people";
import { googleUnfinishedRows } from "@/lib/queries/adminLinks";
import { UNFINISHED_LABEL, unfinishedList } from "@/lib/admin/links";
import { getPendingSuggestions } from "@/lib/queries/adminSuggestions";
import { ASK_FILTERS, askStats, askVia, filterAsks, getAskDigest, getAskTranscripts, threadAsks, type AskFilter } from "@/lib/queries/adminAsks";
import { AskDigestCard } from "@/components/admin/AskDigest";
import { getFlaggedListings } from "@/lib/queries/adminListing";
import { isAskConfigured } from "@/lib/ai/ask";
import { SuggestionQueue } from "@/components/admin/SuggestionQueue";
import { ReviewFlags } from "@/components/admin/ReviewFlags";
import { ReviewRemovals } from "@/components/admin/ReviewRemovals";
import { turfPath } from "@/lib/utils/turfPath";
import { LIVE_FILTERS, adminLiveStatus, getAdminLiveLinks, type AdminLiveLink, type LiveFilter } from "@/lib/queries/adminTools";
import { methodLabel, recordedLater, starterName } from "@/lib/admin/live";
import { getAdminClaims } from "@/lib/queries/adminClaims";
import { CLAIMED_FILTERS, CLAIMS_CAP, claimCounts, claimWhen, claimedTurfs, claimsCut, howVerified, phoneLabel, type ClaimedFilter } from "@/lib/admin/claimed";
import { keyLabel } from "@/lib/admin/claims";
import { SectionError } from "@/components/admin/SectionStatus";
import { reasonText, type Reason } from "@/lib/admin/section";
import { getAdminTournaments } from "@/lib/queries/adminTournaments";
import { groundTitle, sizeLine } from "@/lib/turfSize/sizes";

const TOURNAMENT_FILTERS = { all: "All", live: "Live now", on: "On", removed: "Taken down" } as const;

export const revalidate = 0;
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const VIEWS = {
  games: { title: "Games", filters: GAME_FILTERS },
  venues: { title: "Venues hosts typed", filters: { all: "All" } },
  users: { title: "Users", filters: USER_FILTERS },
  logins: { title: "Latest logins", filters: LOGIN_FILTERS },
  requests: { title: "Join requests", filters: REQUEST_FILTERS },
  turfs: { title: "Turfs", filters: TURF_FILTERS },
  claimed: { title: "Claimed turfs", filters: CLAIMED_FILTERS },
  bookings: { title: "Bookings", filters: BOOKING_FILTERS },
  reviews: { title: "Reviews", filters: { all: "All" } },
  notifications: { title: "Notifications", filters: NOTIFICATION_FILTERS },
  suggestions: { title: "Player suggestions", filters: { all: "Pending" } },
  listing: { title: "Listing checks", filters: { all: "Flagged" } },
  asks: { title: "Ask TapTurf chats", filters: ASK_FILTERS },
  live: { title: "Live scoreboard links", filters: LIVE_FILTERS },
  tournaments: { title: "Live tournaments", filters: TOURNAMENT_FILTERS },
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
  searchParams: Promise<{ f?: string; city?: string }>;
}) {
  if (!(await isAdmin())) return <AdminGate />;
  const { view } = await params;
  if (!(view in VIEWS)) notFound();
  const v = view as View;
  const { f, city: cityRaw } = await searchParams;
  const filters = VIEWS[v].filters as Record<string, string>;
  const filter = f && f in filters ? f : "all";
  // The Users list also filters by city (?city=), kept when another filter is picked.
  const city = v === "users" ? cityParam(cityRaw) : null;

  const body = await renderView(v, filter, city);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 md:py-8">
      <Link href="/admin" className="-ml-2 inline-flex min-h-10 items-center gap-1 rounded-full px-2 text-sm text-primary-500 hover:text-primary-900 mb-2">
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
              href={viewHref(v, key, city)}
              className={`shrink-0 h-10 px-4 inline-flex items-center rounded-full text-[14px] font-medium ${
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
  closed: "bg-primary-100 text-primary-700",
  done: "bg-accent-50 text-accent-700",
  stopped: "bg-primary-100 text-primary-500",
  expired: "bg-primary-100 text-primary-500",
};
const CLAIM_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  revoked: "bg-hot-500/10 text-hot-600",
  rejected: "bg-primary-100 text-primary-500",
};

/** A live link with no update for 2 hours is closed (adminLiveStatus): it keeps its last score but takes no more. */
function LiveStatus({ link, now }: { link: AdminLiveLink; now: number }) {
  const s = adminLiveStatus(link, now);
  return <Badge className={LIVE_STYLE[s] ?? "bg-primary-100 text-primary-500"}>{s === "closed" ? "Closed (idle)" : s}</Badge>;
}
const sportName = (s: string | null) => (s ? s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : null);

/** A view whose rows couldn't be read: why, and a retry (never "Nothing here"). */
const failedView = (reason: Reason, what: string) => ({ count: null, node: <SectionError reason={reason} what={what} /> });

/**
 * Turfs, No phone: every active turf whose page shows no Call and no
 * WhatsApp (the page's own rule, lib/utils/contact.ts), most viewed over
 * the last 28 days first, with the views, so the numbers worth finding
 * first are on top. Without the views (before 20261105_admin_turf_views.sql,
 * or a failed read) the list is by name and says so.
 */
async function noPhoneView(): Promise<{ count: number | null; node: React.ReactNode }> {
  const res = await getAdminNoPhoneTurfs();
  if (!res.ok) return failedView(res.reason, "the turfs");
  const { turfs, views, viewsReason } = res.data;
  const bad = turfs.filter((t) => t.why === "bad").length;
  const viewsNote =
    viewsReason === "not_set_up"
      ? "Views aren't counted here until 20261105_admin_turf_views.sql is applied, so the list is by name for now."
      : viewsReason === "not_allowed"
        ? "Couldn't confirm it's you for the views (sign in with the owner's Google account), so the list is by name."
        : viewsReason
          ? `${reasonText(viewsReason)}: the views, so the list is by name for now.`
          : null;
  return {
    count: turfs.length,
    node: (
      <>
        <div className="mb-3 space-y-1">
          <p className="text-sm text-primary-500">
            These pages show no Call or WhatsApp: {turfs.length - bad} store no number, {bad} store one that fails the format check.
            {views && ` Most viewed first: turf page views over the last ${views.days} days${views.since ? `, since ${fmtGameDate(views.since)}` : ""} (India days, today included).`}
          </p>
          {viewsNote && <p className="text-[13px] text-amber-800">{viewsNote}</p>}
        </div>
        {/* Views first, so a phone sees them next to the name without scrolling the table. */}
        <Table head={[`Views${views ? ` (${views.days} days)` : ""}`, "Turf", "City", "Number", "Rating", "Photos", "Updated"]} empty={turfs.length === 0}>
          {turfs.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 tabular-nums font-semibold text-primary-900">{t.views == null ? "-" : t.views.toLocaleString("en-IN")}</td>
              <td className="px-4 py-3">
                <Link href={turfPath(t)} className="text-primary-900 hover:text-accent-600">{t.name}</Link>
                {t.claimed && <Badge className="ml-1.5 bg-accent-50 text-accent-700">Claimed</Badge>}
                <div className="text-[12px] text-primary-400 max-w-[280px] truncate">{t.address}</div>
              </td>
              <td className="px-4 py-3 text-primary-700">{t.city && isCity(t.city) ? labelFor(t.city) : "-"}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {t.why === "bad" ? (
                  <Badge className="bg-amber-100 text-amber-800">fails the check</Badge>
                ) : (
                  <Badge className="bg-hot-500/10 text-hot-600">none stored</Badge>
                )}
              </td>
              <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                {Number(t.rating) > 0 ? `★ ${Number(t.rating).toFixed(1)}` : "-"}
                {t.total_reviews ? <span className="text-primary-400"> ({t.total_reviews})</span> : null}
              </td>
              <td className="px-4 py-3 tabular-nums">{t.photos}</td>
              <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(t.updated_at)}</td>
            </tr>
          ))}
        </Table>
      </>
    ),
  };
}

/** A view's address for a filter, and for the Users list a city (null: every city). */
function viewHref(v: View, filter: string, city: string | null): string {
  const q = new URLSearchParams();
  if (filter !== "all") q.set("f", filter);
  if (city) q.set("city", city);
  const s = q.toString();
  return `/admin/${v}${s ? `?${s}` : ""}`;
}

/** The Users list's city filter: every city with its count under the current filter, then "Not known". */
function CityFilter({ filter, city, counts }: { filter: string; city: string | null; counts: ReturnType<typeof countCities> }) {
  const shown = [...counts.cities];
  // A picked city with nobody under this filter still shows, at 0, so it can be turned off.
  if (city && city !== NO_CITY && !shown.some((c) => c.id === city)) shown.push({ id: city, label: cityLabel(city), n: 0 });
  const chips: { key: string | null; label: string; n: number | null }[] = [
    { key: null, label: "All cities", n: null },
    ...shown.map((c) => ({ key: c.id, label: c.label, n: c.n })),
    { key: NO_CITY, label: "Not known", n: counts.unknown },
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-4 -mx-4 px-4 sm:mx-0 sm:px-0" aria-label="Filter by city">
      {chips.map((c) => (
        <Link
          key={c.key ?? "all"}
          href={viewHref("users", filter, c.key)}
          aria-current={c.key === city ? "true" : undefined}
          className={`shrink-0 h-10 px-3 inline-flex items-center gap-1.5 rounded-full text-[13px] font-medium ${
            c.key === city ? "bg-accent-600 text-white" : "bg-white border border-primary-200 text-primary-800 hover:bg-primary-50"
          }`}
        >
          {c.label}
          {c.n !== null && <span className={`tabular-nums ${c.key === city ? "text-white/80" : "text-primary-400"}`}>{c.n}</span>}
        </Link>
      ))}
    </div>
  );
}

/**
 * The Users list: name, city, joined and last active first, then how they
 * sign in, what they did and how to reach them. A table from a tablet up;
 * on a phone every row is a card (the same cells in three short lines, each
 * with its label), so nothing scrolls sideways. lastActive is null when the
 * people list couldn't be read: "-" then, never "Never".
 */
function UsersTable({ users, lastActive, now }: { users: AdminUser[]; lastActive: Map<string, number | null> | null; now: number }) {
  if (users.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-primary-200">
        <p className="px-5 py-10 text-center text-sm text-primary-400">Nothing here.</p>
      </div>
    );
  }
  // "confirmed" sits with the name, as on a phone's card: a column of its own pushed the table past a laptop's width.
  const head = ["Name", "City", "Joined", "Last active", "Sign-in", "Hosted", "Requests", "Email", "Phone"];
  // A phone's card, three lines under the name: where and when (order 2), how they sign in and what they
  // did (4), how to reach them (6). The row's ::after and ::before (orders 3 and 5) are the line breaks.
  const cell = "px-4 py-3 max-sm:p-0 max-sm:text-[13px] max-sm:before:text-primary-400";
  return (
    <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
      <div className="sm:overflow-x-auto">
        <table className="w-full text-sm max-sm:block">
          <thead className="bg-primary-50 text-[11px] text-primary-500 font-semibold max-sm:hidden">
            <tr>
              {head.map((h) => (
                <th key={h} className="text-left px-4 py-2.5 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-primary-100 max-sm:block">
            {users.map((u) => {
              const active = lastActive ? (lastActive.get(u.id) ?? null) : undefined;
              return (
                <tr
                  key={u.id}
                  className="max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-4 max-sm:py-3 max-sm:after:order-3 max-sm:after:basis-full max-sm:before:order-5 max-sm:before:basis-full"
                >
                  <td className="px-4 py-3 text-primary-900 max-sm:order-1 max-sm:basis-full max-sm:p-0 max-sm:pb-0.5 max-sm:text-[15px] max-sm:font-semibold">
                    {u.name || <span className="text-primary-400">-</span>}
                    {u.duplicateOf > 1 && <Badge className="ml-1.5 bg-amber-100 text-amber-800">{u.duplicateOf} accounts</Badge>}
                    {u.verified && (
                      <span title={u.verifiedHow ?? undefined}>
                        <Badge className="ml-1.5 bg-accent-50 text-accent-700">confirmed</Badge>
                      </span>
                    )}
                  </td>
                  <td
                    className={`${cell} text-primary-900 whitespace-nowrap max-sm:order-2 ${u.city ? "" : "max-sm:hidden"}`}
                    title={u.city?.how === "guess" ? "A guess from their activity (games, turfs contacted, searches)" : undefined}
                  >
                    {u.city ? (
                      <>
                        {cityLabel(u.city.id)}
                        {CITY_HOW[u.city.how] && <span className="ml-1.5 text-[12px] text-primary-400">{CITY_HOW[u.city.how]}</span>}
                      </>
                    ) : (
                      <span className="text-primary-400">-</span>
                    )}
                  </td>
                  <td className={`${cell} text-primary-500 whitespace-nowrap max-sm:order-2 max-sm:before:content-['Joined_']`}>{fmtDateTime(u.created_at)}</td>
                  <td
                    className={`${cell} text-primary-700 whitespace-nowrap max-sm:order-2 max-sm:before:content-['Active_']`}
                    title={active ? fmtDateTime(new Date(active).toISOString()) : undefined}
                  >
                    {active === undefined ? <span className="text-primary-400">-</span> : active === null ? <span className="text-primary-400">Never</span> : ago(active, now)}
                  </td>
                  <td className={`${cell} max-sm:order-4`}><Badge className="bg-primary-100 text-primary-700">{u.method}</Badge></td>
                  <td className={`${cell} tabular-nums max-sm:order-4 max-sm:before:content-['Hosted_']`}>{u.gamesHosted}</td>
                  <td className={`${cell} tabular-nums max-sm:order-4 max-sm:before:content-['Requests_']`}>{u.requestsMade}</td>
                  <td className={`${cell} text-primary-700 max-sm:order-6 max-sm:break-all ${u.email ? "" : "max-sm:hidden"}`}>{u.email || <span className="text-primary-400">-</span>}</td>
                  <td className={`${cell} text-primary-700 whitespace-nowrap max-sm:order-6 ${u.phone ? "" : "max-sm:hidden"}`}>
                    {u.phone || <span className="text-primary-400">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function renderView(v: View, filter: string, city: string | null = null): Promise<{ count: number | null; node: React.ReactNode }> {
  switch (v) {
    case "tournaments": {
      const res = await getAdminTournaments();
      if (!res.ok) return failedView(res.reason, "the tournaments");
      const list = res.data.filter((t) => (filter === "live" ? t.liveNow > 0 && t.status === "on" : filter === "on" ? t.status === "on" : filter === "removed" ? t.status === "removed" : true));
      return {
        count: list.length,
        node: (
          <Table head={["Tournament", "Format", "Teams", "Played", "Live now", "Views", "Organiser", "Created", "Last activity"]} empty={list.length === 0}>
            {list.map((t) => (
              <tr key={t.code}>
                <td className="px-4 py-3 min-w-[11rem]">
                  <a href={`/tournament/${t.code}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-accent-700 hover:underline">
                    {t.name || t.code} <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  <span className="block font-mono text-[12px] text-primary-400">/tournament/{t.code}</span>
                  {t.status === "removed" && <Badge className="bg-primary-100 text-primary-500">Taken down</Badge>}
                </td>
                <td className="px-4 py-3 text-primary-700 whitespace-nowrap">{t.format}</td>
                <td className="px-4 py-3 tabular-nums">{t.teams}</td>
                <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                  {t.played} <span className="text-primary-400">of {t.fixtures}</span>
                </td>
                <td className="px-4 py-3 tabular-nums">{t.liveNow ? <Badge className="bg-amber-100 text-amber-800">{t.liveNow} live</Badge> : <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                  <span className="text-primary-900">{t.views.toLocaleString("en-IN")}</span>
                  <span className="block text-[12px] text-primary-500" title="Unique viewers: one per browser per day">
                    {t.viewers.toLocaleString("en-IN")} unique
                  </span>
                </td>
                {/* The account it is kept with, when the organiser was signed in. */}
                <td className="px-4 py-3 min-w-[8rem]">
                  {t.organiser ? (
                    <a href={`/admin?person=${t.organiser.id}#people`} className="font-semibold text-accent-700 hover:underline">
                      {t.organiser.name || "No name on the account"}
                    </a>
                  ) : (
                    <span className="text-primary-400 whitespace-nowrap">Not signed in</span>
                  )}
                </td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(t.createdAt)}</td>
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(t.updatedAt)}</td>
              </tr>
            ))}
          </Table>
        ),
      };
    }

    case "live": {
      const now = Date.now();
      const res = await getAdminLiveLinks(filter as LiveFilter, now);
      if (!res.ok) return failedView(res.reason, "the links");
      const links = res.data;
      return {
        count: links.length,
        node: (
          <Table head={["Link", "Started by", "Sport", "Match", "Title and venue", "Status", "Updates", "Views", "Started", "Last update"]} empty={links.length === 0}>
            {links.map((l) => (
              <tr key={l.code}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <a href={`/live/${l.code}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-mono text-[12px] text-accent-700 hover:underline">
                    /live/{l.code} <ExternalLink className="w-3 h-3" />
                  </a>
                </td>
                {/* The account the server verified on the link's first write (20261029_live_link_starts.sql); older links have none. */}
                <td className="px-4 py-3 min-w-[8.5rem]">
                  {l.starter ? (
                    <>
                      <a href={`/admin?person=${l.starter.id}#people`} className="font-semibold text-accent-700 hover:underline">
                        {starterName(l.starter)}
                      </a>
                      <span className="block text-[12px] text-primary-500">
                        {l.starter.username && (
                          <>
                            <a href={`/u/${l.starter.username}`} target="_blank" rel="noopener" className="hover:underline">
                              @{l.starter.username}
                            </a>
                            {" · "}
                          </>
                        )}
                        {methodLabel(l.starter.method)}
                      </span>
                      {recordedLater(l) && (
                        <span className="block text-[12px] text-primary-400" title={`Recorded ${fmtDateTime(l.starter.at)}, after the link began (from a later signed-in update)`}>
                          Recorded later
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-primary-400 whitespace-nowrap">Not recorded</span>
                  )}
                </td>
                <td className="px-4 py-3 text-primary-700 whitespace-nowrap">{sportName(l.sport) ?? <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3 text-primary-900">
                  {l.team_a || l.team_b ? `${l.team_a || "?"} vs ${l.team_b || "?"}` : <span className="text-primary-400">{l.writes === 0 ? "Never went live" : l.status === "stopped" || l.status === "expired" ? "Cleared when it ended" : "-"}</span>}
                </td>
                <td className="px-4 py-3 text-primary-600">{[l.title, l.venue].filter(Boolean).join(" · ") || <span className="text-primary-400">-</span>}</td>
                <td className="px-4 py-3"><LiveStatus link={l} now={now} /></td>
                <td className="px-4 py-3 tabular-nums" title={l.events ? `${l.events} events in the match` : undefined}>{l.writes}</td>
                {/* Kept after the match is cleared (20261101_live_views.sql); "-" while views can't be read. */}
                <td className="px-4 py-3 tabular-nums whitespace-nowrap" title={l.views?.last ? `Last viewed ${fmtDateTime(l.views.last)}` : undefined}>
                  {l.views ? (
                    <>
                      <span className="text-primary-900">{l.views.views.toLocaleString("en-IN")}</span>
                      <span className="block text-[12px] text-primary-500" title="Unique viewers: one per browser per day">
                        {l.views.viewers.toLocaleString("en-IN")} unique
                      </span>
                    </>
                  ) : (
                    <span className="text-primary-400">-</span>
                  )}
                </td>
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
                    ) : g.venue_name ? (
                      // A venue its host typed: no turf page.
                      <span className="text-primary-900">
                        {g.venue_name} <span className="text-primary-400 text-[12px]">(not on TapTurf)</span>
                      </span>
                    ) : (
                      <span className="text-primary-400">-</span>
                    )}
                    {g.turf?.city && isCity(g.turf.city) && <div className="text-primary-400 text-[12px]">{labelFor(g.turf.city)}</div>}
                    {!g.turf && g.venue_city && <div className="text-primary-400 text-[12px]">{isCity(g.venue_city) ? labelFor(g.venue_city) : g.venue_city}</div>}
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
      // The people list's read (made once per render, getAdminUsers reads it too) gives each account's last activity.
      const [res, { people }] = await Promise.all([getAdminUsers(filter as UserFilter), signupPeople()]);
      if (!res.ok) return failedView(res.reason, "the users");
      const { users: all, citiesRead } = res.data;
      // Without the cities every row reads as none, so a city filter then shows everyone, as the note says.
      const users = citiesRead ? all.filter((u) => rowInCity(u.city, city)) : all;
      const lastActive = new Map((people ?? []).map((p) => [p.id, p.lastActive]));
      const now = Date.now();
      return {
        count: users.length,
        node: (
          <>
          {citiesRead ? (
            <CityFilter filter={filter} city={city} counts={countCities(all)} />
          ) : (
            <p className="mb-4 text-[14px] text-primary-500">Couldn&apos;t read cities just now, so the list shows everyone without them. Reload to try again.</p>
          )}
          {/* The columns that matter most first; on a phone each row is a card (UsersTable). */}
          <UsersTable users={users} lastActive={people ? lastActive : null} now={now} />
          </>
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
      if (filter === "nophone") return noPhoneView();
      const res = await getAdminTurfs(filter as TurfFilter);
      if (!res.ok) return failedView(res.reason, "the turfs");
      const turfs = res.data;
      // The sizes filter: the owner's grounds too (feet, as stored), dated.
      const sized = filter === "sizes";
      return {
        count: turfs.length,
        node: (
          <Table head={["Turf", "City", "Rating", "Phone", "Photos", ...(sized ? ["Ground size"] : []), "Updated"]} empty={turfs.length === 0}>
            {turfs.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3">
                  <Link href={turfPath(t)} className="text-primary-900 hover:text-accent-600">{t.name}</Link>
                  {t.claimed && <Badge className="ml-1.5 bg-accent-50 text-accent-700">Claimed</Badge>}
                  <div className="text-[12px] text-primary-400 max-w-[280px] truncate">{t.address}</div>
                </td>
                <td className="px-4 py-3 text-primary-700">{t.city && isCity(t.city) ? labelFor(t.city) : "-"}</td>
                <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                  {Number(t.rating) > 0 ? `★ ${Number(t.rating).toFixed(1)}` : "-"}
                  {t.total_reviews ? <span className="text-primary-400"> ({t.total_reviews})</span> : null}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{t.phone || <Badge className="bg-hot-500/10 text-hot-600">missing</Badge>}</td>
                <td className="px-4 py-3 tabular-nums">{t.photos}</td>
                {sized && (
                  <td className="px-4 py-3 text-[13px] text-primary-700">
                    {t.sizes ? (
                      <>
                        {t.sizes.grounds.map((g, i) => (
                          <div key={i} className="whitespace-nowrap tabular-nums">
                            {groundTitle(g, i, t.sizes!.grounds.length)}: {sizeLine(g, "ft")}
                            {g.height_ft == null ? ", open" : ""}
                            {g.sport ? ` · ${g.sport}` : ""}
                          </div>
                        ))}
                        <div className="text-[12px] text-primary-400">
                          Typed in {t.sizes.unit === "m" ? "metres" : "feet"}, {fmtDateTime(t.sizes.updated_at)}
                        </div>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                )}
                <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(t.updated_at)}</td>
              </tr>
            ))}
          </Table>
        ),
      };
    }

    case "claimed": {
      const res = await getAdminClaims();
      if (!res.ok) return failedView(res.reason, "the claims");
      const { claims, offSite } = res.data;
      const f = filter as ClaimedFilter;
      const turfs = claimedTurfs(claims, f);
      const n = claimCounts(claims);
      const empty: Record<ClaimedFilter, string> = {
        all: "No turf is claimed right now. Owners claim theirs at tapturf.in/my.",
        waiting: "No claims waiting for approval.",
        ended: "No revoked or rejected claims.",
        every: "No claims yet. Owners claim their turf at tapturf.in/my.",
      };
      return {
        count: turfs.length,
        node: (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
              <p className="text-sm text-primary-500">
                {n.turfs} turf{n.turfs === 1 ? "" : "s"} claimed now · {n.people} {n.people === 1 ? "person" : "people"} managing · {n.waiting} waiting for approval · {n.ended} revoked or rejected
              </p>
              {/* Approve, reject, revoke and restore stay in one place: the panel on the admin home. */}
              <Link href="/admin#owner-claims" className="text-xs font-semibold text-accent-600 hover:text-accent-700">
                Approve, reject or revoke in myTapturf owners
              </Link>
            </div>
            {claimsCut(claims) && (
              <p className="text-[13px] text-amber-800 mb-3">
                Showing the newest {CLAIMS_CAP} claims (waiting ones first). Older claims may be missing here, so these numbers may be low.
              </p>
            )}
            {turfs.length === 0 ? (
              <div className="rounded-2xl bg-white border border-primary-200">
                <p className="px-5 py-10 text-center text-sm text-primary-400">{empty[f]}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {turfs.map((t) => (
                  <li key={t.turfId} className="rounded-2xl bg-white border border-primary-200 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <Link href={turfPath({ id: t.turfId, slug: t.slug })} target="_blank" className="font-semibold text-primary-900 hover:text-accent-600">
                        {t.name} <ExternalLink className="inline w-3.5 h-3.5 text-primary-400" />
                      </Link>
                      <span className="text-[12px] text-primary-500 tabular-nums">
                        {t.managing} managing{t.waiting > 0 && <span className="text-amber-700"> · {t.waiting} waiting</span>}
                      </span>
                    </div>
                    <p className="text-[13px] text-primary-500">
                      {t.place ?? "-"}
                      {offSite?.has(t.turfId) && <Badge className="ml-1.5 bg-hot-500/10 text-hot-600">not on the site</Badge>}
                    </p>
                    <ul className="mt-3 divide-y divide-primary-100 border-t border-primary-100">
                      {t.claims.map((c) => {
                        const a = c.account;
                        const how = howVerified(c);
                        return (
                          <li key={c.userKey} className="py-2.5 text-[13px] space-y-0.5">
                            <p className="text-primary-900">
                              <span className="font-semibold">{a?.name ?? c.storedName ?? "No name"}</span>
                              {a?.username && (
                                <Link href={`/u/${a.username}`} className="ml-1.5 text-accent-700 hover:underline">
                                  @{a.username}
                                </Link>
                              )}
                              <Badge className="ml-1.5 bg-primary-100 text-primary-700">{c.role ?? "role not given"}</Badge>
                              {c.status !== "active" && <Badge className={`ml-1.5 ${CLAIM_STYLE[c.status]}`}>{c.status === "pending" ? "waiting" : c.status}</Badge>}
                              {c.siteOwner && <Badge className="ml-1.5 bg-accent-50 text-accent-700">TapTurf (you)</Badge>}
                            </p>
                            <p className="text-primary-700">
                              {how.text}
                              {how.phone && (
                                <>
                                  {" · "}
                                  <a href={`tel:+91${how.phone}`} className="hover:text-accent-600 tabular-nums">{phoneLabel(how.phone)}</a>
                                </>
                              )}
                            </p>
                            <p className="text-primary-500">
                              {claimWhen(c)}
                              {" · "}
                              {a ? (
                                <a href={`/admin?person=${a.id}#people`} className="font-semibold text-accent-700 hover:underline whitespace-nowrap">
                                  Open in people list
                                </a>
                              ) : (
                                <span className="text-amber-800">No TapTurf account for this sign-in ({keyLabel(c.userKey)})</span>
                              )}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
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
          <>
            {/* Owners' requests to take a report off (read in the browser, after the page). */}
            <section id="removal-requests" className="mb-6 rounded-2xl bg-white border border-primary-200 p-5 scroll-mt-20">
              <h2 className="font-semibold text-primary-900 mb-1">Review removal requests</h2>
              <p className="text-[13px] text-primary-500 mb-4">
                Every player report goes live at once. A turf&rsquo;s owner can ask you to take one off; it stays up until you decide, and its author is never told who asked.
              </p>
              <ReviewRemovals />
            </section>
            {/* Players' reports of reviews (read in the browser, after the page). */}
            <section id="review-reports" className="mb-6 rounded-2xl bg-white border border-primary-200 p-5 scroll-mt-20">
              <h2 className="font-semibold text-primary-900 mb-1">Reported reviews</h2>
              <p className="text-[13px] text-primary-500 mb-4">
                Signed-in players can report a review from the turf page. It stays up until you decide, and its author is never told who reported it.
              </p>
              <ReviewFlags />
            </section>
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
          </>
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

    case "venues": {
      // The venues hosts typed because they aren't on TapTurf: the popular ones are worth adding.
      const res = await getAdminTypedVenues();
      if (!res.ok) {
        if (res.reason === "not_set_up") return { count: null, node: <p className="text-primary-500 text-sm">Typed venues aren&apos;t in the database yet (20261103_game_other_venue.sql).</p> };
        return failedView(res.reason, "the typed venues");
      }
      const rows = res.data;
      return {
        count: rows.length,
        node: (
          <>
            <p className="text-sm text-primary-500 mb-3">
              Venues hosts typed when the turf wasn&apos;t on TapTurf, the most games first: one row per name and city. The popular ones are worth adding to TapTurf.
            </p>
            <Table head={["Venue", "Area", "City", "Games", "Hosts", "Last game", "Last posted"]} empty={rows.length === 0}>
              {rows.map((r) => (
                <tr key={`${r.venue_name}|${r.venue_city ?? ""}`} className="align-top">
                  <td className="px-4 py-3 min-w-[10rem] font-medium text-primary-900 break-words">{r.venue_name}</td>
                  <td className="px-4 py-3 text-primary-700">{r.venue_area || "-"}</td>
                  <td className="px-4 py-3 text-primary-700 whitespace-nowrap">{r.venue_city ? (isCity(r.venue_city) ? labelFor(r.venue_city) : r.venue_city) : "-"}</td>
                  <td className="px-4 py-3 tabular-nums">{r.games}</td>
                  <td className="px-4 py-3 tabular-nums">{r.hosts}</td>
                  <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{r.last_day ? fmtGameDate(r.last_day) : "-"}</td>
                  <td className="px-4 py-3 text-primary-500 whitespace-nowrap">{fmtDateTime(r.last_posted)}</td>
                </tr>
              ))}
            </Table>
          </>
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
