"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, Inbox } from "lucide-react";
import { hasUsableHours, nextTickMs, ownerDefault, slotDays, type Slot, type SlotDay } from "@/lib/availability/slots";
import { ADMIN_COPY, adminRequestLines, adminStatus, type AdminRequests, type AdminSlots as AdminView } from "@/lib/my/adminSlots";
import { getAdminSlots } from "@/lib/my/client";
import { SLOTS_CARD as CARD, SlotsFrame as Frame, SlotsSkeleton as Skeleton } from "./FreeSlots";

const RELOAD_AFTER_MS = 60_000;
const dayKey = (d: SlotDay) => `${d.date}${d.night ? "n" : ""}`;
type Loaded = undefined | AdminView | { error: string } | "missing" | "failed";
const isView = (x: Loaded): x is AdminView => typeof x === "object" && x !== null && "slots" in x;

/**
 * The Slots tab for the site owner (components/my/MyTurf.tsx shows it where
 * owner_slots refuses them: every turf opens for them on myTapturf, but only
 * someone who runs a turf may mark its free slots). The same day chips and
 * hours the owner sees (FreeSlots), each hour Free or Booked as the owner
 * marked it, the line that says whether players see them, and the turf's
 * booking requests by time alone, read from admin_turf_slots
 * (lib/my/client.ts getAdminSlots). Read only: the hours are not buttons,
 * and nothing here marks, confirms, switches or answers. No player's name,
 * number or note ever reaches it. Anything else (not the site owner, a turf
 * not claimed, the call failed, a database without the read) shows
 * fallback(why), the old note.
 */
export function AdminSlots({
  turfId,
  turfName,
  hasNumber,
  fallback,
}: {
  turfId: string;
  turfName: string;
  /** The turf's page shows Call or WhatsApp (lib/my/numbers.ts pageHasNumber). */
  hasNumber: boolean;
  /** The Slots tab's note (MyTurf SlotsOff) for: forbidden (and no read in the database yet), not_claimed, or a failure. */
  fallback: (why: string) => React.ReactNode;
}) {
  const [data, setData] = useState<Loaded>(undefined);
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const r = await getAdminSlots(turfId);
      // An answer replaces what is shown, except a malformed one while a view is up.
      const malformed = r !== "missing" && "error" in r && r.error === "malformed";
      setData((d) => (malformed && isView(d) ? d : r));
    } catch {
      setData((d) => (isView(d) ? d : "failed"));
    }
  }, [turfId]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoad.current > RELOAD_AFTER_MS) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  if (data === undefined)
    return (
      <Frame>
        <Skeleton />
      </Frame>
    );
  if (data === "missing") return fallback("forbidden");
  if (data === "failed") return fallback("failed");
  if (!isView(data)) return fallback(data.error);
  return <View view={data} turfName={turfName} hasNumber={hasNumber} />;
}

