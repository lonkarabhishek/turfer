import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ExternalLink, MapPin } from "lucide-react";
import { isAdmin } from "@/lib/admin/auth";
import { AdminGate } from "@/components/admin/AdminGate";
import { ago, istDateTime } from "@/lib/admin/people";
import { getToolUsers } from "@/lib/queries/adminTools";
import { COUNTED_TOOLS, type CountedTool } from "@/lib/tools/usage";
import {
  TOOL_LABELS,
  WHO_FILTERS,
  activityWhat,
  chipText,
  filterPeople,
  peoplePerTool,
  shortDevice,
  toolFilter,
  toolLabel,
  toolPeople,
  whoFilter,
  whoName,
  type ToolActivityRow,
  type ToolPerson,
  type WhoFilter,
} from "@/lib/tools/users";

// Who used the free tools and what they used, from 27 Oct 2026
// (supabase/migrations/20261027_tool_users.sql). Site owner only.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

/** People shown at most; the newest first. */
const MAX_PEOPLE = 300;
const LOG_SINCE = "27 Oct 2026";

const readTime = () => Date.now();

function hrefFor(tool: CountedTool | null, who: WhoFilter): string {
  const q = new URLSearchParams();
  if (tool) q.set("tool", tool);
  if (who !== "all") q.set("who", who);
  const s = q.toString();
  return s ? `/admin/tools?${s}` : "/admin/tools";
}

/** The admin's people list, opened on this account (the sign-ups section on the admin home). */
const personHref = (id: string) => `/admin?person=${encodeURIComponent(id)}#people`;

function Pill({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`shrink-0 h-9 px-4 inline-flex items-center rounded-full text-[14px] font-medium ${
        on ? "bg-primary-900 text-white" : "bg-primary-100 text-primary-900 hover:bg-primary-200"
      }`}
    >
      {children}
    </Link>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}>{children}</span>;
}

function LiveLink({ code }: { code: string }) {
  return (
    <a href={`/live/${code}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-mono text-[12px] text-accent-700 hover:underline">
      /live/{code} <ExternalLink className="w-3 h-3" aria-hidden />
    </a>
  );
}

function Who({ p }: { p: Pick<ToolPerson, "userId" | "name" | "username" | "device"> }) {
  if (p.userId) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-1.5 min-w-0">
        <Link href={personHref(p.userId)} className={`font-semibold hover:text-accent-600 break-words ${p.name?.trim() ? "text-primary-900" : "text-primary-400"}`}>
          {whoName(p)}
        </Link>
        {p.username && <span className="text-[13px] text-primary-500 truncate">@{p.username}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-semibold text-primary-700">Guest</span>
      {p.device ? (
        <span className="font-mono text-[12px] text-primary-400" title={`Device tag ${p.device}`}>
          #{shortDevice(p.device)}
        </span>
      ) : (
        <span className="text-[12px] text-primary-400">no device tag</span>
      )}
    </span>
  );
}

function PersonRow({ p, now }: { p: ToolPerson; now: number }) {
  return (
    <li className="border-t border-primary-100 first:border-t-0 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-[14px] font-semibold ${
            p.userId ? "bg-accent-50 text-accent-700" : "bg-primary-100 text-primary-500"
          }`}
        >
          {p.userId ? (Array.from(whoName(p))[0] ?? "?").toUpperCase() : "G"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <Who p={p} />
            <span className="text-[13px] font-semibold text-primary-800 whitespace-nowrap">{ago(p.last, now)}</span>
          </div>
          <p className="text-[13px] text-primary-600">
            {p.city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-primary-400" aria-hidden />
                {p.city}
              </span>
            ) : (
              <span className="text-primary-400">City not known</span>
            )}
            <span className="text-primary-400"> · {p.uses} use{p.uses === 1 ? "" : "s"}</span>
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tools used">
            {p.tools.map((c) => (
              <li key={c.tool} className="rounded-full bg-primary-100 px-2.5 py-1 text-[12px] font-medium text-primary-800" title={c.finished ? `${c.finished} finished` : undefined}>
                {chipText(c)}
              </li>
            ))}
          </ul>
          {p.tools.some((c) => c.codes.length > 0) && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {p.tools.flatMap((c) => c.codes).map((code) => (
                <LiveLink key={code} code={code} />
              ))}
            </p>
          )}
          <p className="mt-1.5 font-mono text-[11px] text-primary-400">
            First {istDateTime(p.first)} · last {istDateTime(p.last)} IST
          </p>
        </div>
      </div>
    </li>
  );
}

function ActivityRow({ r }: { r: ToolActivityRow }) {
  const who = { userId: r.user_id, name: r.name, username: r.username, device: r.user_id ? null : r.device };
  return (
    <li className="border-t border-primary-100 first:border-t-0 px-4 py-3 flex flex-col sm:flex-row sm:items-baseline gap-x-4 gap-y-1">
      <span className="shrink-0 sm:w-40 font-mono text-[12px] text-primary-500">{istDateTime(Date.parse(r.used_at))}</span>
      <span className="min-w-0 sm:w-56 text-[14px]">
        <Who p={who} />
      </span>
      <span className="min-w-0 flex-1 text-[14px] text-primary-800">
        <span className="font-medium">{toolLabel(r.tool)}</span>
        <span className="text-primary-500"> · {activityWhat(r)}</span>
        {r.code && (
          <span className="ml-2">
            <LiveLink code={r.code} />
          </span>
        )}
      </span>
      {r.city && <span className="shrink-0 text-[12px] text-primary-400">{r.city}</span>}
    </li>
  );
}

