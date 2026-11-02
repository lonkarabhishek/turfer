import { ChevronRight } from "lucide-react";
import { adminMapUsage } from "@/lib/queries/adminMap";
import { mapLine, mapUseText, type MapCounts, type MapPerson } from "@/lib/map/usage";
import { ago, istDateTime } from "@/lib/admin/people";
import { reasonText } from "@/lib/admin/section";
import { DailyChart } from "./DailyChart";
import { SectionError } from "./SectionStatus";
import type { FoldSummary } from "./AdminSection";

/**
 * The admin home's Map section and its glance line: how many people use
 * /map (the site owner asked on 2 Nov), from admin_map_usage
 * (20261102_map_views.sql, lib/map/views.ts says what counts). Today, 7
 * and 30 days side by side, views per day for 30 days, and the people who
 * used it signed in, each a tap from their row in the people list. Never
 * a phone number or an email. Before the file is applied it says counting
 * hasn't started, and the glance shows nothing.
 */

const fmt = (n: number) => n.toLocaleString("en-IN");
const readTime = () => Date.now();
/** People shown at first; the rest open under "Show". */
const FIRST_PEOPLE = 20;

const dayLabel = (d: string) => new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

const ROWS: { label: string; of: (c: MapCounts) => number; strong?: boolean }[] = [
  { label: "Views", of: (c) => c.views, strong: true },
  { label: "Visitors", of: (c) => c.visitors },
  { label: "Signed-in people", of: (c) => c.signedPeople },
  { label: "Signed-in views", of: (c) => c.signedViews },
  { label: "Cards opened", of: (c) => c.taps },
  { label: "Turf page maps", of: (c) => c.minis },
];

export async function mapSummary(): Promise<FoldSummary> {
  const res = await adminMapUsage();
  if (!res.ok) return { line: res.reason === "not_set_up" ? "Not counting yet: the database needs this release's map file" : reasonText(res.reason) };
  return { line: mapLine(res.data) };
}

