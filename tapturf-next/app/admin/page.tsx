import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin } from "@/lib/admin/auth";
import { AdminGate } from "@/components/admin/AdminGate";
import {
  getHeadline,
  getDailySignups,
  getDailyGames,
  getRecentUsers,
  getGamesByCity,
  getGamesBySport,
  getGamesByStatus,
  getTurfsByCity,
  getTopHosts,
  getActiveUsers,
  getContactClickStats,
} from "@/lib/queries/admin";
import { getAdminGames } from "@/lib/queries/adminDetail";
import { StatTile } from "@/components/admin/StatTile";
import { CoverPhotoTool } from "@/components/admin/CoverPhotoTool";
import { ListingCheckTool, ReviewSummaryTool } from "@/components/admin/AiTools";
import { getPendingSuggestions } from "@/lib/queries/adminSuggestions";
import { getAskTranscripts } from "@/lib/queries/adminAsks";
import { getRecentLogins, loginStats } from "@/lib/queries/adminLogins";
import { DailyChart } from "@/components/admin/DailyChart";
import { BreakdownList } from "@/components/admin/BreakdownList";

// Never cache. Always fresh numbers for the owner.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin · TapTurf",
  robots: { index: false, follow: false, nocache: true },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** e.g. "3d ago", "5h ago", "just now", "6mo ago". */
function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  const y = Math.floor(d / 365);
  return `${y}y ago`;
}