function View({ view, turfName, hasNumber }: { view: AdminView; turfName: string; hasNumber: boolean }) {
  const { slots, requests } = view;
  // The database's clock (the device's plus the skew at the answer), worked out again on each minute, as FreeSlots does.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const server = Date.parse(slots.now);
    const skew = Number.isFinite(server) ? server - Date.now() : 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now() + skew;
      setNow(t);
      timer = setTimeout(tick, nextTickMs(t, slots.updated_at));
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [slots.now, slots.updated_at]);
  const [pick, setPick] = useState<string | null>(null);
  const days = useMemo(() => (now != null ? slotDays(slots.hours, now) : []), [slots.hours, now]);
  const booked = useMemo(() => new Set(slots.booked), [slots.booked]);

  const banner = (
    <p role="note" className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] font-semibold leading-snug text-amber-900">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 [overflow-wrap:anywhere]">{ADMIN_COPY.banner(turfName)}</span>
    </p>
  );
  if (now == null)
    return (
      <Frame>
        {banner}
        <Skeleton />
      </Frame>
    );

  const footnote = <p className="mt-2 text-[12px] text-primary-400 leading-snug">{ADMIN_COPY.footnote}</p>;
  if (!hasUsableHours(slots.hours))
    return (
      <Frame>
        {banner}
        {requests && <Requests r={requests} />}
        <div className={CARD}>
          <p className="text-[14px] text-primary-700 leading-snug">{ADMIN_COPY.noHours}</p>
        </div>
        {footnote}
      </Frame>
    );

  const picked = pick ? days.findIndex((d) => dayKey(d) === pick) : -1;
  const day: SlotDay | undefined = days[picked >= 0 ? picked : ownerDefault(days)];
  const status = adminStatus(slots.updated_at, now, hasNumber);
  const dot = status.kind === "live" ? "bg-accent-500" : status.kind === "ending" ? "bg-amber-500" : status.kind === "hidden" ? "bg-red-500" : "bg-primary-300";
  const lineTone = status.kind === "ending" ? "text-amber-800" : status.kind === "hidden" ? "text-red-700" : "text-primary-700";
  const before = day ? day.slots.filter((s) => !s.afterMidnight) : [];
  const after = day ? day.slots.filter((s) => s.afterMidnight) : [];

  return (
    <Frame>
      {banner}
      {requests && <Requests r={requests} />}
      <div className={CARD}>
        <p className={`inline-flex items-start gap-2 text-[13px] font-semibold leading-snug ${lineTone}`}>
          <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden />
          <span>{status.line}</span>
        </p>

        {/* Days: these only choose what to look at. */}
        <div role="tablist" aria-label="Day" className="mt-3 -mx-4 px-4 flex gap-2 overflow-x-auto scrollbar-hide">
          {days.map((d) => {
            const on = day && dayKey(d) === dayKey(day);
            const quiet = d.state !== "open" || !d.slots.length;
            return (
              <button
                key={dayKey(d)}
                type="button"
                role="tab"
                aria-selected={!!on}
                onClick={() => setPick(dayKey(d))}
                className={`shrink-0 h-11 px-4 rounded-full text-[15px] font-semibold whitespace-nowrap cursor-pointer touch-manipulation transition-colors ${
                  on ? "bg-primary-900 text-white" : quiet ? "bg-primary-100 text-primary-400" : "bg-primary-100 text-primary-700"
                }`}
              >
                {d.chip}
              </button>
            );
          })}
        </div>

        {day && (
          <>
            <p className="mt-4 text-[14px] leading-snug">
              <span className="font-semibold text-primary-900">{day.heading}</span>
              {!day.night && day.open && (
                <>
                  {" "}
                  <span className="whitespace-nowrap text-primary-500">· Open {day.open}</span>
                </>
              )}
            </p>
            {day.slots.length > 0 ? (
              <ul aria-label={`${day.heading}: each hour as the owner marked it. Read only.`} className="mt-2 grid grid-cols-3 min-[360px]:grid-cols-4 sm:grid-cols-6 gap-2">
                {before.map((s) => (
                  <Hour key={s.key} slot={s} booked={booked.has(s.key)} />
                ))}
                {after.length > 0 && !day.night && (
                  <li aria-hidden className="col-span-full mt-1 text-[12px] font-semibold text-primary-500">
                    After midnight
                  </li>
                )}
                {after.map((s) => (
                  <Hour key={s.key} slot={s} booked={booked.has(s.key)} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 rounded-xl bg-primary-50 px-3 py-3 text-[14px] text-primary-600">
                {day.state === "closed" ? `Closed on ${day.weekday}.` : day.state === "open" && day.chip === "Today" ? "No more hours today." : `No opening hours for ${day.weekday}.`}
              </p>
            )}
            {slots.grounds != null && slots.grounds >= 2 && <p className="mt-2 text-[13px] text-primary-500 leading-snug">{ADMIN_COPY.grounds(slots.grounds)}</p>}
          </>
        )}
      </div>
      {footnote}
    </Frame>
  );
}

/** One hour as the owner marked it: the time and the word (colour is never the only sign). Not a button: nothing to tap. */
function Hour({ slot, booked }: { slot: Slot; booked: boolean }) {
  return (
    <li
      data-slot={slot.key}
      data-status={booked ? "booked" : "free"}
      className={`h-14 rounded-xl border-2 flex flex-col items-center justify-center select-none ${booked ? "bg-primary-900 border-primary-900" : "bg-white border-accent-200"}`}
    >
      <span className="sr-only">{ADMIN_COPY.hour(slot.range, booked)}</span>
      <span aria-hidden className={`text-[16px] font-bold tabular-nums leading-tight ${booked ? "text-white" : "text-primary-900"}`}>
        {slot.label}
      </span>
      <span aria-hidden className={`text-[12px] font-semibold leading-tight ${booked ? "text-white/80" : "text-accent-700"}`}>
        {booked ? "Booked" : "Free"}
      </span>
    </li>
  );
}

/** The turf's booking requests by time alone: On or Off, whether players can send now, and each waiting or confirmed one. */
function Requests({ r }: { r: AdminRequests }) {
  const l = adminRequestLines(r);
  return (
    <section id="requests" aria-labelledby="admin-requests-h" className={`${CARD} scroll-mt-20`}>
      <h3 id="admin-requests-h" className="inline-flex items-center gap-2 text-[16px] font-bold text-primary-900">
        <Inbox className="h-4 w-4 text-accent-700" aria-hidden />
        <span>
          {ADMIN_COPY.requests}: <span className={r.on ? "text-accent-700" : "text-primary-500"}>{l.state}</span>
        </span>
      </h3>
      <p className="mt-1 text-[13px] text-primary-600 leading-snug">{l.status}</p>
      <p className="mt-2 text-[13px] font-semibold text-primary-700">{l.counts}</p>
      {l.rows.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {l.rows.map((x) => (
            <li key={x.key} className="text-[14px] leading-snug text-primary-900 tabular-nums">
              {x.when}{" "}
              <span className={x.status === "confirmed" ? "font-semibold text-accent-700" : "font-semibold text-amber-700"}>· {x.status}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-primary-500 leading-snug">{ADMIN_COPY.private}</p>
    </section>
  );
}