/** The Map section: the numbers, the 30 days and the people signed in. */
export async function MapSection() {
  const res = await adminMapUsage();
  if (!res.ok) {
    if (res.reason === "not_set_up") {
      return (
        <p role="status" className="mb-4 rounded-2xl border border-primary-200 bg-white px-4 py-3 text-[13px] text-primary-600">
          Views of the map are counted once this release&rsquo;s database file (20261102_map_views.sql) is applied. Nothing is counted until then.
        </p>
      );
    }
    return <SectionError reason={res.reason} what="the map's numbers" className="mb-4" />;
  }
  const u = res.data;
  const now = readTime();
  const { today, d7, d30 } = u.totals;
  return (
    <section className="mb-4 space-y-4">
      <div className="rounded-2xl border border-primary-200 bg-white overflow-hidden">
        <table className="w-full text-[14px]">
          <caption className="sr-only">The map today, in the last 7 days and in the last 30 days</caption>
          <thead className="bg-primary-50 text-[11px] font-semibold text-primary-500">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold sm:px-4">
                {u.since ? `Counted since ${dayLabel(u.since)}` : "Counting from today"}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">Today</th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">7 days</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold sm:px-4">30 days</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-primary-100">
                <th scope="row" className={`px-3 py-2.5 text-left sm:px-4 ${r.strong ? "font-semibold text-primary-900" : "font-medium text-primary-700"}`}>
                  {r.label}
                </th>
                {[today, d7, d30].map((c, i) => (
                  <td key={i} className={`py-2.5 text-right tabular-nums ${i === 2 ? "px-3 sm:px-4" : "px-2"} ${r.strong ? "font-display text-[20px] leading-none text-primary-900" : "text-primary-800"}`}>
                    {fmt(r.of(c))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="-mt-2 px-1 text-[12px] leading-snug text-primary-500">
        A view is the map opened and on screen; the same browser again within 30 minutes is the same view. Visitors: each browser once a day, added up. Cards
        opened: a turf or game opened from the map. Turf page maps: &ldquo;This turf on the map&rdquo; opened on a turf page. Bots aren&rsquo;t counted.
      </p>

      <div className="rounded-2xl border border-primary-200 bg-white p-4 sm:p-5">
        <DailyChart points={u.daily.map((d) => ({ date: d.day, count: d.views }))} label="Views of the map, last 30 days" color="#00A699" />
      </div>

      <div className="rounded-2xl border border-primary-200 bg-white overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 border-b border-primary-100 px-4 py-3">
          <h3 className="text-xs font-bold text-primary-500">Signed in on the map</h3>
          <p className="text-xs text-primary-400 tabular-nums">{u.peopleTotal === 1 ? "1 person" : `${fmt(u.peopleTotal)} people`}, latest first</p>
        </div>
        {u.people.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-primary-400">Nobody signed in has used the map yet.</p>
        ) : (
          <>
            <PeopleList people={u.people.slice(0, FIRST_PEOPLE)} now={now} />
            {u.people.length > FIRST_PEOPLE && (
              <details className="group border-t border-primary-100">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center px-4 text-[13px] font-semibold text-accent-700 hover:bg-primary-50 [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show {fmt(u.people.length - FIRST_PEOPLE)} more</span>
                  <span className="hidden group-open:inline">Show fewer</span>
                </summary>
                <PeopleList people={u.people.slice(FIRST_PEOPLE)} now={now} />
              </details>
            )}
            {u.peopleTotal > u.people.length && (
              <p className="border-t border-primary-100 px-4 py-2.5 text-[12px] text-primary-500">The latest {fmt(u.people.length)} of {fmt(u.peopleTotal)} are listed.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PeopleList({ people, now }: { people: MapPerson[]; now: number }) {
  return (
    <ul className="divide-y divide-primary-100">
      {people.map((p) => {
        const inner = (
          <>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className={`font-semibold break-words ${p.name ? "text-primary-900" : "text-primary-400"}`}>{p.name ?? "No name"}</span>
                {p.username && <span className="min-w-0 truncate text-[13px] text-primary-500">@{p.username}</span>}
              </span>
              <span className="block text-[12px] text-primary-600">
                {mapUseText(p)}
                {p.days > 1 ? ` · ${fmt(p.days)} days` : ""}
              </span>
            </span>
            <span className="shrink-0 text-right text-[12px] text-primary-500" title={p.lastAt !== null ? istDateTime(p.lastAt) : undefined}>
              {p.lastAt !== null ? ago(p.lastAt, now) : ""}
            </span>
          </>
        );
        return (
          <li key={p.id}>
            {/* Their row in the people list (an erased account has none). */}
            {p.known ? (
              <a href={`/admin?person=${p.id}#people`} className="flex items-center gap-3 px-4 py-3 hover:bg-primary-50 focus-neon">
                {inner}
                <ChevronRight className="h-4 w-4 shrink-0 text-primary-300" aria-hidden />
              </a>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The glance's map line: today's views and visitors, and who signed in this week. Nothing before counting starts. */
export async function MapGlance() {
  const res = await adminMapUsage();
  if (!res.ok && res.reason === "not_set_up") return null;
  const t = res.ok ? res.data.totals : null;
  const chip = "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-50 px-2 py-1 text-center text-[12px] leading-tight text-primary-800 sm:min-h-10 sm:rounded-full sm:px-3 sm:text-[13px]";
  // Each chip: its number (bold) and what it counts.
  const items: [string, string][] = t
    ? [
        [fmt(t.today.views), `${t.today.views === 1 ? "view" : "views"} today`],
        [fmt(t.today.visitors), t.today.visitors === 1 ? "visitor" : "visitors"],
        [fmt(t.d7.signedPeople), "signed in, 7d"],
      ]
    : [
        ["-", "views today"],
        ["-", "visitors"],
        ["-", "signed in"],
      ];
  return (
    // A plain anchor: the browser's own jump (and its hashchange) opens the Map fold (components/admin/Fold.tsx).
    <a href="#map" className="block rounded-2xl border border-primary-200 bg-white p-3 hover:bg-primary-50/60 focus-neon sm:flex sm:items-center sm:gap-3 sm:px-4 sm:py-2">
      <span className="mb-2 flex items-center justify-between text-[13px] font-bold text-primary-500 sm:mb-0 sm:shrink-0">
        Map
        <ChevronRight className="h-4 w-4 text-primary-400 sm:hidden" aria-hidden />
      </span>
      <span className="grid grid-cols-3 gap-2 sm:flex sm:flex-1 sm:flex-wrap">
        {items.map(([n, what]) => (
          <span key={what} className={chip}>
            <span>
              <b className="font-bold tabular-nums text-primary-900">{n}</b> {what}
            </span>
          </span>
        ))}
      </span>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-primary-400 sm:block" aria-hidden />
      {!res.ok && <span className="sr-only">{reasonText(res.reason)}</span>}
    </a>
  );
}