export default async function ToolUsersPage({ searchParams }: { searchParams: Promise<{ tool?: string; who?: string }> }) {
  if (!(await isAdmin())) return <AdminGate />;
  const sp = await searchParams;
  const tool = toolFilter(sp.tool);
  const who = whoFilter(sp.who);
  const res = await getToolUsers(tool, who);
  const now = readTime();

  const everyone = res.ok ? toolPeople(res.rows) : [];
  const forWho = filterPeople(everyone, null, who);
  const people = filterPeople(everyone, tool, who);
  const perTool = peoplePerTool(forWho);
  const signed = people.filter((p) => p.userId).length;
  const uses = people.reduce((s, p) => s + (tool ? (p.tools.find((c) => c.tool === tool)?.n ?? 0) : p.uses), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-primary-500 hover:text-primary-900 mb-4">
        <ChevronLeft className="w-4 h-4" /> Admin
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-2">
        <h1 className="font-display text-3xl md:text-4xl text-primary-900">
          Tool users
          <span className="ml-3 text-primary-400 text-2xl tabular-nums">{people.length}</span>
        </h1>
      </div>
      <p className="text-[13px] text-primary-500 mb-5 max-w-3xl">
        Everyone who started or finished something in the free tools since {LOG_SINCE}: signed-in people by their account, guests by a
        random tag their browser keeps. The city is where their internet connection points to (approximate), else the city they picked.
        Times are India time.
      </p>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
        {(Object.keys(WHO_FILTERS) as WhoFilter[]).map((w) => (
          <Pill key={w} href={hrefFor(tool, w)} on={w === who}>
            {WHO_FILTERS[w]}
          </Pill>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-5 -mx-4 px-4 sm:mx-0 sm:px-0">
        <Pill href={hrefFor(null, who)} on={tool === null}>
          All tools
        </Pill>
        {COUNTED_TOOLS.map((t) => (
          <Pill key={t} href={hrefFor(t, who)} on={t === tool}>
            {TOOL_LABELS[t]}
            {res.ok && <span className={`ml-1.5 tabular-nums ${t === tool ? "text-white/70" : "text-primary-500"}`}>{perTool[t] ?? 0}</span>}
          </Pill>
        ))}
      </div>

      {!res.ok ? (
        <p className="text-primary-500 py-10 text-center text-sm">
          {res.reason === "not_set_up"
            ? "The tool users log isn't set up in the database yet."
            : res.reason === "not_allowed"
              ? "Couldn't confirm it's you. Sign in with your Google account (the owner email), then reload."
              : "Couldn't load who used the tools. Refresh to try again."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3 text-[13px]">
            <Badge className="bg-primary-100 text-primary-700">
              {people.length} {people.length === 1 ? "person" : "people"}
            </Badge>
            <Badge className="bg-accent-50 text-accent-700">{signed} signed in</Badge>
            <Badge className="bg-primary-100 text-primary-700">
              {people.length - signed} guest{people.length - signed === 1 ? "" : "s"}
            </Badge>
            <Badge className="bg-white border border-primary-200 text-primary-700">
              {uses} use{uses === 1 ? "" : "s"}
              {tool ? ` of ${TOOL_LABELS[tool]}` : ""}
            </Badge>
          </div>

          <section className="mb-8">
            <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
              {people.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-primary-400">No one yet. Uses show here from the moment they happen.</p>
              ) : (
                <ul>
                  {people.slice(0, MAX_PEOPLE).map((p) => (
                    <PersonRow key={p.key} p={p} now={now} />
                  ))}
                </ul>
              )}
            </div>
            {people.length > MAX_PEOPLE && (
              <p className="mt-2 text-[12px] text-primary-500">
                Showing the {MAX_PEOPLE} who used a tool most recently, of {people.length.toLocaleString("en-IN")}. Pick a tool to narrow it down.
              </p>
            )}
          </section>

          <section className="mb-8">
            <p className="text-xs font-bold text-primary-500 mb-3">
              Recent activity{tool ? ` · ${TOOL_LABELS[tool]}` : ""}
              {who !== "all" ? ` · ${WHO_FILTERS[who]}` : ""}
            </p>
            <div className="rounded-2xl bg-white border border-primary-200 overflow-hidden">
              {res.activity.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-primary-400">Nothing here.</p>
              ) : (
                <ul>
                  {res.activity.map((r, i) => (
                    <ActivityRow key={`${r.used_at}-${i}`} r={r} />
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-2 text-[12px] text-primary-400">The latest {res.activity.length} uses, newest first.</p>
          </section>
        </>
      )}
    </div>
  );
}
