import Link from "next/link";
import {
  activeTurfCount,
  activeUserNumbers,
  bookingNumbers,
  gameNumbers,
  gamesByCitySection,
  getContactClickStats,
  getTopHosts,
  notificationNumbers,
  peopleNumbers,
  reviewNumbers,
  turfsByCitySection,
} from "@/lib/queries/admin";
import { getAdminGames } from "@/lib/queries/adminDetail";
import { getPendingSuggestions } from "@/lib/queries/adminSuggestions";
import { getAskTranscripts } from "@/lib/queries/adminAsks";
import { getRecentLogins, loginStats } from "@/lib/queries/adminLogins";
import { adminTickRows, signupPeople } from "@/lib/queries/adminUsers";
import { getToolUsage } from "@/lib/queries/adminTools";
import { personId, tickTotals, tickedOnly } from "@/lib/admin/people";
import { reasonText, type Reason, type Section } from "@/lib/admin/section";
import { StatTile } from "./StatTile";
import { DailyChart } from "./DailyChart";
import { SignupsTrend } from "./SignupsTrend";
import { BreakdownList } from "./BreakdownList";
import { SectionError, SomeFailed } from "./SectionStatus";
import { turfPath } from "@/lib/utils/turfPath";

/**
 * The admin home's sections (server components). Each awaits only its own
 * reads, which are settled (lib/admin/db.ts): a number that couldn't be read
 * shows "-" with why, and the section offers a retry; nothing here throws.
 * Reads several sections share are made once per render.
 */

const DASH = "-";
const valueOf = <T,>(s: Section<T>, f: (d: T) => string | number): string | number => (s.ok ? f(s.data) : DASH);
const subOf = <T,>(s: Section<T>, f: (d: T) => string | undefined): string | undefined => (s.ok ? f(s.data) : reasonText(s.reason));
const failures = (...sections: Section<unknown>[]) => sections.filter((s) => !s.ok).length;

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const dayLabel = (d: string | null) => (d ? new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "");

function loginsUnavailable(reason: Reason): string {
  if (reason === "not_set_up") return "Login log not set up yet";
  if (reason === "not_allowed") return "Sign in with Google to view";
  return reasonText(reason);
}

