"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageCircle, Minus, Plus, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Sheet } from "@/components/account/Sheet";
import { logContactClick } from "@/lib/analytics/contactClicks";
import { availabilityPath } from "@/lib/availability/route";
import { clientNow, parsePublic, slotDays, type PublicAvailability, type Slot, type SlotDay, type SlotHours, type SlotKey } from "@/lib/availability/slots";
import { ASK_MINUTES, DEFAULT_MINUTES, sportWord, type AskDraft, type AskMinutes } from "@/lib/slotAsk/ask";
import { askDays, defaultDay, findTime, freeKeys, istToday, sameTime, sportChoices, stepPlayers, summary, type AskDay, type AskTime } from "@/lib/slotAsk/choices";
import { ASK_COPY as C } from "@/lib/slotAsk/copy";
import { saveDraft, sendSlotAsk } from "@/lib/slotAsk/device";
import { slotAskMessage } from "@/lib/slotAsk/message";
import { buildWhatsAppLink } from "@/lib/utils/whatsapp";

/**
 * "Ask for a slot" (18 Nov 2026): the sheet the turf page's button opens
 * (components/ui/CTAButtons.tsx; fetched on the first tap, so the page's
 * own JavaScript does not grow). The player picks a day and a start time
 * (two taps: a time, then Send; the day opens on today, or the next day
 * with an hour left), may change how long, the sport and the group size,
 * and "Send on WhatsApp" opens WhatsApp with the question written to the
 * turf (lib/slotAsk/message.ts). The turf answers there; TapTurf promises
 * nothing and takes no money. "Just message them" is the plain chat the
 * WhatsApp button used to open.
 *
 * The hours are the turf's own, as its page shows them
 * (lib/slotAsk/choices.ts). Where the owner keeps Free slots and the marks
 * are fresh (GET /api/availability/<id>, read when the sheet opens, only on
 * a claimed turf), the hours not marked Booked carry a "Free" dot and the
 * sheet says "marked by the owner"; the other hours stay, since a turf may
 * have more grounds. On a turf that takes requests on TapTurf (the pilot,
 * RequestSheet.tsx) a free hour does what it does on the Free slots card:
 * it opens the request sheet (onRequest); this sheet's WhatsApp ask is for
 * the other hours.
 *
 * Send is behind the same sign-in as the page's Call and WhatsApp buttons.
 * A signed-out tap is counted as theirs is, what was picked is kept in
 * this tab (lib/slotAsk/ask.ts DRAFT_KEY) and the sign-in opens; back on
 * the page the sheet opens with the choice (`draft`) and Send is one tap.
 * The tap that opens WhatsApp is a WhatsApp contact click (source
 * slot_ask) through logContactClick, which also notes it, with the time,
 * for "Did you get a slot?"; and the ask itself is stored with nothing
 * about the player (POST /api/slot-ask), never waited on.
 */

const CHIP = "relative h-11 rounded-full border text-[14px] font-semibold tabular-nums whitespace-nowrap flex items-center justify-center gap-1 cursor-pointer touch-manipulation transition-colors focus-neon";
const PLAIN = `${CHIP} bg-white border-primary-200 text-primary-900 hover:border-primary-400`;
const PICKED = `${CHIP} bg-primary-900 border-primary-900 text-white`;
const REQUEST = `${CHIP} bg-accent-50 border-accent-200 text-accent-800 hover:bg-accent-100`;
const LABEL = "text-[13px] font-semibold text-primary-600";
/** The "Free" mark on a start the owner's fresh marks leave free: a dot on the chip's corner (the legend under the times says what it is). */
const DOT = <span data-free-dot="" className="absolute right-1.5 top-1 h-2 w-2 rounded-full bg-accent-600 ring-2 ring-white" aria-hidden />;
/** The sheet's own bottom padding (components/account/Sheet.tsx), which the footer sits over. */
const PAD = "max(1.25rem,var(--safe-b,env(safe-area-inset-bottom)))";

