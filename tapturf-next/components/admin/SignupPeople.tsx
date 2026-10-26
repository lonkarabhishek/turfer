"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  HALF_TEXT,
  METHOD_NAMES,
  NO_CITY,
  ago,
  cityLabel,
  cityOf,
  duration,
  hasTick,
  inCity,
  initial,
  istDateTime,
  joinedBetween,
  matches,
  sitePath,
  tickHalves,
  tickText,
  whatsappLink,
  type Half,
  type Method,
  type Person,
  type RecordedCity,
} from "@/lib/admin/people";
import { VerifiedTick } from "@/components/account/VerifiedTick";

/**
 * Who signed up in the stretch the chart shows (and the city picked in
 * By city), newest first. Each row opens to everything we know: contact,
 * city, account, sign-ins, what they have done on TapTurf and what they
 * did before signing up.
 */

const PAGE = 25;
// lib/analytics/visitor.ts started saving the sign-up context then.
const CONTEXT_SINCE = "19 Oct 2026";
// supabase/migrations/20261006_user_logins.sql started the sign-in log then (no backfill).
const LOGINS_SINCE = "6 Oct 2026";
const LOGINS_SINCE_MS = Date.UTC(2026, 9, 5, 18, 30); // 6 Oct 2026 00:00 IST
// Cities are recorded from then (supabase/migrations/20261022_user_cities.sql).
const CITIES_SINCE = "22 Oct 2026";

const HOW: Record<RecordedCity["source"], string> = {
  picked: "chosen in the city menu",
  gps: "found by their location",
  ip: "from their internet connection, approximate",
  unknown: "not known",
};

const title = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const count = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

