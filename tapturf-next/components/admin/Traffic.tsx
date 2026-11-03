import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { adminTraffic } from "@/lib/queries/adminTraffic";
import { KIND_LABEL, SOURCE_LABEL, changeText, dayLabel, shareText, trafficLine, type KindRow, type PageRow, type SourceRow, type TrafficUsage, type TrafficWindow } from "@/lib/traffic/usage";
import { reasonText } from "@/lib/admin/section";
import { SectionError } from "./SectionStatus";
import { TrafficChart } from "./TrafficChart";
import { TrafficTabs } from "./TrafficTabs";
import type { FoldSummary } from "./AdminSection";

/**
 * The admin home's Traffic section and its glance line: how many visits
 * and page views the site has, what people open and where they come from
 * (the site owner asked on 3 Nov), from admin_traffic
 * (20261104_traffic.sql; lib/traffic/traffic.ts says what counts). Counted
 * by TapTurf itself, with or without cookie consent, so these are the real
 * totals, not Google Analytics' share of them. Today and the last 7 full
 * days against the 7 before, visits a day for 30 days, then by source and
 * by page for today, 7 or 30 days, the top pages and other sites. Names
 * nobody. Before the file is applied it says counting hasn't started, and
 * the glance shows nothing.
 */

const fmt = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
/** Pages shown at first; the rest open under "Show". */
const FIRST_PAGES = 10;

export async function trafficSummary(): Promise<FoldSummary> {
  const res = await adminTraffic();
  if (!res.ok) return { line: res.reason === "not_set_up" ? "Not counting yet: the database needs this release's traffic file" : reasonText(res.reason) };
  return { line: trafficLine(res.data) };
}

/** A change against the stretch before, coloured by its direction. */
function Change({ text, vs }: { text: string | null; vs: string }) {
  if (!text) return null;
  const tone = text.startsWith("+") || text === "new" ? "text-accent-700" : text.startsWith("−") ? "text-hot-600" : "text-primary-700";
  return (
    <span className="text-[12px] leading-tight text-primary-500">
      <b className={`font-bold ${tone}`}>{text}</b> {vs}
    </span>
  );
}

/** The Traffic section: the numbers, the 30 days, where visits come from and what people open. */
export async function TrafficSection() {
  const res = await adminTraffic();
  if (!res.ok) {
    if (res.reason === "not_set_up") {
      return (
        <p role="status" className="mb-4 rounded-2xl border border-primary-200 bg-white px-4 py-3 text-[13px] text-primary-600">
          Visits and page views are counted once this release&rsquo;s database file (20261104_traffic.sql) is applied. Nothing is counted until then.
        </p>
      );
    }
    return <SectionError reason={res.reason} what="the traffic numbers" className="mb-4" />;
  }
  const u = res.data;
  if (!u.since) {
    return (
      <p role="status" className="mb-4 rounded-2xl border border-primary-200 bg-white px-4 py-3 text-[13px] text-primary-600">
        Counting has started: the first visit will show here. <Note />
      </p>
    );
  }
  const { today, yesterday, d7, prev7, d30 } = u.totals;
  const lists = (w: TrafficWindow) => <Lists u={u} w={w} />;
  return (
    <section className="mb-4 space-y-4">
      {/* Today so far, and the last 7 full days against the 7 before them. */}
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 rounded-2xl border border-primary-200 bg-white p-3 sm:p-4">
          <p className="text-[12px] font-semibold text-primary-500">Today so far</p>
          <p className="mt-1 font-display text-[34px] leading-none text-primary-900">{fmt(today.visits)}</p>
          <p className="mt-0.5 text-[13px] font-semibold text-primary-700">{today.visits === 1 ? "visit" : "visits"}</p>
          <p className="mt-2 text-[12px] leading-snug text-primary-600">
            {plural(today.views, "page view")}
            <br />
            Yesterday: {plural(yesterday.visits, "visit")}, {fmt(yesterday.views)} views
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-primary-200 bg-white p-3 sm:p-4">
          <p className="text-[12px] font-semibold text-primary-500">Last 7 days</p>
          <p className="mt-1 font-display text-[34px] leading-none text-primary-900">{fmt(d7.visits)}</p>
          <p className="mt-0.5 text-[13px] font-semibold text-primary-700">{d7.visits === 1 ? "visit" : "visits"}</p>
          <p className="mt-2 flex flex-col gap-0.5 text-[12px] leading-snug text-primary-600">
            <Change text={changeText(d7.visits, prev7.visits)} vs={`vs ${fmt(prev7.visits)} the 7 days before`} />
            <span>
              {plural(d7.views, "page view")} <Change text={changeText(d7.views, prev7.views)} vs="" />
            </span>
          </p>
        </div>
      </div>
      <p className="-mt-2 px-1 text-[12px] leading-snug text-primary-500">
        7 days: yesterday and the 6 days before (today is still going). 30 days: {plural(d30.visits, "visit")}, {plural(d30.views, "page view")}. Signed in:{" "}
        {shareText(d7.signedViews, d7.views)} of the 7 days&rsquo; page views. Counted since {dayLabel(u.since)}.
      </p>

      <div className="rounded-2xl border border-primary-200 bg-white p-4 sm:p-5">
        <h3 className="mb-1 text-xs font-bold text-primary-500">Visits a day, last 30 days</h3>
        <TrafficChart days={u.daily.map((d) => ({ day: d.day, label: dayLabel(d.day), visits: d.visits, views: d.views }))} />
      </div>

      <TrafficTabs
        panels={{ today: lists("today"), d7: lists("d7"), d30: lists("d30") }}
        note={{ today: "Today so far.", d7: "Yesterday and the 6 days before.", d30: "Yesterday and the 29 days before." }}
      />

      <TopPages pages={u.pages} total={u.pagesTotal} />
      <OtherSites u={u} />

      <p className="px-1 text-[12px] leading-snug text-primary-500">
        <Note />
      </p>
    </section>
  );
}

