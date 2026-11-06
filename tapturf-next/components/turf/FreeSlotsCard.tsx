"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth/AuthProvider";
import { OwnerMark } from "@/components/turf/OwnerMark";
import { logContactClick, type ContactKind } from "@/lib/analytics/contactClicks";
import { buildWhatsAppLink } from "@/lib/utils/whatsapp";
import { availabilityPath } from "@/lib/availability/route";
import {
  PLAYER_COPY,
  REFETCH_AFTER_MS,
  agoText,
  clientNow,
  contactLinks,
  freeDays,
  isFresh,
  nextTickMs,
  parsePublic,
  playerDefault,
  playerFooter,
  noFreeLine,
  requestFooter,
  slotDays,
  slotMessage,
  updatedLine,
  type PublicAvailability,
  type Slot,
  type SlotDay,
  type SlotHours,
  type SlotKey,
} from "@/lib/availability/slots";

const dayKey = (d: SlotDay) => `${d.date}${d.night ? "n" : ""}`;
// The request sheet is fetched on the first tap only, so the turf page's first load does not grow.
const RequestSheet = dynamic(() => import("./RequestSheet").then((m) => m.RequestSheet), { ssr: false });

/**
 * Free slots on a claimed turf's page: the start times its owner marked
 * free, for turfs whose owner changed or confirmed them in the last 24 hours
 * (lib/availability/slots.ts). Tapping a time asks the turf on WhatsApp with
 * the day and time in the message (or calls, where the page has no WhatsApp),
 * behind the same sign-in as the page's own buttons. On a turf whose owner
 * takes booking requests on TapTurf (the read's requests: true), a time is a
 * button instead: it opens the request sheet (RequestSheet.tsx, fetched on
 * the first tap), where the player asks for 1 to 3 hours and the turf
 * confirms on myTapturf; nothing is paid online.
 *
 * Turf pages are built ahead and kept a day, so nothing here is in the page's
 * HTML: the server renders an empty, zero-height div; the browser reads
 * GET /api/availability/<id> once the page is idle, and draws nothing at all
 * for a turf with nothing fresh. So that its arrival moves nothing a player is
 * reading, the card appears only while its place is off the screen (below it,
 * or above it where the browser keeps the view still), and its time grid
 * never shrinks while a day is shown. Nothing is kept on the device and
 * nothing waits on the cookie banner.
 */
