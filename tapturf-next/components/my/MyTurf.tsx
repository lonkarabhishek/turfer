"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, Check, Circle, ExternalLink, Loader2, Star } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { DailyChart } from "@/components/admin/DailyChart";
import { getOwnerSlots, ownerRpc, type OwnerDashboard, type OwnerTurf } from "@/lib/my/client";
import { MY_LIST_HREF, TURF_TABS, turfTabHref, turfView, type TurfTab } from "@/lib/my/turfTabs";
import { EditListing } from "./EditListing";
import { OwnerPhotos } from "./OwnerPhotos";
import { OwnerPhotoNudge } from "./OwnerPhotoNudge";
import { PlayerReports } from "./PlayerReports";
import { ManagerNameNote } from "./ManagerNameNote";
import { GroundSizes, type GroundSizeState } from "./GroundSizes";
import { GroundSizeNudge } from "./GroundSizeNudge";
import { FreeSlots, type InitialSlots } from "./FreeSlots";
import { AdminSlots } from "./AdminSlots";
import { pageHasNumber } from "@/lib/my/numbers";
import { turfPath } from "@/lib/utils/turfPath";

const PERIODS = [7, 30, 90] as const;

// The URL's ?tab and #section, kept in step with Back, Forward, a typed #section and the tabs' own moves
// (window.history.pushState, which Next.js's router follows: no reload, no request to the server).
const MOVED = "tt-my-turf-moved";
function subscribeUrl(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener("hashchange", cb);
  window.addEventListener(MOVED, cb);
  return () => {
    window.removeEventListener("popstate", cb);
    window.removeEventListener("hashchange", cb);
    window.removeEventListener(MOVED, cb);
  };
}
const urlNow = () => `${window.location.search}${window.location.hash}`;
const urlOnServer = () => "";
function splitUrl(u: string): [search: string, hash: string] {
  const i = u.indexOf("#");
  return i < 0 ? [u, ""] : [u.slice(0, i), u.slice(i)];
}

/**
 * One turf on myTapturf, in three tabs (lib/my/turfTabs.ts): Slots first and
 * by default, where the owner marks the hours already booked (FreeSlots) and
 * nothing else; Your page, everything the turf's public page shows (prices,
 * hours, numbers, facilities, photos, ground size, player reports); and
 * Analytics, how players find it. The tab is in the URL (?tab=page,
 * ?tab=analytics), and a link to a section (#hours, #numbers, #photos ...)
 * opens its tab and scrolls there. Every tab stays mounted once the turf has
 * loaded (hidden when another is open), so unsaved edits, a save in flight
 * and each section's own reads survive a switch.
 */
