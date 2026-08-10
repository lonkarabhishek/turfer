import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/admin/auth";
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
} from "@/lib/queries/admin";
import { StatTile } from "@/components/admin/StatTile";
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

export default async function AdminPage() {
  // Owner-only guard. Any non-admin sees a 404. We deliberately don't
  // redirect or flash a "you're not allowed" message — the page just
  // doesn't exist as far as anyone else is concerned.
  const allowed = await isAdmin();
  if (!allowed) notFound();

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
  ]);

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
          <p className="text-xs font-bold uppercase tracking-widest text-accent-600 mb-2">
            Owner only
          </p>
          <h1 className="font-display uppercase tracking-tight text-primary-900 text-4xl md:text-5xl leading-none">
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
            className="rounded-full bg-primary-900 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 hover:bg-primary-800"
          >
            Refresh
          </Link>
          <Link
            href="/"
            className="rounded-full border border-primary-200 text-primary-800 text-xs font-bold uppercase tracking-widest px-4 py-2 hover:bg-primary-50"
          >
            Back to site
          </Link>
        </div>
      </div>

      {/* Top-line tiles */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
        <StatTile
          label="Unique people"
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
          value={headline.totalUsers}
          sub="Raw row count"
        />
        <StatTile
          label="Total games"
          value={headline.totalGames}
          sub={`+${headline.games7d} this week`}
        />
        <StatTile label="Active turfs" value={headline.activeTurfs} />
      </section>

      {/* Signups + notifications tiles */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        <StatTile
          label="Unique signups (7d)"
          value={headline.uniqueSignups7d}
          sub={`${headline.signups7d} rows`}
        />
        <StatTile
          label="Unique signups (30d)"
          value={headline.uniqueSignups30d}
          sub={`${headline.signups30d} rows`}
        />
        <StatTile
          label="Requests"
          value={headline.totalRequests}
          sub="All-time"
        />
        <StatTile
          label="Notifications"
          value={headline.totalNotifications}
          sub={`${headline.unreadNotifications} unread`}
        />
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
          value={active7}
          sub="Hosted or requested"
        />
        <StatTile
          label="Active users (30d)"
          value={active30}
          sub="Hosted or requested"
        />
        <StatTile
          label="Games (30d)"
          value={headline.games30d}
          sub={`${headline.games7d} in last 7d`}
        />
        <StatTile
          label="Games (all-time)"
          value={headline.totalGames}
        />
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
            <p className="text-xs font-bold uppercase tracking-widest text-primary-500">
              Latest signups
            </p>
            <p className="text-xs text-primary-400">Showing {recentUsers.length}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary-50 text-[11px] uppercase tracking-widest text-primary-500 font-semibold">
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
            <p className="text-xs font-bold uppercase tracking-widest text-primary-500">
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
                  <p className="text-[10px] uppercase tracking-widest text-primary-400 mt-0.5">
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${cls}`}
    >
      {label}
    </span>
  );
}