export function FreeSlotsCard({
  turfId,
  turfName,
  pageUrl,
  hours,
  phone,
  whatsappPhone,
  membersOnly,
}: {
  turfId: string;
  turfName: string;
  pageUrl: string;
  hours: SlotHours;
  phone: string | null;
  whatsappPhone: string | null;
  membersOnly: boolean;
}) {
  const { user, login } = useAuth();
  const anchor = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<PublicAvailability | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  // The request sheet's time, while it is open.
  const [sheet, setSheet] = useState<{ day: SlotDay; slot: Slot } | null>(null);
  // How far the server's clock is ahead of the device's (never behind: clientNow), kept from the last read.
  const lead = useRef(0);
  const fetchedAt = useRef(0);
  // The clock, worked out again on each minute (an hour drops off the moment it starts) and when the marks stop being fresh.
  const updatedRef = useRef<string | null>(null);
  const clock = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useCallback(function next() {
    const t = Date.now() + lead.current;
    setNow(t);
    if (clock.current) clearTimeout(clock.current);
    clock.current = setTimeout(next, nextTickMs(t, updatedRef.current));
  }, []);

  const read = useCallback(async () => {
    fetchedAt.current = Date.now();
    try {
      const res = await fetch(availabilityPath(turfId));
      const body: unknown = await res.json();
      const serverNow = body && typeof body === "object" ? (body as { now?: unknown }).now : null;
      const t = clientNow(typeof serverNow === "string" ? serverNow : null, Date.now());
      const a = parsePublic(body, t);
      lead.current = Math.max(0, t - Date.now());
      updatedRef.current = a?.updatedAt ?? null;
      setAvail(a);
      tick();
    } catch {
      /* no card */
    }
  }, [turfId, tick]);

  // Once the page is idle, then again when the tab comes back after a while.
  useEffect(() => {
    let idle: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => void read(), { timeout: 2000 });
    else timeout = setTimeout(() => void read(), 1200);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (fetchedAt.current) tick();
      if (fetchedAt.current && Date.now() - fetchedAt.current > REFETCH_AFTER_MS) void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (idle != null) window.cancelIdleCallback?.(idle);
      if (timeout) clearTimeout(timeout);
      if (clock.current) clearTimeout(clock.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [read, tick]);

  const days = useMemo(() => {
    if (!avail || now == null || !isFresh(avail.updatedAt, now)) return [];
    return freeDays(slotDays(hours, now), new Set(avail.booked));
  }, [avail, now, hours]);
  const ready = days.length > 0;

  // Appear only where it pushes nothing on screen: the anchor below the screen, or above it with scroll anchoring.
  useEffect(() => {
    if (!ready || revealed || !anchor.current || typeof IntersectionObserver === "undefined") return;
    const el = anchor.current;
    const anchored = typeof CSS !== "undefined" && CSS.supports?.("overflow-anchor", "auto");
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (!e || e.isIntersecting) return;
      const r = e.boundingClientRect;
      if (r.top >= window.innerHeight || (r.bottom <= 0 && anchored)) {
        io.disconnect();
        setRevealed(true);
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ready, revealed]);

  const picked = pick ? days.findIndex((d) => dayKey(d) === pick) : -1;
  const day = days[picked >= 0 ? picked : playerDefault(days)];
  const dayId = day ? dayKey(day) : "";

  // The time grid never shrinks while a day is shown (an hour that starts drops off): its tallest height, kept per day.
  const tallest = useRef<{ day: string; h: number }>({ day: "", h: 0 });
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    if (tallest.current.day !== dayId) {
      tallest.current = { day: dayId, h: 0 };
      el.style.minHeight = "";
    }
    const h = el.offsetHeight;
    if (h > tallest.current.h) {
      tallest.current.h = h;
      el.style.minHeight = `${h}px`;
    }
  });

  const { call, whatsapp } = contactLinks(phone, whatsappPhone);
  const kind: ContactKind | null = whatsapp ? "whatsapp" : call ? "call" : null;
  const show = ready && revealed && !!day && !!avail && now != null && !!kind;

  const hrefFor = (d: SlotDay, s: Slot) =>
    whatsapp ? buildWhatsAppLink({ phone: whatsapp.digits, text: slotMessage({ turfName, pageUrl, day: d, slot: s }) }) : call ? `tel:${call.e164}` : "#";
  const guard = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!kind) return;
    // Counted as the page's own Call and WhatsApp taps are; signed out, the tap opens sign-in instead.
    logContactClick({ turfId, kind, source: "turf_slots", signedIn: !!user, userId: user?.id });
    if (user) return;
    e.preventDefault();
    login();
  };
  const requests = !!avail?.requests;
  const time = (d: SlotDay, s: Slot) =>
    requests ? (
      <RequestTime key={s.key} day={d} slot={s} onOpen={() => setSheet({ day: d, slot: s })} />
    ) : (
      <Time key={s.key} day={d} slot={s} href={hrefFor(d, s)} wa={!!whatsapp} onClick={guard} />
    );
  // The server says hours were booked meanwhile: the card stops offering them.
  const onTaken = (keys: SlotKey[]) => setAvail((a) => (a ? { ...a, booked: [...new Set([...a.booked, ...keys])] } : a));
  // The turf stopped taking requests: the times go back to WhatsApp or Call.
  const onOff = () => setAvail((a) => (a ? { ...a, requests: false } : a));

  return (
    <div ref={anchor} data-nosnippet="">
      {show && day && avail && now != null && (
        <section className="section-divider" aria-labelledby="free-slots-h">
          <h2 id="free-slots-h" className="text-[22px] font-bold text-primary-800 font-serif mb-1">
            {PLAYER_COPY.title}
          </h2>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-800">
            <OwnerMark size={14} />
            {updatedLine(agoText(avail.updatedAt, now))}
          </p>

          <div role="tablist" aria-label="Day" className="mt-4 -mx-4 px-4 sm:mx-0 sm:px-0 flex gap-2 overflow-x-auto scrollbar-hide">
            {days.map((d) => {
              const on = dayKey(d) === dayId;
              return (
                <button
                  key={dayKey(d)}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setPick(dayKey(d))}
                  className={`shrink-0 h-11 px-4 rounded-full text-[14px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    on ? "bg-primary-900 text-white" : "bg-primary-50 border border-primary-100 text-primary-700 hover:bg-primary-100"
                  }`}
                >
                  {d.chip}
                </button>
              );
            })}
          </div>

          <div ref={grid} className="mt-3">
            <p className="text-[13px] font-semibold text-primary-500">{day.heading}</p>
            {day.free.length > 0 ? (
              <div className="mt-2 grid grid-cols-3 min-[360px]:grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                {day.free.filter((s) => !s.afterMidnight).map((s) => time(day, s))}
                {!day.night && day.free.some((s) => s.afterMidnight) && (
                  <p className="col-span-full mt-1 text-[12px] text-primary-500">{PLAYER_COPY.afterMidnight}</p>
                )}
                {day.free.filter((s) => s.afterMidnight).map((s) => time(day, s))}
              </div>
            ) : (
              <p className="mt-2 text-[14px] text-primary-600">{noFreeLine(day)}</p>
            )}
          </div>

          {day.free.length > 0 && (
            <p className="mt-4 text-[14px] text-primary-600">{requests ? PLAYER_COPY.hintRequest : whatsapp ? PLAYER_COPY.hintWhatsApp : PLAYER_COPY.hintCall}</p>
          )}
          <p className={`${day.free.length > 0 ? "mt-1" : "mt-4"} text-[13px] text-primary-500 leading-snug`}>{requests ? requestFooter(membersOnly) : playerFooter(membersOnly)}</p>
        </section>
      )}
      {sheet && avail && (
        <RequestSheet
          turfId={turfId}
          turfName={turfName}
          pageUrl={pageUrl}
          day={sheet.day}
          slot={sheet.slot}
          booked={new Set(avail.booked)}
          phone={phone}
          whatsappPhone={whatsappPhone}
          onClose={() => setSheet(null)}
          onTaken={onTaken}
          onOff={onOff}
        />
      )}
    </div>
  );
}