export function MyTurf({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<OwnerDashboard | null>(null);
  const [failed, setFailed] = useState(false);
  // Photos the public page shows (the Photos section counts them); until then, the stored count.
  const [visiblePhotos, setVisiblePhotos] = useState<number | null>(null);
  // Photos the turf's owners added (the Photos section counts them too): fewer than 3 shows the nudge.
  const [ownerPhotos, setOwnerPhotos] = useState<number | null>(null);
  // Whether the turf has a ground size (the Ground size section says, once it has looked): none shows the nudge.
  const [groundSize, setGroundSize] = useState<GroundSizeState>(null);

  const load = useCallback(async () => {
    try {
      setData(await ownerRpc<OwnerDashboard>("owner_dashboard", { p_turf_id: id, p_days: days }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [id, days]);

  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [user, load]);

  // Free slots: read at the same time as the dashboard, so the section is there when the page draws
  // (components/my/FreeSlots.tsx adopts it once, then keeps its own). Once per sign-in.
  const signedIn = !!user;
  const [slots0, setSlots0] = useState<InitialSlots>(undefined);
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    getOwnerSlots(id).then(
      (r) => alive && setSlots0(r),
      () => alive && setSlots0("failed"),
    );
    return () => {
      alive = false;
    };
  }, [signedIn, id]);

  // ── The tabs ──
  const [search, hash] = splitUrl(useSyncExternalStore(subscribeUrl, urlNow, urlOnServer));
  const view = turfView(search, hash);
  const tabsRef = useRef<HTMLElement>(null);
  // Each move made here (a tab, or a link to a section): where to scroll once the tab has drawn.
  const [move, setMove] = useState<{ n: number; anchor: string | null }>({ n: 0, anchor: null });
  const go = useCallback(
    (tab: TurfTab, anchor: string | null) => {
      const href = turfTabHref(id, tab, anchor);
      if (href !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.pushState(null, "", href);
      window.dispatchEvent(new Event(MOVED));
      setMove((m) => ({ n: m.n + 1, anchor }));
    },
    [id],
  );
  useEffect(() => {
    if (!move.n) return;
    let stop = () => {};
    const raf = requestAnimationFrame(() => {
      if (move.anchor) stop = settleOn(move.anchor);
      else toTabs(tabsRef.current);
    });
    return () => {
      cancelAnimationFrame(raf);
      stop();
    };
  }, [move]);

  // Opened with a #section (a link from elsewhere, a reload), or one typed in: scroll there once the turf has drawn.
  const ready = !!data && !("error" in data);
  useEffect(() => {
    if (!ready) return;
    let stop = () => {};
    const to = () => {
      const a = turfView(window.location.search, window.location.hash).anchor;
      if (!a) return;
      stop();
      stop = settleOn(a);
    };
    const raf = requestAnimationFrame(to);
    window.addEventListener("hashchange", to);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", to);
      stop();
    };
  }, [ready]);

  /** A tap on a link to one of this turf's tabs or sections (the tabs, "Change your hours", "Add photos" ...): there, without reloading. */
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (!(a instanceof HTMLAnchorElement) || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    const u = new URL(a.href, window.location.href);
    if (u.origin !== window.location.origin || u.pathname !== window.location.pathname) return;
    const v = turfView(u.search, u.hash);
    // A #section this file doesn't know: the browser's own jump.
    if (!v.anchor && u.hash.length > 1) return;
    e.preventDefault();
    go(v.tab, v.anchor);
  };

  if (loading) return <Shell><p className="text-primary-500">Loading…</p></Shell>;
  if (!user)
    return (
      <Shell>
        <p className="text-primary-700">
          {/* Back to the tab and section the link named (/my/turf/<id>?tab=analytics, #hours ...), once signed in. */}
          <Link href={`/login?next=${encodeURIComponent(turfTabHref(id, view.tab, view.anchor))}`} className="font-semibold text-accent-700">Sign in</Link> to open this turf on myTapturf.
        </p>
      </Shell>
    );
  if (failed) return <Shell><p className="text-red-700">Couldn&rsquo;t load this turf. Check your connection and try again.</p></Shell>;
  if (!data) return <Shell><p className="text-primary-500 inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading your turf…</p></Shell>;
  if ("error" in data)
    return (
      <Shell>
        <h1 className="font-display text-2xl text-primary-900">This turf isn&rsquo;t on your account</h1>
        <p className="mt-2 text-primary-600">Claim it from <Link href={`/my?claim=${id}`} className="font-semibold text-accent-700">myTapturf</Link>, or wait for us to confirm a claim you sent.</p>
      </Shell>
    );

  const t = data.turf;
  const sum = (k: "views" | "calls" | "whatsapp") => data.series.reduce((n, d) => n + d[k], 0);
  const views = sum("views");
  const calls = sum("calls");
  const wa = sum("whatsapp");

  return (
    <Shell onClick={onClick}>
      {/* The way back (the list of turfs, even for an owner with one) and the public page, on one line: the name gets the width. */}
      <div className="-my-2 flex items-center justify-between gap-3">
        <Link href={MY_LIST_HREF} className="-ml-1 inline-flex min-h-11 items-center gap-1 px-1 text-[14px] text-primary-500 hover:text-primary-900">
          <ArrowLeft className="w-4 h-4" aria-hidden /> myTapturf
        </Link>
        <Link href={turfPath(t)} target="_blank" className="-mr-1 inline-flex min-h-11 items-center gap-1 px-1 text-[14px] font-semibold text-accent-700 hover:text-accent-800">
          Public page <ExternalLink className="w-3.5 h-3.5" aria-hidden />
        </Link>
      </div>
      {/* The name alone (no area line): the same on every tab, so the tabs never move, and the hours start sooner on Slots. */}
      <h1 className="mt-3 font-display text-[26px] md:text-[34px] leading-tight text-primary-900 [overflow-wrap:anywhere]">{t.name}</h1>

      {/* The tabs: links, so each is a URL (Back, a link from elsewhere, open in a new tab); onClick moves without a reload. */}
      <nav ref={tabsRef} aria-label="Your turf on myTapturf" className="mt-4 grid grid-cols-3 gap-1 rounded-full bg-primary-100 p-1 sm:max-w-md">
        {TURF_TABS.map((x) => {
          const on = view.tab === x.id;
          return (
            <a
              key={x.id}
              href={turfTabHref(t.id, x.id)}
              data-same-page
              aria-current={on ? "page" : undefined}
              className={`h-11 min-w-0 px-1 rounded-full inline-flex items-center justify-center text-[15px] font-semibold whitespace-nowrap touch-manipulation transition-colors ${
                on ? "bg-white text-primary-900 shadow-soft" : "text-primary-600 hover:text-primary-900"
              }`}
            >
              {x.label}
            </a>
          );
        })}
      </nav>

      {/* Slots: mark the hours already booked. Nothing else here. Free hours show on the public page for 24 hours after
          the last tap, while the page has a number to call or WhatsApp (an older database doesn't say: taken as yes). */}
      <div hidden={view.tab !== "slots"}>
        <FreeSlots
          turfId={t.id}
          initial={slots0}
          hoursKey={`${t.start_time}|${t.end_time}|${t.is_24x7}|${t.closed_days}`}
          onHoursSaved={load}
          hasNumber={pageHasNumber(t) ?? true}
          whenOff={(why) =>
            // Free slots refuses only the site owner on a turf that opened here (owner_dashboard lets in a claim or the
            // site owner; owner_slots, a claim alone), so "forbidden" here is the site owner: their read-only view, which
            // admin_turf_slots checks again itself (anyone else gets this note, as before).
            why === "forbidden" ? (
              <AdminSlots
                turfId={t.id}
                turfName={t.name}
                hasNumber={pageHasNumber(t) ?? true}
                fallback={(w) => <SlotsOff why={w} pageHref={turfTabHref(t.id, "page")} />}
              />
            ) : (
              <SlotsOff why={why} pageHref={turfTabHref(t.id, "page")} />
            )
          }
        />
      </div>

      {/* Your page: what players see on the turf's page, and what they said. */}
      <div hidden={view.tab !== "page"}>
        <div className="mt-6 flex flex-col gap-3 empty:hidden">
          {/* "Managed by @you" on the public page (under the name and in the Claimed turf panel): whether it shows, or how to make it show. */}
          <ManagerNameNote turfName={t.name} turfId={t.id} pageHref={turfPath(t)} />
          {/* Fewer than 3 photos of their own: ask for them (only those can show on Google), down to Photos. */}
          <OwnerPhotoNudge mine={ownerPhotos} />
          {/* No ground size yet: ask for it, down to Ground size. */}
          <GroundSizeNudge state={groundSize} />
        </div>

        <Health turf={t} photos={visiblePhotos ?? t.photos} groundSize={groundSize} />

        <EditListing turf={t} onSaved={load} />

        <section id="photos" className="mt-10 scroll-mt-20">
          <OwnerPhotos turfId={t.id} turfName={t.name} onChanged={load} onCount={setVisiblePhotos} onMine={setOwnerPhotos} />
        </section>

        <section id="ground-size" className="mt-10 scroll-mt-20">
          <GroundSizes turfId={t.id} turfSports={t.sports ?? []} onState={setGroundSize} />
        </section>

        <PlayerReports reviews={data.reviews} turfSports={t.sports ?? []} turfId={t.id} />

        {data.edits.length > 0 && (
          <section className="mt-10">
            <h2 className="text-[13px] font-semibold text-primary-500">Recent changes</h2>
            <ul className="mt-2 space-y-1 text-[13px] text-primary-600">
              {data.edits.map((e, i) => (
                <li key={i}>
                  {new Date(e.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}: {[...new Set((e.fields ?? []).map(fieldLabel))].join(", ")}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Analytics: how players find the turf, as before. */}
      <div hidden={view.tab !== "analytics"}>
        <div className="mt-6 inline-flex rounded-full bg-primary-100 p-1" role="tablist" aria-label="Period">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={days === p}
              onClick={() => setDays(p)}
              className={`h-8 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer transition-colors ${days === p ? "bg-white text-primary-900 shadow-soft" : "text-primary-600"}`}
            >
              {p} days
            </button>
          ))}
        </div>

        <section className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Page views" value={views} prev={data.prev.views} />
          <Stat label="Calls" value={calls} prev={data.prev.calls} />
          <Stat label="WhatsApp taps" value={wa} prev={data.prev.whatsapp} />
          <Stat label="Shown in Ask TapTurf" value={data.ask} prev={data.prev.ask} />
        </section>
        <p className="mt-2 text-[12px] text-primary-400">
          Calls and WhatsApp are taps on your buttons on TapTurf. Compared with the {data.days} days before.
        </p>

        <section className="mt-6 grid md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-primary-200 bg-white p-4">
            <DailyChart label="Page views" points={data.series.map((d) => ({ date: d.day, count: d.views }))} />
          </div>
          <div className="rounded-2xl border border-primary-200 bg-white p-4">
            <DailyChart label="Calls and WhatsApp taps" color="#0F766E" points={data.series.map((d) => ({ date: d.day, count: d.calls + d.whatsapp }))} />
          </div>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-primary-50 p-4">
            <p className="text-[12px] font-semibold text-primary-500">Games hosted here</p>
            <p className="mt-1 text-[22px] font-bold text-primary-900 tabular-nums">{data.games.hosted}</p>
            <p className="text-[12px] text-primary-500">{data.games.upcoming} coming up</p>
          </div>
          <div className="rounded-2xl bg-primary-50 p-4">
            <p className="text-[12px] font-semibold text-primary-500">Rating on Google</p>
            <p className="mt-1 text-[22px] font-bold text-primary-900 tabular-nums inline-flex items-center gap-1">
              {t.rating ? Number(t.rating).toFixed(1) : "None"} {t.rating ? <Star className="w-4 h-4 fill-current text-amber-500" /> : null}
            </p>
            <p className="text-[12px] text-primary-500">{t.total_reviews ?? 0} reviews, {data.reviews.tapturf} on TapTurf</p>
          </div>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children, onClick }: { children: React.ReactNode; onClick?: React.MouseEventHandler<HTMLDivElement> }) {
  return (
    <div onClick={onClick} className="max-w-3xl mx-auto px-4 sm:px-6 py-6 md:py-10 pb-28">
      {children}
    </div>
  );
}

/**
 * The Slots tab when there are no slots to mark here: the site owner (every
 * turf opens for them, but players read the slots as the owner's, so only
 * someone who runs the turf marks them), a claim that ended, or a database
 * without free slots. Says why, and the way to the rest of the turf.
 */
function SlotsOff({ why, pageHref }: { why: string; pageHref: string }) {
  const text =
    why === "forbidden"
      ? "Only someone who runs this turf can mark its free slots: players see them as the owner’s."
      : why === "not_claimed"
        ? "This turf isn’t claimed any more, so there are no free slots to mark."
        : why === "missing"
          ? "Free slots aren’t switched on yet."
          : "Couldn’t load your free slots. Try again in a while.";
  return (
    <section id="slots" className="mt-6 scroll-mt-20 rounded-2xl border border-primary-200 bg-primary-50 p-4">
      <h2 className="font-display text-[22px] text-primary-900 inline-flex items-center gap-2">
        <CalendarCheck className="w-5 h-5 text-primary-500" aria-hidden /> Free slots
      </h2>
      <p className="mt-1 text-[14px] text-primary-600 leading-snug">{text}</p>
      <a href={pageHref} data-same-page className="mt-3 inline-flex h-11 items-center px-5 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[14px] font-semibold transition-colors">
        Edit Your page
      </a>
    </section>
  );
}

/** A section on another tab is now showing: scroll to it, and keep it there while what's above it loads (notes, photos), until the owner scrolls or 2.5 s pass. */
const QUIT = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
function settleOn(id: string): () => void {
  const place = () => {
    const el = document.getElementById(id);
    if (el && el.getClientRects().length) el.scrollIntoView({ block: "start", behavior: "instant" });
  };
  place();
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
  ro?.observe(document.body);
  const stop = () => {
    ro?.disconnect();
    clearTimeout(t);
    for (const e of QUIT) window.removeEventListener(e, stop);
  };
  const t = setTimeout(stop, 2500);
  for (const e of QUIT) window.addEventListener(e, stop, { passive: true });
  return stop;
}

/** Another tab opened: from its top. Scrolled past the tabs, back up to them; above them, stay. */
function toTabs(el: HTMLElement | null) {
  if (!el) return;
  const header = document.querySelector("header")?.getBoundingClientRect().height ?? 56;
  const top = Math.max(0, el.getBoundingClientRect().top + window.scrollY - header - 12);
  if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" });
}

function Stat({ label, value, prev }: { label: string; value: number; prev: number }) {
  const diff = value - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  return (
    <div className="rounded-2xl border border-primary-200 bg-white p-4">
      <p className="text-[12px] font-semibold text-primary-500">{label}</p>
      <p className="mt-1 text-[26px] font-bold text-primary-900 tabular-nums">{value.toLocaleString("en-IN")}</p>
      <p className={`text-[12px] tabular-nums ${diff > 0 ? "text-accent-700" : diff < 0 ? "text-red-600" : "text-primary-400"}`}>
        {diff === 0 ? "Same as before" : pct != null ? `${diff > 0 ? "+" : ""}${pct}%` : `${diff > 0 ? "+" : ""}${diff}`}
      </p>
    </div>
  );
}

const LABELS: Record<string, string> = {
  morning_price: "morning price",
  afternoon_price: "afternoon price",
  evening_price: "evening price",
  weekend_morning_price: "weekend morning price",
  weekend_afternoon_price: "weekend afternoon price",
  weekend_evening_price: "weekend evening price",
  start_time: "opening time",
  end_time: "closing time",
  is_24x7: "24 hours",
  closed_days: "closed days",
  description: "description",
  surface_type: "surface",
  number_of_grounds: "grounds",
  formats: "formats",
  whatsapp_phone: "WhatsApp number",
  // A new call number also writes the listing's phone and empties an old landline: one change.
  owner_phone: "call number",
  contact_info: "call number",
  landline_phone: "call number",
  photos_added: "new photos",
  photo_removed: "removed a photo",
  cover_image: "cover photo",
  ground_sizes: "ground size",
  // A roof answer sets both: one change.
  roof: "roof",
  is_covered: "roof",
};
function fieldLabel(f: string) {
  return LABELS[f] ?? f.replace(/_/g, " ").replace(/^(has|is) /, "");
}

/** What the listing still lacks, most useful first. The ground size counts once the database has ground sizes (groundSize not null). */
function Health({ turf: t, photos, groundSize }: { turf: OwnerTurf; photos: number; groundSize: GroundSizeState }) {
  const prices = [t.morning_price, t.afternoon_price, t.evening_price, t.weekend_morning_price, t.weekend_afternoon_price, t.weekend_evening_price];
  const facilities = [t.has_floodlights, t.is_covered, t.parking_available, t.washroom_available, t.changing_room_available, t.has_cafeteria, t.has_drinking_water, t.equipment_provided];
  const items: { ok: boolean; text: string; hint: string; href?: string }[] = [
    { ok: prices.some((p) => p != null && p > 0), text: "Hourly prices", hint: "Players filter by budget; turfs with prices get more calls." },
    { ok: !!t.price_owner_confirmed, text: "Prices confirmed by you", hint: "Shows players the prices come from you." },
    { ok: t.is_24x7 === true || (!!t.start_time && !!t.end_time), text: "Opening hours", hint: "So late-night and early-morning searches find you." },
    { ok: facilities.filter((f) => f != null).length >= 4, text: "Facilities", hint: "Lights, parking, washroom, covered: the questions players ask most." },
    { ok: !!t.formats?.length, text: "Formats", hint: "5-a-side, 7-a-side, box cricket sizes." },
    { ok: (t.description?.length ?? 0) >= 80, text: "A short description", hint: "Two or three lines in your own words." },
    { ok: !!t.whatsapp_phone, text: "WhatsApp number", hint: "Most players book on WhatsApp." },
    { ok: photos >= 3, text: "At least 3 photos", hint: "Add them in Photos below.", href: "#photos" },
    ...(groundSize ? [{ ok: groundSize === "set", text: "Ground size", hint: "Length, width and net height, in Ground size below.", href: "#ground-size" }] : []),
  ];
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-[22px] text-primary-900">Your listing</h2>
        <p className="text-[13px] font-semibold text-primary-600 tabular-nums">{pct}% complete</p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-primary-100 overflow-hidden">
        <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {items.map((i) => (
          <li key={i.text} className="flex gap-2.5">
            {i.ok ? <Check className="w-5 h-5 shrink-0 text-accent-600" /> : <Circle className="w-5 h-5 shrink-0 text-primary-300" />}
            <span>
              <span className={`block text-[14px] font-semibold ${i.ok ? "text-primary-500" : "text-primary-900"}`}>{i.text}</span>
              {!i.ok &&
                (i.href ? (
                  <a href={i.href} className="block text-[13px] font-semibold text-accent-700 leading-snug hover:underline">{i.hint}</a>
                ) : (
                  <span className="block text-[13px] text-primary-500 leading-snug">{i.hint}</span>
                ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