export function SignupPeople({
  people,
  start,
  end,
  label,
  now,
  city = null,
  onShowAll,
  focus = null,
  verifiedOnly = false,
}: {
  people: Person[] | null;
  start: number;
  end: number;
  label: string;
  now: number;
  /** Only this city's sign-ups (NO_CITY: those with no city), or everyone. */
  city?: string | null;
  /** Zoom the chart back out to all time, to search everyone. */
  onShowAll?: () => void;
  /** An account to start on, searched and open (admin's "Open in people list"). */
  focus?: string | null;
  /** Start on the people with the verified tick (the admin home's Verified tick tile, ?people=verified). */
  verifiedOnly?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState(focus ?? "");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(focus ? [focus] : []));
  // "Verified only" needs the ticks (admin_ticks); when they couldn't be read the list is everyone, without ticks or the filter.
  const ticksRead = useMemo(() => !!people?.some((p) => p.tick !== null), [people]);
  const [ticked, setTicked] = useState(verifiedOnly);
  const onlyTicked = ticked && ticksRead;
  // How many to show, for this window, city, filter and search; a new one starts again at one page.
  const key = `${start}:${end}:${city}:${onlyTicked}:${query}`;
  const [shown, setShown] = useState({ key, n: PAGE });
  const limit = shown.key === key ? shown.n : PAGE;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // After Show more, focus the first row it added (the button may be gone).
  const focusRow = useRef<number | null>(null);
  useEffect(() => {
    const i = focusRow.current;
    if (i === null) return;
    focusRow.current = null;
    listRef.current?.querySelectorAll<HTMLButtonElement>(":scope > li > button")[i]?.focus();
  });

  const inCityList = useMemo(() => (people ? people.filter((p) => inCity(p, city)) : []), [people, city]);
  const scoped = useMemo(() => (onlyTicked ? inCityList.filter(hasTick) : inCityList), [inCityList, onlyTicked]);
  // The toggle's count: those with the tick in this stretch and city, whether or not it is on.
  const tickedHere = useMemo(() => joinedBetween(inCityList, start, end).filter(hasTick).length, [inCityList, start, end]);
  const inView = useMemo(() => joinedBetween(scoped, start, end), [scoped, start, end]);
  const found = useMemo(() => inView.filter((p) => matches(p, query)), [inView, query]);
  const elsewhere = useMemo(() => (query.trim() ? scoped.filter((p) => matches(p, query)).length - found.length : 0), [scoped, query, found]);
  // With Verified only on, the matches in this stretch it hides (those without the tick).
  const hidden = useMemo(
    () => (onlyTicked && query.trim() ? joinedBetween(inCityList, start, end).filter((p) => matches(p, query)).length - found.length : 0),
    [onlyTicked, query, inCityList, start, end, found],
  );
  const where = city === null ? null : city === NO_CITY ? "no known city" : cityLabel(city);

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
            {query.trim() ? `${count(found.length, "match", "matches")} of ${count(inView.length, "person", "people")}` : count(inView.length, "person", "people")}
            {onlyTicked ? " with the tick" : ""}
            {where ? ` · ${where}` : ""} · {label}
          </p>
          {ticked && !ticksRead && <p className="text-[12px] text-hot-600">Couldn&apos;t read the verified ticks, so this is everyone.</p>}
        </div>
        <div className="flex w-full sm:w-auto flex-wrap items-center gap-2">
          {ticksRead && (
            <button
              type="button"
              aria-pressed={onlyTicked}
              onClick={() => setTicked((v) => !v)}
              title="Only the people with the verified tick: a phone proved by an OTP and an email confirmed by Google"
              className={`shrink-0 h-10 px-4 inline-flex items-center gap-1.5 rounded-full text-[13px] font-semibold ${
                onlyTicked ? "bg-primary-900 text-white" : "border border-primary-200 text-primary-700 hover:bg-primary-50"
              }`}
            >
              <VerifiedTick decorative />
              Verified only
              <span className={`tabular-nums ${onlyTicked ? "text-white/70" : "text-primary-500"}`}>{tickedHere.toLocaleString("en-IN")}</span>
            </button>
          )}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" aria-hidden />
            <input
              ref={inputRef}
              id={`${id}-q`}
              type="text"
              inputMode="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, phone, city or @username"
              aria-label="Search the people who signed up"
              className="w-full h-10 rounded-full border border-primary-200 bg-white pl-9 pr-9 text-[14px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:border-accent-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 inline-flex items-center justify-center rounded-full text-primary-500 hover:bg-primary-100">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {found.length === 0 ? (
        <div className="mt-3 rounded-xl bg-primary-50 px-4 py-6 text-center text-sm text-primary-600 break-words">
          {query.trim() ? (
            <>
              <p>
                No one{onlyTicked ? " with the tick" : ""} here matches &ldquo;{query.trim()}&rdquo;.
              </p>
              {hidden > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setTicked(false);
                    inputRef.current?.focus();
                  }}
                  className="mt-2 mx-auto block font-semibold text-primary-800 underline underline-offset-2"
                >
                  {count(hidden, "match", "matches")} without the tick: show everyone
                </button>
              )}
              {elsewhere > 0 && onShowAll && (
                <button
                  type="button"
                  onClick={() => {
                    onShowAll();
                    inputRef.current?.focus();
                  }}
                  className="mt-2 font-semibold text-primary-800 underline underline-offset-2"
                >
                  {count(elsewhere, "match", "matches")} in other dates: show all time
                </button>
              )}
            </>
          ) : (
            <p>
              No one{onlyTicked ? " with the tick" : ""}
              {where ? ` from ${where === "no known city" ? "an unknown city" : where}` : ""} signed up in this stretch.
            </p>
          )}
        </div>
      ) : (
        <ul ref={listRef} aria-labelledby={`${id}-h`} className="mt-3 rounded-xl border border-primary-200 overflow-hidden">
          {visible.map((p) => (
            <Row key={p.id} p={p} now={now} open={open.has(p.id)} onToggle={() => toggle(p.id)} panelId={`${id}-${p.id}`} />
          ))}
        </ul>
      )}

      {left > 0 && (
        <button
          type="button"
          onClick={() => {
            focusRow.current = limit;
            setShown({ key, n: limit + PAGE });
          }}
          className="mt-3 w-full h-10 rounded-full border border-primary-200 text-[13px] font-semibold text-primary-700 hover:bg-primary-50">
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
    <div id="people" onKeyDown={onKeyDown} className="mt-6 border-t border-primary-100 pt-5 scroll-mt-20">
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
  const contact = p.phone ?? p.email ?? p.links?.googleEmail ?? p.contact?.email;
  const extra = highlights(p);
  const c = cityOf(p);
  // The tick's two halves as chips; none when the ticks couldn't be read.
  const halves = tickHalves(p);
  return (
    <li className="border-t border-primary-100 first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId} className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${open ? "bg-primary-50" : "hover:bg-primary-50"}`}>
        <Avatar p={p} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className={`font-semibold max-w-full break-words sm:truncate ${p.name ? "text-primary-900" : "text-primary-400"}`}>{p.name ?? "No name"}</span>
            {p.tick?.verified && <VerifiedTick className="-ml-1" />}
            {p.username && <span className="min-w-0 max-w-full truncate text-[13px] text-primary-500">@{p.username}</span>}
            <MethodBadge method={p.method} />
            {p.signInUnfinished && (
              <span title="Picked a Google account but never came back to TapTurf" className="inline-block rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Didn&rsquo;t finish
              </span>
            )}
          </p>
          <p className="text-[13px] text-primary-600 truncate">
            {/* Contact first: on a narrow row the city is what gets cut. */}
            {contact ?? <span className="text-primary-400">No contact</span>}
            {c && <span className={c.guessed ? "text-primary-500" : "text-primary-800"}> · {c.guessed ? `Probably ${cityLabel(c.id)}` : cityLabel(c.id)}</span>}
            {extra.length > 0 && <span className="hidden md:inline text-primary-400"> · {extra.join(" · ")}</span>}
          </p>
          {halves && (
            <span className="mt-1 flex flex-wrap gap-1">
              <HalfChip kind="phone" half={halves.phone} />
              <HalfChip kind="email" half={halves.email} />
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-semibold text-primary-800">
            {ago(p.joinedAt, now)}
            {p.imported && (
              <span className="ml-0.5 text-hot-500" aria-label="bulk import time">
                *
              </span>
            )}
          </p>
          <p className="hidden sm:block font-mono text-[11px] text-primary-400">{istDateTime(p.joinedAt)}</p>
        </div>
        <ChevronDown className={`shrink-0 w-4 h-4 text-primary-400 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <Details p={p} now={now} id={panelId} />}
    </li>
  );
}

function Avatar({ p }: { p: Person }) {
  const [broken, setBroken] = useState(false);
  const letter = initial(p);
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

/** users.email (Google's, or an old account's), else the Google account added from the profile, else the email a phone account typed, or what they answered. */
function EmailItem({ p }: { p: Person }) {
  const added = p.links?.googleEmail ?? null;
  if (!p.email && added) {
    // Added over the Google account's own empty account: that one keeps the address, so this account's email field stays empty.
    return (
      <>
        <a href={`mailto:${added}`} className={link}>
          {added}
        </a>
        <span className="text-primary-500"> · Google, added from their profile</span>
      </>
    );
  }
  if (p.email) {
    return (
      <>
        <a href={`mailto:${p.email}`} className={link}>
          {p.email}
        </a>
        {(p.confirmed ? p.confirmed.email === "google" : p.emailFromGoogle) && (
          <span className="text-primary-500"> · confirmed by Google{added && added.toLowerCase() === p.email.toLowerCase() ? ", added from their profile" : ""}</span>
        )}
        {p.confirmed?.email === "link" && <span className="text-primary-500"> · confirmed by a link</span>}
      </>
    );
  }
  const c = p.contact;
  if (c?.email) {
    return (
      <>
        <a href={`mailto:${c.email}`} className={link}>
          {c.email}
        </a>{" "}
        <span className="ml-1 inline-block rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-600">Typed by them, not checked</span>
        {c.shared && <span className="block text-[12px] text-hot-600">Same address as another account</span>}
      </>
    );
  }
  if (c?.answer === "skipped") return <span className="text-primary-400">Said no thanks</span>;
  if (c?.answer === "removed") return <span className="text-primary-400">Removed by them</span>;
  return p.method === "phone" ? <span className="text-primary-400">Not asked yet</span> : none;
}

/** What their sign-ins confirmed: Google's email, a phone code TapTurf checked; the old app's flag only when that couldn't be read. */
function VerifiedItem({ p }: { p: Person }) {
  const c = p.confirmed;
  if (!c) return <>{p.verified ? "Yes (old app's flag)" : "No (old app's flag)"}</>;
  const l = p.links;
  const parts = [
    c.email === "google" ? (l?.googleEmail ? "Email, by Google (added from their profile)" : "Email, by Google") : c.email === "link" ? "Email, by a confirm link" : null,
    c.phone ? (l?.phoneAddedAt !== null && l?.phoneAddedAt !== undefined ? "Phone, by an OTP from their profile" : "Phone, by a code at sign-in") : null,
  ].filter(Boolean);
  if (parts.length) return <>{parts.join(" · ")}</>;
  return (
    <span className="text-primary-500">
      Not yet
      {p.method === "phone" && <span className="block text-[12px]">Not seen here with a code-checked number since TapTurf started recording it. Their next visit or sign-in confirms the number.</span>}
      {p.noAccount && <span className="block text-[12px]">No TapTurf account was made for this sign-in.</span>}
    </span>
  );
}

/** The second ways in they added from their profile. */
function AddedItems({ p }: { p: Person }) {
  const l = p.links;
  if (!l) return null;
  const lines: string[] = [];
  if (l.googleEmail) {
    const changed = l.googleLinks > 1 ? ` (changed ${l.googleLinks - 1} ${l.googleLinks - 1 === 1 ? "time" : "times"})` : "";
    lines.push(`Google added from profile: ${l.googleEmail}${l.googleLinkedAt !== null ? ` on ${istDateTime(l.googleLinkedAt)}` : ""}${changed}`);
  }
  if (l.googleRemovedAt !== null) lines.push(`Google removed on ${istDateTime(l.googleRemovedAt)}`);
  if (l.phoneAddedAt !== null) lines.push(`Phone added with OTP on ${istDateTime(l.phoneAddedAt)}${l.phoneOpens ? "" : " (it doesn't open the account now)"}`);
  if (!lines.length) return null;
  return (
    <Item label="Added later">
      {lines.map((t) => (
        <span key={t} className="block">
          {t}
        </span>
      ))}
    </Item>
  );
}

const HALF_STYLE: Record<Half, string> = {
  proved: "bg-sky-50 border-sky-200 text-sky-800",
  typed: "bg-primary-50 border-primary-200 text-primary-600",
  none: "border-dashed border-primary-200 text-primary-400",
};

/** One half of the tick: "Phone ✓ proved", "Phone typed" or "No phone" (the same for the email). Never the number or the address. */
function HalfChip({ kind, half }: { kind: "phone" | "email"; half: Half }) {
  const { text, title } = HALF_TEXT[kind][half];
  return (
    <span title={title} className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${HALF_STYLE[half]}`}>
      {text}
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
  return (
    <span title={METHOD_NAMES[method]} className={`inline-block max-w-full truncate align-middle rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {METHOD_NAMES[method]}
    </span>
  );
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

function CityItems({ p, now }: { p: Person; now: number }) {
  const rc = p.city;
  if (rc?.id) {
    return (
      <>
        <Item label="City">
          {cityLabel(rc.id)}
          <span className="text-primary-500">
            , {HOW[rc.source]}
            {rc.atSignup ? ", at sign-up" : rc.at !== null ? `, noted ${ago(rc.at, now)}` : ""}
          </span>
        </Item>
        {rc.ipCity && rc.ipCity.toLowerCase() !== cityLabel(rc.id).toLowerCase() && <Item label="Internet location">{rc.ipCity}</Item>}
      </>
    );
  }
  return (
    <>
      <Item label="City">
        {p.likely ? (
          <>
            Probably {cityLabel(p.likely.id)}
            <span className="text-primary-500"> (guessed from their activity: {Math.round(p.likely.share * 100)}% of it points there)</span>
          </>
        ) : (
          <span className="text-primary-400">Not known yet</span>
        )}
        {!rc && <span className="block text-[12px] text-primary-500">Recorded from {CITIES_SINCE} when they use the site signed in.</span>}
      </Item>
      {rc?.ipCity && <Item label="Internet location">{rc.ipCity}</Item>}
    </>
  );
}

function Details({ p, now, id }: { p: Person; now: number; id: string }) {
  const wa = p.phone ? whatsappLink(p.phone) : null;
  const b = p.before;
  const signedUp = b?.signup ?? p.joinedAt;
  const landing = b ? sitePath(b.landing) : null;
  const preLog = p.joinedAt < LOGINS_SINCE_MS;
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
          <EmailItem p={p} />
        </Item>
        <CityItems p={p} now={now} />
      </Group>

      <Group title="Account">
        <Item label="Signed up with">{METHOD_NAMES[p.method]}</Item>
        <Item label="Joined">
          <When t={p.joinedAt} now={now} />
          {p.imported && <span className="block text-[12px] text-hot-600">Bulk import time, not the real sign-up</span>}
          {p.rowAddedAt !== null && <span className="block text-[12px] text-primary-500">Copied into the accounts list on {istDateTime(p.rowAddedAt)}</span>}
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
        <Item label="Confirmed">
          <VerifiedItem p={p} />
        </Item>
        {!p.noAccount && (
          <Item label="Tick">
            <span className={p.tick?.verified ? "inline-flex items-center gap-1" : p.tick ? "text-primary-500" : "text-hot-600"}>
              {p.tick?.verified && <VerifiedTick />}
              {tickText(p.tick)}
            </span>
          </Item>
        )}
        <AddedItems p={p} />
        {p.updatedAt !== null && p.updatedAt - p.joinedAt > 60_000 && (
          <Item label="Profile changed">
            <When t={p.updatedAt} now={now} />
          </Item>
        )}
        {p.noAccount ? (
          <Item label="Account">
            <span className="text-primary-500">None. They picked a Google account but never came back to TapTurf, so no account was made.</span>
            <span className="block font-mono text-[11px] text-primary-400 select-all">Google sign-in {p.id}</span>
          </Item>
        ) : (
          <Item label="Account ID">
            <span className="font-mono text-[11px] text-primary-600 select-all">{p.id}</span>
          </Item>
        )}
      </Group>

      <Group title="Sign-ins">
        {p.signInUnfinished ? (
          <Item label="Times">
            <span className="text-primary-400">None yet</span>
            <span className="block text-[12px] text-amber-800">
              Started with Google on {istDateTime(p.joinedAt)}. Google confirmed their email, but they never came back to TapTurf to finish (closed the
              tab or lost signal). {p.noAccount ? "No account was made; the email is real." : "The account and the email are real."}
            </span>
          </Item>
        ) : preLog && p.logins === 0 ? (
          <Item label="Times">
            <span className="text-primary-400">Not recorded. Sign-ins are saved from {LOGINS_SINCE}.</span>
          </Item>
        ) : (
          <>
            <Item label="Times">
              {p.logins ? p.logins.toLocaleString("en-IN") : none}
              {preLog && p.logins > 0 && <span className="text-primary-500"> since {LOGINS_SINCE}</span>}
            </Item>
            <Item label="Last sign-in">
              <When t={p.lastLogin} now={now} />
            </Item>
            <Item label="Used">{p.loginMethods.length ? p.loginMethods.map((m) => (m === "google" ? "Google" : m === "phone" ? "Phone" : m === "email" ? "Email" : title(m))).join(", ") : none}</Item>
          </>
        )}
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
              {/* The browser sent this, so it is a link only when it is a path on this site. */}
              {landing ? (
                <a href={landing} target="_blank" rel="noopener" className={`${link} break-all`}>
                  {landing}
                </a>
              ) : (
                <span className="break-all">{b.landing ?? none}</span>
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