function loginsUnavailable(reason: "not_set_up" | "not_allowed" | "error"): string {
  if (reason === "not_set_up") return "Login log not set up yet";
  if (reason === "not_allowed") return "Sign in with Google to view";
  return "Couldn't load";
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default async function AdminPage() {
  // Owner-only guard. Non-admins end on a "Page not found" screen;
  // AdminGate first lets a phone-OTP owner hand over their Firebase token.
  const allowed = await isAdmin();
  if (!allowed) return <AdminGate />;

  const suggestions = await getPendingSuggestions(500);
  const pendingSuggestions = suggestions.ok ? suggestions.rows.length : 0;
  const asks = await getAskTranscripts(7);
  const asks7d = asks.ok ? asks.rows.length : 0;
  const askVisitors = asks.ok ? new Set(asks.rows.map((r) => r.ip_hash)).size : 0;

  const [
    headline,
    signups,
    games,
    recentUsers,
    gamesByCity,
    gamesBySport,
    gamesByStatus,
    turfsByCity,
    topHosts,
    active7,
    active30,
    contact7,
    contact30,
    adminGames,
    logins,
  ] = await Promise.all([
    getHeadline(),
    getDailySignups(30),
    getDailyGames(30),
    getRecentUsers(25),
    getGamesByCity(),
    getGamesBySport(),
    getGamesByStatus(),
    getTurfsByCity(),
    getTopHosts(10),
    getActiveUsers(7),
    getActiveUsers(30),
    getContactClickStats(7),
    getContactClickStats(30),
    getAdminGames("all", 200),
    getRecentLogins(300),
  ]);
  const loginNums = logins.ok ? loginStats(logins.rows) : null;
  const lastLogin = loginNums?.latest;
  // Games snapshot: everything upcoming / live, then the latest past ones.
  const gameCounts = adminGames.reduce<Record<string, number>>((m, g) => ((m[g.state] = (m[g.state] ?? 0) + 1), m), {});
  const gamesShown = [
    ...adminGames.filter((g) => g.state === "live"),
    ...adminGames.filter((g) => g.state === "upcoming").reverse(),
    ...adminGames.filter((g) => g.state === "expired" || g.state === "cancelled"),
  ].slice(0, 12);

  // Detect batch-backfill: any created_at that appears on 2+ rows almost
  // certainly came from a bulk migration rather than a real user signup
  // (we ran one to backfill OAuth users into public.users). Flag those
  // so we don't misrepresent the row-insert time as the true signup.
  const backfillTs = new Set<string>();
  {
    const seen = new Map<string, number>();
    recentUsers.forEach((u) => {
      if (!u.created_at) return;
      seen.set(u.created_at, (seen.get(u.created_at) || 0) + 1);
    });
    seen.forEach((n, ts) => { if (n > 1) backfillTs.add(ts); });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-bold text-accent-600 mb-2">
            Owner only
          </p>
          <h1 className="font-display tracking-tight text-primary-900 text-4xl md:text-5xl leading-none">
            TapTurf Admin
          </h1>
          <p className="text-primary-500 text-sm mt-2">
            Real numbers, refreshed on every load. For deeper session /
            pageview analytics see{" "}
            <a
              href="https://analytics.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-600 underline hover:text-accent-700"
            >
              Google Analytics
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-full bg-primary-900 text-white text-xs font-bold px-4 py-2 hover:bg-primary-800"
          >
            Refresh
          </Link>
          <Link
            href="/"
            className="rounded-full border border-primary-200 text-primary-800 text-xs font-bold px-4 py-2 hover:bg-primary-50"
          >
            Back to site
          </Link>
        </div>
      </div>

      {/* Top-line tiles */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
        <StatTile
          label="Unique people"
          href="/admin/users"
          value={headline.uniquePeople}
          sub={
            headline.duplicateUsers > 0
              ? `${headline.duplicateUsers} duplicate row${headline.duplicateUsers === 1 ? "" : "s"} merged`
              : "No duplicates"
          }
          tone="accent"
        />
        <StatTile
          label="Total users"
          href="/admin/users"
          value={headline.totalUsers}
          sub="Raw row count"
        />
        <StatTile
          label="Total games"
          href="/admin/games"
          value={headline.totalGames}
          sub={`+${headline.games7d} this week`}
        />
        <StatTile label="Active turfs"
          href="/admin/turfs" value={headline.activeTurfs} />
      </section>

      {/* Sign-ins */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
        <StatTile
          label="Logins (24h)"
          href="/admin/logins?f=today"
          value={loginNums ? loginNums.today : "-"}
          sub={loginNums ? "Phone + Google sign-ins" : logins.ok ? "" : loginsUnavailable(logins.reason)}
        />
        <StatTile
          label="Logins (7d)"
          href="/admin/logins?f=week"
          value={loginNums ? loginNums.week : "-"}
          sub={loginNums ? `${loginNums.peopleWeek} ${loginNums.peopleWeek === 1 ? "person" : "people"}` : undefined}
        />
        <div className="col-span-2">
          <StatTile
            label="Latest login"
            href="/admin/logins"
            compact
            value={lastLogin ? lastLogin.name || lastLogin.phone || lastLogin.email || "Unknown" : "-"}
            sub={lastLogin ? `${timeAgo(lastLogin.logged_in_at)} · ${lastLogin.method === "google" ? "Google" : "Phone"}` : "Tap to see every sign-in"}
          />
        </div>
      </section>

      {/* Signup windows (requests + notifications are further down in
          the reviews snapshot to keep the layout de-duped). */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        <StatTile
          label="Unique signups (7d)"
          href="/admin/users?f=new7"
          value={headline.uniqueSignups7d}
          sub={`${headline.signups7d} rows`}
        />
        <StatTile
          label="Unique signups (30d)"
          href="/admin/users?f=new30"
          value={headline.uniqueSignups30d}
          sub={`${headline.signups30d} rows`}
        />
        <StatTile
          label="Duplicate accounts"
          href="/admin/users?f=duplicates"
          value={headline.duplicateUsers}
          sub={headline.duplicateUsers === 0 ? "Clean" : "Same person, 2+ rows"}
        />
        <StatTile
          label="Ask TapTurf (7d)"
          href="/admin/asks"
          value={asks7d}
          sub={asks7d === 0 ? "No chats yet" : `${askVisitors} visitor${askVisitors === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Player suggestions"
          href="/admin/suggestions"
          value={pendingSuggestions}
          sub={pendingSuggestions === 0 ? "Queue is clear" : "Pending your approval"}
          tone={pendingSuggestions > 0 ? "accent" : "default"}
        />
      </section>

      {/* AI tools */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <CoverPhotoTool />
        <ReviewSummaryTool />
        <ListingCheckTool />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="rounded-2xl bg-white border border-primary-200 p-5">
          <DailyChart
            points={signups}
            label="Signups, last 30 days"
            color="#16A34A"
          />
        </div>
        <div className="rounded-2xl bg-white border border-primary-200 p-5">
          <DailyChart
            points={games}
            label="Games created, last 30 days"
            color="#FF385C"
          />
        </div>
      </section>

      {/* Activity tiles */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        <StatTile
          label="Active users (7d)"
          href="/admin/users?f=active7"
          value={active7}
          sub="Hosted or requested"
        />
        <StatTile
          label="Active users (30d)"
          href="/admin/users?f=active30"
          value={active30}
          sub="Hosted or requested"
        />
        <StatTile
          label="Games this week"
          href="/admin/games?f=week"
          value={headline.games7d}
          sub="New hosted matches"
        />
        <StatTile
          label="Notifications unread"
          href="/admin/notifications?f=unread"
          value={headline.unreadNotifications}
          sub={`${headline.totalNotifications} total`}
          tone={headline.unreadNotifications > 5 ? "hot" : "default"}
        />
      </section>

      {/* Bookings + monetisation — new DB tables. Zeroes today, will
          come alive as bookings and reviews start flowing. */}
      <section className="mb-2">
        <p className="text-[11px] font-bold text-primary-500 mb-3">
          Bookings & revenue
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatTile
            label="Booking revenue"
          href="/admin/bookings?f=paid"
            value={`₹${headline.bookingRevenue.toLocaleString("en-IN")}`}
            sub={`from ${headline.paidBookings} paid`}
            tone="accent"
          />
          <StatTile
            label="Total bookings"
          href="/admin/bookings"
            value={headline.totalBookings}
            sub={`+${headline.bookings7d} this week`}
          />
          <StatTile
            label="Pending bookings"
          href="/admin/bookings?f=pending"
            value={headline.pendingBookings}
            sub="Awaiting confirmation"
            tone={headline.pendingBookings > 0 ? "hot" : "default"}
          />
          <StatTile
            label="Verified users"
          href="/admin/users?f=verified"
            value={headline.verifiedUsers}
            sub={`of ${headline.totalUsers} total`}
          />
        </div>
      </section>

      {/* Reviews + notifications snapshot */}
      <section className="mb-8 mt-4">
        <p className="text-[11px] font-bold text-primary-500 mb-3">
          Reviews & notifications
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatTile
            label="Total reviews"
          href="/admin/reviews"
            value={headline.totalReviews}
            sub={headline.totalReviews === 0 ? "None yet" : "In-app reviews"}
          />
          <StatTile
            label="Avg rating"
          href="/admin/reviews"
            value={headline.totalReviews === 0 ? "—" : `★ ${headline.avgRating.toFixed(1)}`}
            sub={headline.totalReviews === 0 ? "No data" : `across ${headline.totalReviews}`}
          />
          <StatTile
            label="Notifications"
          href="/admin/notifications"
            value={headline.totalNotifications}
            sub={`${headline.unreadNotifications} unread`}
          />
          <StatTile
            label="Games (all-time)"
          href="/admin/games"
            value={headline.totalGames}
            sub={`${headline.games30d} in last 30d`}
          />
        </div>
      </section>

      {/* Games: upcoming / live first, then the latest past games. */}
      <section className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <p className="text-xs font-bold text-primary-500">
            Games · {(["upcoming", "live", "expired", "cancelled"] as const)
              .filter((k) => gameCounts[k])
              .map((k) => `${gameCounts[k]} ${k}`)
              .join(" · ") || "none yet"}
          </p>
          <div className="flex gap-3 text-xs font-semibold">
            <Link href="/admin/games?f=upcoming" className="text-accent-600 hover:text-accent-700">Upcoming</Link>
            <Link href="/admin/games?f=expired" className="text-accent-600 hover:text-accent-700">Expired</Link>
            <Link href="/admin/games" className="text-accent-600 hover:text-accent-700">All games</Link>
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
          {gamesShown.length === 0 ? (
            <p className="px-5 py-6 text-sm text-primary-400">No games hosted yet.</p>
          ) : (
            <ul className="divide-y divide-primary-100">
              {gamesShown.map((g) => (
                <li key={g.id}>
                  <Link href={`/game/${g.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-primary-50">
                    <span
                      className={`shrink-0 w-20 text-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        g.state === "upcoming"
                          ? "bg-accent-50 text-accent-700"
                          : g.state === "live"
                            ? "bg-amber-100 text-amber-800"
                            : g.state === "cancelled"
                              ? "bg-hot-500/10 text-hot-600"
                              : "bg-primary-100 text-primary-500"
                      }`}
                    >
                      {g.state}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-primary-900 truncate">
                        {g.sport}{g.turf ? ` at ${g.turf.name}` : ""}
                      </span>
                      <span className="block text-[12px] text-primary-500 truncate">
                        {new Date(`${g.date}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })}
                        {" · "}{g.start_time?.slice(0, 5)} · host {g.host_name || "-"}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-primary-700">
                      {g.current_players}/{g.max_players}
                    </span>
                    {g.requests.pending > 0 && (
                      <span className="shrink-0 text-[11px] font-semibold text-amber-700">{g.requests.pending} pending</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Turf contact taps: how many players reached out to turfs. */}
      <section className="mb-8">
        <p className="text-xs font-bold text-primary-500 mb-3">
          Turf contacts (Call and WhatsApp taps)
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
          <StatTile
            label="Calls, 7 days"
            value={contact7?.calls ?? 0}
            sub={`${contact30?.calls ?? 0} in 30 days`}
            tone="accent"
          />
          <StatTile
            label="WhatsApps, 7 days"
            value={contact7?.whatsapps ?? 0}
            sub={`${contact30?.whatsapps ?? 0} in 30 days`}
            tone="accent"
          />
          <StatTile
            label="Players who reached out, 30d"
            value={contact30?.unique_users ?? 0}
            sub={`across ${contact30?.turfs ?? 0} turfs`}
          />
          <StatTile
            label="Hit login first, 30d"
            value={contact30?.login_prompts ?? 0}
            sub="tapped while signed out"
          />
        </div>
        <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-primary-100 flex items-baseline justify-between">
            <p className="text-xs font-bold text-primary-500">Most contacted turfs, 30 days</p>
            <p className="text-xs text-primary-400">Signed-in taps</p>
          </div>
          {!contact30 || contact30.top.length === 0 ? (
            <p className="px-5 py-6 text-sm text-primary-400">No taps recorded yet. Counting started with this release.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-primary-50 text-[11px] text-primary-500 font-semibold">
                  <tr>
                    <th className="text-left px-4 py-2.5">Turf</th>
                    <th className="text-left px-4 py-2.5">City</th>
                    <th className="text-right px-4 py-2.5">Calls</th>
                    <th className="text-right px-4 py-2.5">WhatsApp</th>
                    <th className="text-right px-4 py-2.5">Login prompts</th>
                  </tr>
                </thead>
                <tbody>
                  {contact30.top.map((t) => (
                    <tr key={t.id} className="border-t border-primary-100">
                      <td className="px-4 py-2.5">
                        <Link href={`/turf/${t.id}`} className="font-medium text-primary-900 hover:text-accent-600">
                          {t.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-primary-500 capitalize">{t.city ?? "-"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{t.calls}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{t.whatsapps}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-primary-400">{t.login_prompts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <BreakdownList title="Games by city" items={gamesByCity} />
        <BreakdownList title="Games by sport" items={gamesBySport} />
        <BreakdownList title="Games by status" items={gamesByStatus} color="#FF385C" />
        <BreakdownList title="Active turfs by city" items={turfsByCity} />
      </section>

      {/* Two-column: recent users + top hosts */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* Recent users */}
        <div className="lg:col-span-2 rounded-2xl bg-white border border-primary-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-primary-100 flex items-baseline justify-between">
            <p className="text-xs font-bold text-primary-500">
              Latest signups
            </p>
            <p className="text-xs text-primary-400">Showing {recentUsers.length}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary-50 text-[11px] text-primary-500 font-semibold">
                <tr>
                  <th className="text-left px-4 py-2.5">Name</th>
                  <th className="text-left px-4 py-2.5">Contact</th>
                  <th className="text-left px-4 py-2.5">Method</th>
                  <th className="text-right px-4 py-2.5">Joined</th>
                </tr>
              </thead>
              <tbody>
                {recentUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-primary-400">
                      No signups yet.
                    </td>
                  </tr>
                )}
                {recentUsers.map((u) => (
                  <tr key={u.id} className="border-t border-primary-100">
                    <td className="px-4 py-3 font-medium text-primary-900">
                      {u.name || <span className="text-primary-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-primary-700">
                      {u.email || u.phone || (
                        <span className="text-primary-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <MethodBadge method={u.method} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-primary-800 font-semibold text-xs">
                          {relativeTime(u.created_at)}
                        </span>
                        <span
                          className="font-mono text-[10px] text-primary-400"
                          title={u.created_at || ""}
                        >
                          {formatDate(u.created_at)}
                          {u.created_at && backfillTs.has(u.created_at) && (
                            <span
                              className="ml-1 text-hot-500"
                              title="This timestamp is shared by multiple rows — likely a batch backfill, not the real signup"
                            >
                              *
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top hosts */}
        <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-primary-100">
            <p className="text-xs font-bold text-primary-500">
              Top hosts
            </p>
          </div>
          <ul>
            {topHosts.length === 0 && (
              <li className="px-5 py-8 text-center text-primary-400 text-sm">
                No games hosted yet.
              </li>
            )}
            {topHosts.map((h, i) => (
              <li
                key={h.id}
                className="border-t border-primary-100 first:border-t-0 px-5 py-3 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-full bg-accent-500 text-white flex items-center justify-center font-display text-sm">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-primary-900 truncate">
                    {h.name || h.email || h.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-primary-500 truncate">
                    {h.email || h.id.slice(0, 8)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl text-primary-900 leading-none">
                    {h.games}
                  </p>
                  <p className="text-[10px] text-primary-400 mt-0.5">
                    games
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="text-xs text-primary-400 text-center mt-10 pb-8 space-y-1">
        <p>
          <span className="text-hot-500">*</span> means the joined date is a
          bulk backfill timestamp shared across multiple rows. The real
          signup date lives in <code>auth.users</code> and isn&apos;t
          exposed here.
        </p>
        <p>Owner-only view. Not indexed. Not linked from anywhere.</p>
      </footer>
    </div>
  );
}

function MethodBadge({ method }: { method: "google" | "phone" | "unknown" }) {
  const cls =
    method === "google"
      ? "bg-accent-50 border-accent-200 text-accent-700"
      : method === "phone"
        ? "bg-primary-100 border-primary-200 text-primary-700"
        : "bg-primary-50 border-primary-100 text-primary-500";
  const label = method === "google" ? "Google" : method === "phone" ? "Phone" : "?";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}
    >
      {label}
    </span>
  );
}
