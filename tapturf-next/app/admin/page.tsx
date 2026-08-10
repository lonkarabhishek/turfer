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
    hour: "2-digit",
    minute: "2-digit",
  });
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
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
        <StatTile
          label="Total users"
          value={headline.totalUsers}
          sub={`+${headline.signups7d} this week`}
          tone="accent"
        />
        <StatTile
          label="Total games"
          value={headline.totalGames}
          sub={`+${headline.games7d} this week`}
        />
        <StatTile label="Active turfs" value={headline.activeTurfs} />
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

      {/* Activity + breakdowns */}
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
        <StatTile label="Signups (30d)" value={headline.signups30d} />
        <StatTile
          label="Requests"
          value={headline.totalRequests}
          sub="All-time"
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
                    <td className="px-4 py-3 text-right text-primary-500 font-mono text-xs">
                      {formatDate(u.created_at)}
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

      <footer className="text-xs text-primary-400 text-center mt-10 pb-8">
        Owner-only view. Not indexed. Not linked from anywhere.
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
