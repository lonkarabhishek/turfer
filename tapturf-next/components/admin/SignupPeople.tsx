"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { METHOD_NAMES, ago, duration, istDateTime, joinedBetween, matches, whatsappLink, type Method, type Person } from "@/lib/admin/people";

/**
 * Who signed up in the stretch the chart shows, newest first. Each row
 * opens to everything we know: contact, account, sign-ins, what they have
 * done on TapTurf and what they did before signing up.
 */

const PAGE = 25;
// lib/analytics/visitor.ts started saving the sign-up context then.
const CONTEXT_SINCE = "19 Oct 2026";

const title = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function SignupPeople({
  people,
  start,
  end,
  label,
  now,
  onShowAll,
}: {
  people: Person[] | null;
  start: number;
  end: number;
  label: string;
  now: number;
  /** Zoom the chart back out to all time, to search everyone. */
  onShowAll?: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  // How many to show, for this window and search; a new one starts again at one page.
  const key = `${start}:${end}:${query}`;
  const [shown, setShown] = useState({ key, n: PAGE });
  const limit = shown.key === key ? shown.n : PAGE;

  const inView = useMemo(() => (people ? joinedBetween(people, start, end) : []), [people, start, end]);
  const found = useMemo(() => inView.filter((p) => matches(p, query)), [inView, query]);
  const elsewhere = useMemo(() => (query.trim() && people ? people.filter((p) => matches(p, query)).length - found.length : 0), [people, query, found]);

  if (people === null) {
    return (
      <Frame>
        <p className="py-8 text-center text-sm text-primary-500">Couldn&apos;t load the people who signed up. Reload to try again.</p>
      </Frame>
    );
  }

  const toggle = (pid: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  const visible = found.slice(0, limit);
  const left = found.length - visible.length;

  return (
    <Frame
      // Escape here clears the search; it must not also zoom the chart out.
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        if ((e.target as HTMLElement).id === `${id}-q` && query) {
          e.preventDefault();
          setQuery("");
        }
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id={`${id}-h`} className="font-semibold text-primary-900">
            People who signed up
          </h3>
          <p className="text-[13px] text-primary-500">
            {query.trim() ? `${count(found.length, "match", "matches")} of ${count(inView.length, "person", "people")}` : count(inView.length, "person", "people")} · {label}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" aria-hidden />
          <input
            id={`${id}-q`}
            type="text"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, phone, email or @username"
            aria-label="Search the people who signed up"
            className="w-full h-10 rounded-full border border-primary-200 bg-white pl-9 pr-9 text-[14px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-500"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-full text-primary-500 hover:bg-primary-100">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {found.length === 0 ? (
        <div className="mt-3 rounded-xl bg-primary-50 px-4 py-6 text-center text-sm text-primary-600">
          {query.trim() ? (
            <>
              <p>No one here matches &ldquo;{query.trim()}&rdquo;.</p>
              {elsewhere > 0 && onShowAll && (
                <button type="button" onClick={onShowAll} className="mt-2 font-semibold text-primary-800 underline underline-offset-2">
                  {count(elsewhere, "match", "matches")} in other dates: show all time
                </button>
              )}
            </>
          ) : (
            <p>No one signed up in this stretch.</p>
          )}
        </div>
      ) : (
        <ul aria-labelledby={`${id}-h`} className="mt-3 rounded-xl border border-primary-200 overflow-hidden">
          {visible.map((p) => (
            <Row key={p.id} p={p} now={now} open={open.has(p.id)} onToggle={() => toggle(p.id)} panelId={`${id}-${p.id}`} />
          ))}
        </ul>
      )}

      {left > 0 && (
        <button type="button" onClick={() => setShown({ key, n: limit + PAGE })} className="mt-3 w-full h-10 rounded-full border border-primary-200 text-[13px] font-semibold text-primary-700 hover:bg-primary-50">
          Show {Math.min(PAGE, left)} more ({left.toLocaleString("en-IN")} left)
        </button>
      )}
      {visible.some((p) => p.imported) && (
        <p className="mt-2 text-[12px] text-primary-500">
          <span className="text-hot-500">*</span> This joined time is shared by several accounts: it is when they were bulk imported, not when they signed up.
        </p>
      )}
    </Frame>
  );
}

function Frame({ children, onKeyDown }: { children: ReactNode; onKeyDown?: React.KeyboardEventHandler<HTMLDivElement> }) {
  return (
    <div onKeyDown={onKeyDown} className="mt-6 border-t border-primary-100 pt-5">
      {children}
    </div>
  );
}