/** What is and is not counted, in a few lines. */
function Note() {
  return (
    <>
      A visit is someone arriving from outside TapTurf: a search, an app, another site or a typed address. Moving to another page, a reload or
      Back is a page view, not a new visit; someone who arrives again later is a new visit, since nothing is kept on their phone to tell. No
      cookies, no IP addresses stored. Bots, the admin and your own signed-in browsing aren&rsquo;t counted.
    </>
  );
}

/** One row of a list: its name, a bar for its share, the count and the share. */
function Row({ label, value, share, sub, max }: { label: string; value: number; share: string; sub?: string; max: number }) {
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-[14px] font-medium text-primary-900">{label}</span>
        <span className="shrink-0 text-[14px] tabular-nums text-primary-900">
          <b className="font-semibold">{fmt(value)}</b> <span className="text-[12px] text-primary-500">{share}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary-100" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: "#008C80" }} />
      </div>
      {sub && <p className="mt-1 text-[12px] text-primary-500">{sub}</p>}
    </li>
  );
}

function Card({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-primary-200 bg-white">
      <div className="flex items-baseline justify-between gap-2 border-b border-primary-100 px-4 py-3">
        <h3 className="text-xs font-bold text-primary-500">{title}</h3>
        {aside && <p className="text-xs tabular-nums text-primary-400">{aside}</p>}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="px-4 py-5 text-[13px] text-primary-400">{text}</p>;

/** Where visits come from and what people open, for one window. */
function Lists({ u, w }: { u: TrafficUsage; w: TrafficWindow }) {
  const src: SourceRow[] = u.bySource[w];
  const visits = src.reduce((s, r) => s + r.visits, 0);
  const arrivals = src.filter((r) => r.visits > 0);
  const internal = src.find((r) => r.source === "internal");
  const kinds: KindRow[] = u.byKind[w];
  const views = kinds.reduce((s, r) => s + r.views, 0);
  return (
    <>
      <Card title="Where visits come from" aside={plural(visits, "visit")}>
        {arrivals.length === 0 ? (
          <Empty text="No visits in these days." />
        ) : (
          <ul className="divide-y divide-primary-100">
            {arrivals.map((r) => (
              <Row
                key={r.source}
                label={SOURCE_LABEL[r.source]}
                value={r.visits}
                share={shareText(r.visits, visits)}
                max={arrivals[0].visits}
                sub={r.views > r.visits ? `${plural(r.views, "page view")} from these visits` : undefined}
              />
            ))}
          </ul>
        )}
        {internal && internal.views > 0 && (
          <p className="border-t border-primary-100 px-4 py-2.5 text-[12px] text-primary-500">
            And {plural(internal.views, "page view")} from reloads, Back, and pages opened from another TapTurf page as a new load, where it isn&rsquo;t
            known how the person first arrived.
          </p>
        )}
      </Card>
      <Card title="What people open" aside={plural(views, "page view")}>
        {kinds.length === 0 ? (
          <Empty text="No page views in these days." />
        ) : (
          <ul className="divide-y divide-primary-100">
            {kinds.map((r) => (
              <Row
                key={r.kind}
                label={KIND_LABEL[r.kind]}
                value={r.views}
                share={shareText(r.views, views)}
                max={kinds[0].views}
                sub={r.visits > 0 ? `${plural(r.visits, "visit")} started here` : undefined}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/** One page: its path (opens the page), its views and the visits that started on it. */
function PageList({ pages }: { pages: PageRow[] }) {
  return (
    <ul className="divide-y divide-primary-100">
      {pages.map((p) => {
        const real = p.path.startsWith("/");
        const inner = (
          <>
            <span className="min-w-0 flex-1">
              <span className="block break-all text-[13px] font-medium text-primary-900">{p.path}</span>
              <span className="block text-[12px] text-primary-500">
                {KIND_LABEL[p.kind]}
                {p.visits > 0 ? ` · ${plural(p.visits, "visit")} started here` : ""}
              </span>
            </span>
            <span className="shrink-0 text-right text-[14px] font-semibold tabular-nums text-primary-900">{fmt(p.views)}</span>
          </>
        );
        return (
          <li key={p.path}>
            {real ? (
              <a href={p.path} target="_blank" rel="noopener" className="flex items-center gap-3 px-4 py-2.5 hover:bg-primary-50 focus-neon">
                {inner}
              </a>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TopPages({ pages, total }: { pages: PageRow[]; total: number }) {
  return (
    <Card title="Top pages, last 7 days" aside={total > pages.length ? `${fmt(pages.length)} of ${fmt(total)}, by views` : "by views"}>
      {pages.length === 0 ? (
        <Empty text="No page views in these days." />
      ) : (
        <>
          <PageList pages={pages.slice(0, FIRST_PAGES)} />
          {pages.length > FIRST_PAGES && (
            <details className="group border-t border-primary-100">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center px-4 text-[13px] font-semibold text-accent-700 hover:bg-primary-50 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show {fmt(pages.length - FIRST_PAGES)} more</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <PageList pages={pages.slice(FIRST_PAGES)} />
            </details>
          )}
        </>
      )}
    </Card>
  );
}

function OtherSites({ u }: { u: TrafficUsage }) {
  const { sites, sitesTotal } = u;
  // Each site's share of the 7 days' visits from other websites (the named ones are a part of those; never past 100%).
  const visits = Math.max(u.bySource.d7.find((r) => r.source === "other_site")?.visits ?? 0, sites.reduce((s, r) => s + r.visits, 0));
  const max = sites[0]?.visits ?? 0;
  return (
    <Card title="Other websites, last 7 days" aside={sitesTotal > sites.length ? `${fmt(sites.length)} of ${fmt(sitesTotal)}, by visits` : "by visits"}>
      {sites.length === 0 ? (
        <Empty text="No visits from other websites in these days." />
      ) : (
        <ul className="divide-y divide-primary-100">
          {sites.map((s) => (
            <Row key={s.host} label={s.host === "(other)" ? "Others (past the day's 300 sites)" : s.host} value={s.visits} share={shareText(s.visits, visits)} max={max} />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The glance's traffic line: visits and page views today, and the 7 days' visits with their change. Nothing before counting starts. */
export async function TrafficGlance() {
  const res = await adminTraffic();
  if (!res.ok && res.reason === "not_set_up") return null;
  const t = res.ok ? res.data.totals : null;
  const chip = "inline-flex min-h-11 items-center justify-center rounded-xl bg-primary-50 px-2 py-1 text-center text-[12px] leading-tight text-primary-800 sm:min-h-10 sm:rounded-full sm:px-3 sm:text-[13px]";
  const change = t ? changeText(t.d7.visits, t.prev7.visits) : null;
  // Each chip: its number (bold) and what it counts.
  const items: [string, string][] = t
    ? [
        [fmt(t.today.visits), `${t.today.visits === 1 ? "visit" : "visits"} today`],
        [fmt(t.today.views), `${t.today.views === 1 ? "view" : "views"} today`],
        [fmt(t.d7.visits), `in 7 days${change && change !== "new" ? ` ${change}` : ""}`],
      ]
    : [
        ["-", "visits today"],
        ["-", "views today"],
        ["-", "in 7 days"],
      ];
  return (
    // A plain anchor: the browser's own jump (and its hashchange) opens the Traffic fold (components/admin/Fold.tsx).
    <a href="#traffic" className="block rounded-2xl border border-primary-200 bg-white p-3 hover:bg-primary-50/60 focus-neon sm:flex sm:items-center sm:gap-3 sm:px-4 sm:py-2">
      <span className="mb-2 flex items-center justify-between text-[13px] font-bold text-primary-500 sm:mb-0 sm:shrink-0">
        Traffic
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