/** A free time on a turf that takes booking requests: it opens the request sheet. */
function RequestTime({ day, slot, onOpen }: { day: SlotDay; slot: Slot; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Request ${slot.range}, ${day.heading}${slot.afterMidnight && !day.night ? ", after midnight" : ""}`}
      aria-haspopup="dialog"
      className="h-11 rounded-full bg-accent-50 border border-accent-200 text-accent-800 text-[15px] font-semibold tabular-nums flex items-center justify-center cursor-pointer touch-manipulation hover:bg-accent-100 active:bg-accent-100 transition-colors"
    >
      {slot.label}
    </button>
  );
}

function Time({ day, slot, href, wa, onClick }: { day: SlotDay; slot: Slot; href: string; wa: boolean; onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const when = `${slot.range}, ${day.heading}${slot.afterMidnight && !day.night ? ", after midnight" : ""}`;
  return (
    <a
      href={href}
      {...(wa ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={onClick}
      aria-label={`${wa ? "WhatsApp" : "Call"} the turf about ${when}`}
      className="h-11 rounded-full bg-accent-50 border border-accent-200 text-accent-800 text-[15px] font-semibold tabular-nums flex items-center justify-center hover:bg-accent-100 active:bg-accent-100 transition-colors"
    >
      {slot.label}
    </a>
  );
}