function highlights(p: Person): string[] {
  const out: string[] = [];
  if (p.hosted) out.push(count(p.hosted, "game hosted", "games hosted"));
  if (p.joined) out.push(count(p.joined, "game joined", "games joined"));
  if (p.taps) out.push(count(p.taps, "turf contact", "turf contacts"));
  if (p.asks) out.push(count(p.asks, "Ask search", "Ask searches"));
  if (p.reviews) out.push(count(p.reviews, "review", "reviews"));
  return out.slice(0, 3);
}

function Row({ p, now, open, onToggle, panelId }: { p: Person; now: number; open: boolean; onToggle: () => void; panelId: string }) {
  const contact = p.phone ?? p.email;
  const extra = highlights(p);
  return (
    <li className="border-t border-primary-100 first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${open ? "bg-primary-50" : "hover:bg-primary-50"}`}>
        <Avatar p={p} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={`font-semibold truncate max-w-full ${p.name ? "text-primary-900" : "text-primary-400"}`}>{p.name ?? "No name"}</span>
            {p.username && <span className="text-[13px] text-primary-500">@{p.username}</span>}
            <MethodBadge method={p.method} />
          </p>
          <p className="text-[13px] text-primary-600 truncate">
            {contact ?? <span className="text-primary-400">No contact</span>}
            {extra.length > 0 && <span className="hidden md:inline text-primary-400"> · {extra.join(" · ")}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-semibold text-primary-800">{ago(p.joinedAt, now)}</p>
          <p className="hidden sm:block font-mono text-[11px] text-primary-400">
            {istDateTime(p.joinedAt)}
            {p.imported && <span className="ml-0.5 text-hot-500">*</span>}
          </p>
        </div>
        <ChevronDown className={`shrink-0 w-4 h-4 text-primary-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <Details p={p} now={now} id={panelId} />}
    </li>
  );
}

function Avatar({ p }: { p: Person }) {
  const [broken, setBroken] = useState(false);
  const letter = (p.name ?? p.username ?? p.email ?? "?").trim().charAt(0).toUpperCase() || "?";
  if (p.avatar && !broken) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={p.avatar} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBroken(true)} className="shrink-0 w-9 h-9 rounded-full object-cover bg-primary-100" />
    );
  }
  return (
    <span aria-hidden className="shrink-0 w-9 h-9 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center text-[14px] font-semibold">
      {letter}
    </span>
  );
}

function MethodBadge({ method }: { method: Method }) {
  const cls =
    method === "google"
      ? "bg-accent-50 border-accent-200 text-accent-700"
      : method === "phone"
        ? "bg-primary-100 border-primary-200 text-primary-700"
        : "bg-primary-50 border-primary-100 text-primary-500";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${cls}`}>{METHOD_NAMES[method]}</span>;
}

function When({ t, now }: { t: number | null; now: number }) {
  if (t === null) return <span className="text-primary-400">Never</span>;
  return (
    <>
      {istDateTime(t)} <span className="text-primary-500">({ago(t, now)})</span>
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[11px] font-bold text-primary-500 mb-1.5">{title}</h4>
      <dl className="space-y-1.5 text-[13px]">{children}</dl>
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-3">
      <dt className="text-primary-500">{label}</dt>
      <dd className="min-w-0 text-primary-900 break-words">{children}</dd>
    </div>
  );
}

const none = <span className="text-primary-400">None</span>;
const link = "font-medium text-primary-900 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-700";

function Details({ p, now, id }: { p: Person; now: number; id: string }) {
  const wa = p.phone ? whatsappLink(p.phone) : null;
  const b = p.before;
  const signedUp = b?.signup ?? p.joinedAt;
  return (
    <div id={id} className="grid gap-x-8 gap-y-5 px-3 sm:px-4 pt-2 pb-5 bg-primary-50 sm:grid-cols-2 xl:grid-cols-3">
      <Group title="Contact">
        <Item label="Phone">
          {p.phone ? (
            <span className="flex flex-wrap gap-x-3">
              <a href={`tel:${p.phone}`} className={link}>
                {p.phone}
              </a>
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={link}>
                  WhatsApp
                </a>
              )}
            </span>
          ) : (
            none
          )}
        </Item>
        <Item label="Email">
          {p.email ? (
            <a href={`mailto:${p.email}`} className={link}>
              {p.email}
            </a>
          ) : (
            none
          )}
        </Item>
      </Group>

      <Group title="Account">
        <Item label="Signed up with">{METHOD_NAMES[p.method]}</Item>
        <Item label="Joined">
          <When t={p.joinedAt} now={now} />
          {p.imported && <span className="block text-[12px] text-hot-600">Bulk import time, not the real sign-up</span>}
        </Item>
        <Item label="Username">
          {p.username ? (
            <>
              <a href={`/u/${p.username}`} target="_blank" rel="noopener" className={link}>
                @{p.username}
              </a>
              <span className="text-primary-500">{p.taggable === false ? ", can't be tagged" : ", can be tagged"}</span>
            </>
          ) : (
            <span className="text-primary-400">Not picked yet</span>
          )}
        </Item>
        {p.role && p.role !== "user" && <Item label="Role">{title(p.role)}</Item>}
        <Item label="Verified">{p.verified ? "Yes" : "No"}</Item>
        {p.updatedAt !== null && p.updatedAt - p.joinedAt > 60_000 && (
          <Item label="Profile changed">
            <When t={p.updatedAt} now={now} />
          </Item>
        )}
        <Item label="Account ID">
          <span className="font-mono text-[11px] text-primary-600 select-all">{p.id}</span>
        </Item>
      </Group>

      <Group title="Sign-ins">
        <Item label="Times">{p.logins ? p.logins.toLocaleString("en-IN") : none}</Item>
        <Item label="Last sign-in">
          <When t={p.lastLogin} now={now} />
        </Item>
        <Item label="Used">{p.loginMethods.length ? p.loginMethods.map((m) => (m === "google" ? "Google" : m === "phone" ? "Phone" : title(m))).join(", ") : none}</Item>
        <Item label="Last active">
          <When t={p.lastActive} now={now} />
        </Item>
      </Group>

      <Group title="On TapTurf">
        <Item label="Games hosted">{p.hosted || none}</Item>
        <Item label="Join requests">{p.requests ? `${p.requests} (${p.accepted} accepted)` : none}</Item>
        <Item label="Games joined">{p.joined || none}</Item>
        <Item label="Reviews">{p.reviews || none}</Item>
        <Item label="Turf suggestions">{p.suggestions || none}</Item>
        <Item label="Turfs contacted">
          {p.taps ? (
            <>
              {count(p.taps, "tap", "taps")}
              <ul className="mt-1 space-y-0.5">
                {p.contacted.map((c, i) => (
                  <li key={i}>
                    {c.slug ? (
                      <a href={`/turf/${c.slug}`} target="_blank" rel="noopener" className={link}>
                        {c.turf}
                      </a>
                    ) : (
                      c.turf
                    )}
                    <span className="text-primary-500">
                      {" "}
                      · {c.kinds.map((k) => (k === "whatsapp" ? "WhatsApp" : title(k))).join(", ")}
                      {c.n > 1 ? `, ${c.n} times` : ""}
                      {c.at !== null ? `, ${ago(c.at, now)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            none
          )}
        </Item>
        <Item label="Ask searches">
          {p.asks ? (
            <>
              {p.asks.toLocaleString("en-IN")}
              {p.recentAsks.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-primary-700">
                  {p.recentAsks.map((a, i) => (
                    <li key={i}>&ldquo;{a}&rdquo;</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            none
          )}
        </Item>
        {p.claims.length > 0 && (
          <Item label="myTapturf">
            <ul className="space-y-0.5">
              {p.claims.map((c, i) => (
                <li key={i}>
                  {c.turf}
                  <span className="text-primary-500">
                    : {c.status}
                    {c.role ? ` (${c.role})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Item>
        )}
      </Group>

      <Group title="Before signing up">
        {b ? (
          <>
            <Item label="Came from">{b.source}</Item>
            <Item label="First page">
              {b.landing ? (
                <a href={b.landing} target="_blank" rel="noopener" className={`${link} break-all`}>
                  {b.landing}
                </a>
              ) : (
                none
              )}
            </Item>
            <Item label="First visit">
              {b.firstVisit !== null ? (
                <>
                  {istDateTime(b.firstVisit)}
                  <span className="text-primary-500"> ({duration(signedUp - b.firstVisit)} before signing up)</span>
                </>
              ) : (
                none
              )}
            </Item>
            {b.sessions !== null && (
              <Item label="Visits">
                {count(b.sessions, "visit", "visits")}
                {b.days !== null ? ` over ${count(b.days, "day", "days")}` : ""}
              </Item>
            )}
            {b.cities.length > 0 && <Item label="Cities looked at">{b.cities.map(title).join(", ")}</Item>}
            {b.sports.length > 0 && <Item label="Sports looked at">{b.sports.map(title).join(", ")}</Item>}
            {b.turfsOpened !== null && <Item label="Turfs opened">{b.turfsOpened || none}</Item>}
            {b.contactClick !== null && (
              <Item label="First contact tap">
                {istDateTime(b.contactClick)}
              </Item>
            )}
            {b.device && (
              <Item label="Device">
                {b.device}
                {b.installed ? ", installed app" : ""}
              </Item>
            )}
            {b.lang && <Item label="Language">{b.lang}</Item>}
          </>
        ) : (
          <p className="text-[13px] text-primary-500">Not recorded. This is saved for accounts made from {CONTEXT_SINCE}.</p>
        )}
      </Group>
    </div>
  );
}