export function SlotAskSheet({
  turfId,
  turfName,
  pageUrl,
  hours,
  sports,
  claimed,
  waDigits,
  plainHref,
  plainSource,
  openedAt,
  draft,
  onClose,
  onRequest,
}: {
  turfId: string;
  turfName: string;
  pageUrl: string;
  hours: SlotHours;
  sports: readonly string[];
  /** Only a claimed turf can have Free slots marked: the read is skipped for the rest. */
  claimed: boolean;
  /** The page's WhatsApp number as wa.me takes it (lib/utils/contact.ts contactLinks). */
  waDigits: string;
  /** The plain chat the page's WhatsApp button opened. */
  plainHref: string;
  /** Where the plain chat's tap is counted from (turf_bar, turf_sidebar), as before. */
  plainSource: string;
  /** When the button was tapped. */
  openedAt: number;
  /** What a signed-out player picked before the sign-in. */
  draft: AskDraft | null;
  onClose: () => void;
  /** A free hour on a turf that takes requests on TapTurf: the request sheet, as on the Free slots card. */
  onRequest: (day: SlotDay, slot: Slot, booked: SlotKey[]) => void;
}) {
  const uid = useId();
  const { user, login } = useAuth();
  const [now, setNow] = useState(openedAt);
  const [avail, setAvail] = useState<PublicAvailability | null>(null);
  const days = useMemo(() => askDays(hours, now), [hours, now]);
  const choices = useMemo(() => sportChoices(sports), [sports]);

  // What is picked. A choice kept across the sign-in is put back where it is still offered.
  const kept = useMemo(() => (draft ? findTime(askDays(hours, openedAt), draft.key) : null), [draft, hours, openedAt]);
  const [dayId, setDayId] = useState<string | null>(() => (kept ? askDays(hours, openedAt)[kept.day].id : null));
  const [timeKey, setTimeKey] = useState<SlotKey | null>(() => kept?.time.key ?? null);
  const [minutes, setMinutes] = useState<AskMinutes>(draft?.minutes ?? DEFAULT_MINUTES);
  const [sport, setSport] = useState<string | null>(() => (draft?.sport && choices.includes(draft.sport) ? draft.sport : (choices[0] ?? null)));
  const [players, setPlayers] = useState<number | null>(draft?.players ?? null);

  const dayAt = dayId ? days.findIndex((d) => d.id === dayId) : -1;
  const day: AskDay | undefined = days[dayAt >= 0 ? dayAt : defaultDay(days)];
  const time: AskTime | null = (timeKey && day?.times.find((t) => t.key === timeKey)) || null;

  // The owner's marks, where there can be any: read once, when the sheet opens.
  useEffect(() => {
    if (!claimed) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(availabilityPath(turfId));
        const body: unknown = await res.json();
        const serverNow = body && typeof body === "object" ? (body as { now?: unknown }).now : null;
        const a = parsePublic(body, clientNow(typeof serverNow === "string" ? serverNow : null, Date.now()));
        if (alive) setAvail(a);
      } catch {
        /* no marks: every hour is asked the same way */
      }
    })();
    return () => {
      alive = false;
    };
  }, [claimed, turfId]);

  // An hour that starts while the sheet is open stops being offered.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const free = useMemo(() => freeKeys(days, avail, now), [days, avail, now]);
  // A turf that takes requests on TapTurf: its free hours open the request sheet, as on the Free slots card.
  const requests = !!avail?.requests && free.size > 0;
  const dayFree = !!day && day.times.some((t) => free.has(t.key));

  const pickDay = (d: AskDay) => {
    setDayId(d.id);
    setTimeKey(sameTime(d, time)?.key ?? null);
  };
  const openRequest = (t: AskTime) => {
    if (!day) return;
    const src = slotDays(hours, now).find((d) => `${d.date}${d.night ? "n" : ""}` === day.id);
    const slot = src?.slots.find((s) => s.key === t.key);
    if (src && slot) onRequest(src, slot, avail?.booked ?? []);
  };

  const word = sportWord(sport);
  const href = time
    ? buildWhatsAppLink({
        phone: waDigits,
        text: slotAskMessage({ turfName, pageUrl, date: time.date, hour: time.hour, minute: time.minute, minutes, afterMidnight: time.afterMidnight, sport: word, players, today: istToday(now) }),
      })
    : null;

  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closing.current), []);

  const send = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!time) return e.preventDefault();
    if (!user) {
      // The page's own gate: the tap is counted (signed_in false), then the sign-in. What was picked waits in this tab.
      e.preventDefault();
      logContactClick({ turfId, kind: "whatsapp", source: "slot_ask", signedIn: false, turfName });
      saveDraft({ turf: turfId, key: time.key, minutes, sport, players, at: Date.now() });
      onClose();
      login();
      return;
    }
    // Signed in: the link opens WhatsApp by itself. Counted as a WhatsApp tap, noted with its time for "Did you get a slot?".
    logContactClick({ turfId, kind: "whatsapp", source: "slot_ask", signedIn: true, userId: user.id, turfName, ask: { date: time.date, hour: time.hour, minute: time.minute } });
    // The ask itself, with nothing about the player; never waited on.
    sendSlotAsk({ turf: turfId, date: time.date, hour: time.hour, minute: time.minute, minutes, sport: word, players, signedIn: true });
    closing.current = setTimeout(onClose, 400);
  };
  const plain = (e: React.MouseEvent<HTMLAnchorElement>) => {
    logContactClick({ turfId, kind: "whatsapp", source: plainSource, signedIn: !!user, userId: user?.id, turfName });
    if (user) {
      closing.current = setTimeout(onClose, 400);
      return;
    }
    e.preventDefault();
    onClose();
    login();
  };

  const chip = (t: AskTime) => {
    const isFree = free.has(t.key);
    if (requests && isFree)
      return (
        <button key={t.key} type="button" data-time={t.key} data-free="" aria-haspopup="dialog" aria-label={`${t.label}, ${C.free}: send a request`} onClick={() => openRequest(t)} className={REQUEST}>
          {DOT}
          {t.label}
        </button>
      );
    const on = t.key === time?.key;
    return (
      <button
        key={t.key}
        type="button"
        role="radio"
        aria-checked={on}
        aria-label={isFree ? `${t.label}, ${C.free.toLowerCase()}, marked by the owner` : t.label}
        data-time={t.key}
        {...(isFree ? { "data-free": "" } : {})}
        onClick={() => setTimeKey(t.key)}
        className={on ? PICKED : PLAIN}
      >
        {isFree && DOT}
        {t.label}
      </button>
    );
  };
  const early = day ? day.times.filter((t) => !t.afterMidnight) : [];
  const late = day ? day.times.filter((t) => t.afterMidnight) : [];

  return (
    <Sheet labelledBy={`${uid}-title`} describedBy={`${uid}-lead`} onClose={onClose}>
      <div data-slot-ask="">
        <button
          type="button"
          onClick={onClose}
          aria-label={C.close}
          className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-primary-500 hover:bg-primary-100 focus-neon cursor-pointer"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <h2 id={`${uid}-title`} className="pr-10 font-display text-2xl leading-tight text-primary-900 outline-none">
          {C.title}
        </h2>
        <p className="mt-1 truncate pr-10 text-[14px] text-primary-600">{turfName}</p>
        <p id={`${uid}-lead`} className="mt-0.5 text-[13px] text-primary-500">
          {draft && user ? C.back : C.lead}
        </p>

        <p id={`${uid}-day`} className={`mt-4 ${LABEL}`}>
          {C.day}
        </p>
        <div role="radiogroup" aria-labelledby={`${uid}-day`} className="-mx-5 mt-1.5 flex gap-2 overflow-x-auto px-5 pb-0.5 scrollbar-hide">
          {days.map((d) => {
            const on = d.id === day?.id;
            const shut = d.state === "closed";
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${d.heading}${shut ? ", closed" : ""}`}
                data-day={d.id}
                onClick={() => pickDay(d)}
                className={`flex h-12 min-w-[4.25rem] shrink-0 flex-col items-center justify-center rounded-2xl border px-3 leading-tight cursor-pointer touch-manipulation transition-colors focus-neon ${
                  on ? "border-primary-900 bg-primary-900 text-white" : shut ? "border-primary-100 bg-primary-50 text-primary-400" : "border-primary-200 bg-white text-primary-900 hover:border-primary-400"
                }`}
              >
                <span className="text-[14px] font-semibold whitespace-nowrap">{d.chip}</span>
                <span className={`text-[11px] whitespace-nowrap ${on ? "text-white/80" : shut ? "text-primary-400" : "text-primary-500"}`}>{shut ? "Closed" : d.sub}</span>
              </button>
            );
          })}
        </div>

        <p id={`${uid}-time`} className={`mt-4 ${LABEL}`}>
          {C.time}
        </p>
        {day && day.times.length > 0 ? (
          <>
            <div role="radiogroup" aria-labelledby={`${uid}-time`} className="mt-1.5 grid grid-cols-4 gap-2 min-[380px]:grid-cols-5 sm:grid-cols-6">
              {early.map(chip)}
              {!day.night && late.length > 0 && early.length > 0 && <p className="col-span-full mt-0.5 text-[12px] text-primary-500">{C.afterMidnight}</p>}
              {late.map(chip)}
            </div>
            {dayFree && (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-primary-600" data-free-legend="">
                <span className="mt-[5px] h-2 w-2 shrink-0 rounded-full bg-accent-600" aria-hidden />
                <span>{requests ? C.freeRequest : C.freeLegend}</span>
              </p>
            )}
            {day.guessed && <p className="mt-2 text-[12px] leading-snug text-primary-500">{C.guessed}</p>}
          </>
        ) : (
          <p role="status" className="mt-1.5 rounded-2xl bg-primary-50 px-4 py-3 text-[14px] leading-snug text-primary-700">
            {day?.state === "closed" ? C.closed(day.weekday) : C.noneLeft}
          </p>
        )}

        <p id={`${uid}-long`} className={`mt-4 ${LABEL}`}>
          {C.howLong}
        </p>
        <div role="radiogroup" aria-labelledby={`${uid}-long`} className="mt-1.5 grid grid-cols-4 gap-2">
          {ASK_MINUTES.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={m === minutes} data-minutes={m} onClick={() => setMinutes(m)} className={m === minutes ? PICKED : PLAIN}>
              {C.hours(m)}
            </button>
          ))}
        </div>

        {choices.length > 1 && (
          <>
            <p id={`${uid}-sport`} className={`mt-4 ${LABEL}`}>
              {C.sport}
            </p>
            <div role="radiogroup" aria-labelledby={`${uid}-sport`} className="mt-1.5 flex flex-wrap gap-2">
              {choices.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={s === sport} data-sport={s} onClick={() => setSport(s)} className={`${s === sport ? PICKED : PLAIN} px-4`}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className={LABEL}>
            {C.players} <span className="font-normal text-primary-400">· {C.playersHint}</span>
          </p>
          <div role="group" aria-label={C.players} className="flex items-center gap-1">
            <button
              type="button"
              aria-label={C.fewer}
              disabled={players == null}
              onClick={() => setPlayers((p) => stepPlayers(p, -1, sport))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary-200 text-primary-800 hover:border-primary-400 disabled:opacity-40 cursor-pointer touch-manipulation focus-neon"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <output aria-live="polite" data-players="" className={`min-w-[4.5rem] text-center text-[15px] font-semibold tabular-nums ${players == null ? "text-primary-400" : "text-primary-900"}`}>
              {players == null ? C.noPlayers : players}
            </output>
            <button
              type="button"
              aria-label={C.more}
              onClick={() => setPlayers((p) => stepPlayers(p, 1, sport))}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary-200 text-primary-800 hover:border-primary-400 cursor-pointer touch-manipulation focus-neon"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* Always in reach, however many hours the day has: the sheet scrolls under it. It covers the sheet's own bottom
            padding (a sticky box is held inside that padding, so it is let out by as much), and so sits the same whether or not the sheet scrolls. */}
        <div className="sticky -mx-5 mt-4 border-t border-primary-100 bg-white px-5 pt-3" style={{ bottom: `calc(-1 * ${PAD})`, marginBottom: `calc(-1 * ${PAD})`, paddingBottom: PAD }}>
          <p aria-live="polite" data-summary="" className={`text-center text-[14px] tabular-nums ${time ? "font-semibold text-primary-900" : "text-primary-500"}`}>
            {time ? summary(time, minutes) : C.pickTime}
          </p>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={send}
              data-send=""
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent-500 text-[17px] font-semibold text-white transition-colors hover:bg-accent-600 active:bg-accent-600 touch-manipulation focus-neon"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
              {C.send}
            </a>
          ) : (
            <button type="button" disabled data-send="" className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-100 text-[17px] font-semibold text-primary-400">
              <MessageCircle className="h-5 w-5" aria-hidden />
              {C.send}
            </button>
          )}
          {!user && <p className="mt-2 text-center text-[12px] leading-snug text-primary-500">{C.signIn}</p>}
          <p className="text-center">
            <a
              href={plainHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={plain}
              data-plain=""
              className="inline-flex min-h-11 items-center px-2 text-[14px] font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-900 focus-neon"
            >
              {C.justMessage}
            </a>
          </p>
        </div>
      </div>
    </Sheet>
  );
}