/** Turf contact taps, first: how many players reached out to turfs. */
export async function ContactsSection() {
  const [c7, c30] = await Promise.all([getContactClickStats(7), getContactClickStats(30)]);
  return (
    <section className="mb-8">
      <p className="text-xs font-bold text-primary-500 mb-3">Turf contacts (Call and WhatsApp taps)</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
        <StatTile label="Calls, 7 days" value={valueOf(c7, (d) => d.calls)} sub={subOf(c30, (d) => `${d.calls} in 30 days`)} tone="accent" />
        <StatTile label="WhatsApps, 7 days" value={valueOf(c7, (d) => d.whatsapps)} sub={subOf(c30, (d) => `${d.whatsapps} in 30 days`)} tone="accent" />
        <StatTile label="Players who reached out, 30d" value={valueOf(c30, (d) => d.unique_users)} sub={subOf(c30, (d) => `across ${d.turfs} turfs`)} />
        <StatTile label="Hit login first, 30d" value={valueOf(c30, (d) => d.login_prompts)} sub={c30.ok ? "tapped while signed out" : reasonText(c30.reason)} />
      </div>
      <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-primary-100 flex items-baseline justify-between">
          <p className="text-xs font-bold text-primary-500">Most contacted turfs, 30 days</p>
          <p className="text-xs text-primary-400">Signed-in taps</p>
        </div>
        {!c30.ok ? (
          <div className="p-4">
            <SectionError reason={c30.reason} what="the contact taps" />
          </div>
        ) : c30.data.top.length === 0 ? (
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
                {c30.data.top.map((t) => (
                  <tr key={t.id} className="border-t border-primary-100">
                    <td className="px-4 py-2.5">
                      <Link href={turfPath(t)} className="font-medium text-primary-900 hover:text-accent-600">
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
      {c30.ok && <SomeFailed count={failures(c7)} className="mt-2" />}
    </section>
  );
}

/** People, games and turfs: the top-line tiles. */
export async function HeadlineSection() {
  const [people, games, turfs] = await Promise.all([peopleNumbers(), gameNumbers(), activeTurfCount()]);
  return (
    <section className="mb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatTile
          label="Unique people"
          href="/admin/users"
          value={valueOf(people, (p) => p.uniquePeople)}
          sub={subOf(people, (p) => (p.duplicateUsers > 0 ? `${p.duplicateUsers} duplicate row${p.duplicateUsers === 1 ? "" : "s"} merged` : "No duplicates"))}
          tone="accent"
        />
        <StatTile
          label="Total users"
          href="/admin/users"
          value={valueOf(people, (p) => p.totalUsers)}
          sub={subOf(people, (p) =>
            p.unfinishedSignups > 0 ? `Raw row count, with ${p.unfinishedSignups} Google sign-up${p.unfinishedSignups === 1 ? "" : "s"} that didn't finish` : "Raw row count",
          )}
        />
        <StatTile label="Total games" href="/admin/games" value={valueOf(games, (g) => g.totalGames)} sub={subOf(games, (g) => `+${g.games7d} this week`)} />
        <StatTile label="Active turfs" href="/admin/turfs" value={valueOf(turfs, (n) => n)} sub={turfs.ok ? undefined : reasonText(turfs.reason)} />
      </div>
      <SomeFailed count={failures(people, games, turfs)} className="mt-2" />
    </section>
  );
}

/** Sign-ins. */
export async function LoginsSection() {
  const logins = await getRecentLogins(300);
  const nums = logins.ok ? loginStats(logins.rows) : null;
  const last = nums?.latest;
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
      <StatTile
        label="Logins (24h)"
        href="/admin/logins?f=today"
        value={nums ? nums.today : DASH}
        sub={nums ? "Phone + Google sign-ins" : logins.ok ? "" : loginsUnavailable(logins.reason)}
      />
      <StatTile label="Logins (7d)" href="/admin/logins?f=week" value={nums ? nums.week : DASH} sub={nums ? `${nums.peopleWeek} ${nums.peopleWeek === 1 ? "person" : "people"}` : undefined} />
      <div className="col-span-2">
        <StatTile
          label="Latest login"
          href="/admin/logins"
          compact
          value={last ? last.name || last.phone || last.email || "Unknown" : DASH}
          sub={last ? `${timeAgo(last.logged_in_at)} · ${last.method === "google" ? "Google" : "Phone"}` : logins.ok ? "Tap to see every sign-in" : loginsUnavailable(logins.reason)}
        />
      </div>
      {!logins.ok && logins.reason !== "not_set_up" && <SomeFailed count={3} className="col-span-2 md:col-span-4" />}
    </section>
  );
}

/** Live scoreboard links and the tools' counted uses (counted since 26 Oct 2026, lib/tools/usage.ts). */
export async function ToolsSection() {
  const { live, uses } = await getToolUsage();
  const n = (r: Record<string, number> | undefined, ...keys: string[]) => keys.reduce((s, k) => s + (r?.[k] ?? 0), 0);
  const since = uses?.since ? `Counted since ${dayLabel(uses.since)}` : "Counting from today";
  const scorecards = n(uses?.started, "live_scorer", "live_scoreboard");
  const sports = Object.entries(uses?.boardSports ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s, c]) => `${s} ${c}`)
    .join(", ");
  const others: [string, string][] = [["nrr_calculator", "NRR"], ["team_generator", "Teams"], ["tournament_scorer", "Tournaments"], ["scorecard_maker", "Scorecard images"]];
  const otherTotal = n(uses?.started, ...others.map(([k]) => k));
  return (
    <>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4">
        <StatTile label="Live scoreboards shared" href="/admin/live" value={live ? live.total : DASH} sub={live ? `+${live.last7} this week · ${live.liveNow} live now` : "Couldn't load"} />
        {/* The other three open Tool users: who used each tool and what (from 27 Oct 2026). */}
        <StatTile
          label="Scorecards started"
          href="/admin/tools"
          value={uses ? scorecards : DASH}
          sub={uses ? `${n(uses.finished, "live_scorer", "live_scoreboard")} finished${sports ? ` · ${sports}` : ""} · ${since}` : "Couldn't load"}
        />
        <StatTile label="Coin tosses" href="/admin/tools?tool=toss" value={uses ? n(uses.started, "toss") : DASH} sub={uses ? `${n(uses.started7, "toss")} this week · ${since}` : "Couldn't load"} />
        <StatTile label="Other tools" href="/admin/tools" value={uses ? otherTotal : DASH} sub={uses ? others.map(([k, name]) => `${name} ${n(uses.started, k)}`).join(" · ") : "Couldn't load"} />
      </section>
      <div className="-mt-1 mb-4 flex flex-wrap items-center justify-end gap-3">
        <SomeFailed count={(live ? 0 : 1) + (uses ? 0 : 3)} />
        <Link href="/admin/tools" className="text-xs font-semibold text-accent-600 hover:text-accent-700">
          Who used the tools, and what
        </Link>
      </div>
    </>
  );
}

/**
 * Sign-up windows, the verified tick, Ask and the suggestions queue
 * (requests + notifications are further down in the reviews snapshot).
 */
export async function SignupWindowsSection() {
  const [people, tickRows, asks, suggestions] = await Promise.all([peopleNumbers(), adminTickRows(), getAskTranscripts(7), getPendingSuggestions(500)]);
  const ticks = tickTotals(tickRows);
  const asks7d = asks.ok ? asks.rows.length : null;
  const askVisitors = asks.ok ? new Set(asks.rows.map((r) => r.ip_hash)).size : 0;
  const pending = suggestions.ok ? suggestions.rows.length : null;
  return (
    <section className="mb-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatTile label="Unique signups (7d)" href="/admin/users?f=new7" value={valueOf(people, (p) => p.uniqueSignups7d)} sub={subOf(people, (p) => `${p.signups7d} rows`)} />
        <StatTile label="Unique signups (30d)" href="/admin/users?f=new30" value={valueOf(people, (p) => p.uniqueSignups30d)} sub={subOf(people, (p) => `${p.signups30d} rows`)} />
        <StatTile
          label="Duplicate accounts"
          href="/admin/users?f=duplicates"
          value={valueOf(people, (p) => p.duplicateUsers)}
          sub={subOf(people, (p) => (p.duplicateUsers === 0 ? "Clean" : "Same person, 2+ rows"))}
        />
        {/* The tick players see: a phone proved by an OTP and an email by Google (admin_ticks). Opens the people list on them. */}
        <StatTile
          label="Verified tick"
          href="/admin?people=verified#people"
          value={ticks ? ticks.verified : DASH}
          sub={ticks ? `of ${ticks.accounts} accounts · ${ticks.phone} phone proved · ${ticks.email} email by Google` : "Couldn't load"}
        />
        <StatTile
          label="Ask TapTurf (7d)"
          href="/admin/asks"
          value={asks7d ?? DASH}
          sub={asks.ok ? (asks7d === 0 ? "No chats yet" : `${askVisitors} visitor${askVisitors === 1 ? "" : "s"}`) : reasonText(asks.reason)}
        />
        <StatTile
          label="Player suggestions"
          href="/admin/suggestions"
          value={pending ?? DASH}
          sub={suggestions.ok ? (pending === 0 ? "Queue is clear" : "Pending your approval") : reasonText(suggestions.reason)}
          tone={pending ? "accent" : "default"}
        />
      </div>
      <SomeFailed count={(people.ok ? 0 : 3) + (ticks ? 0 : 1) + (asks.ok ? 0 : 1) + (suggestions.ok ? 0 : 1)} className="mt-2" />
    </section>
  );
}

/** The sign-ups chart and the people list (a failed read shows a message there, never a broken page). */
export async function SignupsSection({ person, people: filter }: { person?: string | string[]; people?: string | string[] }) {
  const people = await signupPeople();
  // A new read (Refresh) starts the chart afresh at its "now".
  return (
    <div className="mb-4">
      <SignupsTrend key={people.readAt} people={people.people} now={people.readAt} focus={personId(person)} verifiedOnly={tickedOnly(filter)} />
    </div>
  );
}

/** Games created per day. */
export async function DailyGamesSection() {
  const games = await gameNumbers();
  return (
    <section className="mb-8">
      <div className="rounded-2xl bg-white border border-primary-200 p-5">
        <DailyChart points={games.ok ? games.data.daily : []} failed={games.ok ? undefined : games.reason} label="Games created, last 30 days" color="#FF385C" />
      </div>
    </section>
  );
}

/** Active users, games this week and unread notifications. */
export async function ActivitySection() {
  const [active, games, notes] = await Promise.all([activeUserNumbers(), gameNumbers(), notificationNumbers()]);
  return (
    <section className="mb-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatTile label="Active users (7d)" href="/admin/users?f=active7" value={valueOf(active, (a) => a.active7)} sub={active.ok ? "Hosted or requested" : reasonText(active.reason)} />
        <StatTile label="Active users (30d)" href="/admin/users?f=active30" value={valueOf(active, (a) => a.active30)} sub={active.ok ? "Hosted or requested" : reasonText(active.reason)} />
        <StatTile label="Games this week" href="/admin/games?f=week" value={valueOf(games, (g) => g.games7d)} sub={games.ok ? "New hosted matches" : reasonText(games.reason)} />
        <StatTile
          label="Notifications unread"
          href="/admin/notifications?f=unread"
          value={valueOf(notes, (n) => n.unread)}
          sub={subOf(notes, (n) => `${n.total} total`)}
          tone={notes.ok && notes.data.unread > 5 ? "hot" : "default"}
        />
      </div>
      <SomeFailed count={(active.ok ? 0 : 2) + failures(games, notes)} className="mt-2" />
    </section>
  );
}

/** Bookings + monetisation. Zeroes today; they come alive as bookings start flowing. */
export async function BookingsSection() {
  const [bookings, people] = await Promise.all([bookingNumbers(), peopleNumbers()]);
  return (
    <section className="mb-2">
      <p className="text-[11px] font-bold text-primary-500 mb-3">Bookings & revenue</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatTile
          label="Booking revenue"
          href="/admin/bookings?f=paid"
          value={valueOf(bookings, (b) => `₹${b.bookingRevenue.toLocaleString("en-IN")}`)}
          sub={subOf(bookings, (b) => `from ${b.paidBookings} paid`)}
          tone="accent"
        />
        <StatTile label="Total bookings" href="/admin/bookings" value={valueOf(bookings, (b) => b.totalBookings)} sub={subOf(bookings, (b) => `+${b.bookings7d} this week`)} />
        <StatTile
          label="Pending bookings"
          href="/admin/bookings?f=pending"
          value={valueOf(bookings, (b) => b.pendingBookings)}
          sub={bookings.ok ? "Awaiting confirmation" : reasonText(bookings.reason)}
          tone={bookings.ok && bookings.data.pendingBookings > 0 ? "hot" : "default"}
        />
        <StatTile
          label="Confirmed at sign-in"
          href="/admin/users?f=verified"
          value={valueOf(people, (p) => p.verifiedUsers)}
          sub={subOf(people, (p) => `of ${p.totalUsers - p.unfinishedSignups} accounts`)}
        />
      </div>
      <SomeFailed count={(bookings.ok ? 0 : 3) + failures(people)} className="mt-2" />
    </section>
  );
}

/** Reviews + notifications snapshot. */
export async function ReviewsSection() {
  const [reviews, notes, games] = await Promise.all([reviewNumbers(), notificationNumbers(), gameNumbers()]);
  const none = reviews.ok && reviews.data.totalReviews === 0;
  return (
    <section className="mb-8 mt-4">
      <p className="text-[11px] font-bold text-primary-500 mb-3">Reviews & notifications</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatTile label="Total reviews" href="/admin/reviews" value={valueOf(reviews, (r) => r.totalReviews)} sub={subOf(reviews, (r) => (r.totalReviews === 0 ? "None yet" : "In-app reviews"))} />
        <StatTile
          label="Avg rating"
          href="/admin/reviews"
          value={reviews.ok ? (none ? "—" : `★ ${reviews.data.avgRating.toFixed(1)}`) : DASH}
          sub={subOf(reviews, (r) => (r.totalReviews === 0 ? "No data" : `across ${r.totalReviews}`))}
        />
        <StatTile label="Notifications" href="/admin/notifications" value={valueOf(notes, (n) => n.total)} sub={subOf(notes, (n) => `${n.unread} unread`)} />
        <StatTile label="Games (all-time)" href="/admin/games" value={valueOf(games, (g) => g.totalGames)} sub={subOf(games, (g) => `${g.games30d} in last 30d`)} />
      </div>
      <SomeFailed count={(reviews.ok ? 0 : 2) + failures(notes, games)} className="mt-2" />
    </section>
  );
}

/** Games: upcoming / live first, then the latest past games. */
export async function GamesListSection() {
  const res = await getAdminGames("all", 200);
  const adminGames = res.ok ? res.data : [];
  const gameCounts = adminGames.reduce<Record<string, number>>((m, g) => ((m[g.state] = (m[g.state] ?? 0) + 1), m), {});
  const gamesShown = [
    ...adminGames.filter((g) => g.state === "live"),
    ...adminGames.filter((g) => g.state === "upcoming").reverse(),
    ...adminGames.filter((g) => g.state === "expired" || g.state === "cancelled"),
  ].slice(0, 12);
  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <p className="text-xs font-bold text-primary-500">
          Games ·{" "}
          {res.ok
            ? (["upcoming", "live", "expired", "cancelled"] as const)
                .filter((k) => gameCounts[k])
                .map((k) => `${gameCounts[k]} ${k}`)
                .join(" · ") || "none yet"
            : DASH}
        </p>
        <div className="flex gap-3 text-xs font-semibold">
          <Link href="/admin/games?f=upcoming" className="text-accent-600 hover:text-accent-700">Upcoming</Link>
          <Link href="/admin/games?f=expired" className="text-accent-600 hover:text-accent-700">Expired</Link>
          <Link href="/admin/games" className="text-accent-600 hover:text-accent-700">All games</Link>
        </div>
      </div>
      <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
        {!res.ok ? (
          <div className="p-4">
            <SectionError reason={res.reason} what="the games" />
          </div>
        ) : gamesShown.length === 0 ? (
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
                      {g.sport}
                      {g.turf ? ` at ${g.turf.name}` : ""}
                    </span>
                    <span className="block text-[12px] text-primary-500 truncate">
                      {new Date(`${g.date}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })}
                      {" · "}
                      {g.start_time?.slice(0, 5)} · host {g.host_name || "-"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-primary-700">
                    {g.current_players}/{g.max_players}
                  </span>
                  {g.requests.pending > 0 && <span className="shrink-0 text-[11px] font-semibold text-amber-700">{g.requests.pending} pending</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Games by city, sport and status, and active turfs by city. */
export async function BreakdownsSection() {
  const [byCity, games, turfs] = await Promise.all([gamesByCitySection(), gameNumbers(), turfsByCitySection()]);
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <BreakdownList title="Games by city" items={byCity.ok ? byCity.data : []} failed={byCity.ok ? undefined : byCity.reason} />
      <BreakdownList title="Games by sport" items={games.ok ? games.data.bySport : []} failed={games.ok ? undefined : games.reason} />
      <BreakdownList title="Games by status" items={games.ok ? games.data.byStatus : []} failed={games.ok ? undefined : games.reason} color="#FF385C" />
      <BreakdownList title="Active turfs by city" items={turfs.ok ? turfs.data : []} failed={turfs.ok ? undefined : turfs.reason} />
    </section>
  );
}

/** Top hosts (the people who signed up are in the Sign-ups section). */
export async function TopHostsSection() {
  const hosts = await getTopHosts(10);
  return (
    <section className="mb-8">
      <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-primary-100">
          <p className="text-xs font-bold text-primary-500">Top hosts</p>
        </div>
        {!hosts.ok ? (
          <div className="p-4">
            <SectionError reason={hosts.reason} what="the top hosts" />
          </div>
        ) : (
          <ul className="grid sm:grid-cols-2">
            {hosts.data.length === 0 && <li className="sm:col-span-2 px-5 py-8 text-center text-primary-400 text-sm">No games hosted yet.</li>}
            {hosts.data.map((h, i) => (
              <li key={h.id} className="border-t border-primary-100 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 px-5 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-accent-500 text-white flex items-center justify-center font-display text-sm">{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-primary-900 truncate">{h.name || h.email || h.id.slice(0, 8)}</p>
                  <p className="text-xs text-primary-500 truncate">{h.email || h.id.slice(0, 8)}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-xl text-primary-900 leading-none">{h.games}</p>
                  <p className="text-[10px] text-primary-400 mt-0.5">games</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
