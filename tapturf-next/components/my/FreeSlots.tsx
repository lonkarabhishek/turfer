"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import {
  UNDO_MS,
  clockLabel,
  closeChoices,
  hasUsableHours,
  nextTickMs,
  OWNER_NO_NUMBER,
  ownerDefault,
  ownerLead,
  ownerStatus,
  slotDays,
  wholeDay,
  type OwnerSlots,
  type Slot,
  type SlotChange,
  type SlotDay,
  type SlotStatus,
} from "@/lib/availability/slots";
import { fail, queueOf, settle, shown, takeBatch, tap, tapMany, unsaved, type Queue } from "@/lib/availability/queue";
import { confirmOwnerSlots, getOwnerSlots, saveSlotHours, setOwnerSlots } from "@/lib/my/client";
import { OWNER_COPY, toggleNotes, type SlotsStatus } from "@/lib/booking/requests";
import { BookingRequests, useOwnerBookings, type OwnerBookingsHook } from "./BookingRequests";

/** The first read, made with the dashboard's (components/my/MyTurf.tsx): not back yet, the answer, the database has no free slots yet, or the call failed. */
export type InitialSlots = undefined | OwnerSlots | { error: string } | "missing" | "failed";

type SaveError = "network" | "forbidden" | "not_claimed" | "other";
const RELOAD_AFTER_MS = 60_000;
const dayKey = (d: SlotDay) => `${d.date}${d.night ? "n" : ""}`;
const isView = (x: InitialSlots): x is OwnerSlots => typeof x === "object" && x !== null && "ok" in x;
const hasUnsaved = (x: Queue) => !!x.inflight || x.pending.size > 0;

/**
 * Free slots on a turf's own myTapturf page (/my/turf/<id>): day chips, and
 * that day's hours of the turf's opening hours as big buttons, each plainly
 * Free or Booked. One tap flips an hour and saves it at once (no Save
 * button); "All correct" says the day's marks are still right. Players see
 * the free hours on the turf page for 24 hours after the last tap or All
 * correct (lib/availability/slots.ts has every rule and word), and only
 * while the page has a number to call or WhatsApp (hasNumber: the card sits
 * beside those buttons); without one, the section says so and links to the
 * numbers (#numbers in EditListing).
 *
 * Hidden before the database has free slots, and for anyone who doesn't run
 * the turf (forbidden, not_claimed): then it shows whenOff(why), if given
 * (the Slots tab says why there is nothing to mark), else nothing.
 *
 * Whether a tap saved shows on screen wherever the owner has scrolled to
 * (SaveNote): Saving…, Saved, Not saved.
 *
 * Above the hours only what the daily check needs, so the first row of
 * hours is on the first screen of a small phone (360x560): the lead ("Tap an
 * hour when it gets booked ...") and the grounds rule show on first use;
 * after that the words on each hour say it, and the grounds rule sits under
 * the hours.
 */
export function FreeSlots({
  turfId,
  initial,
  hoursKey,
  onHoursSaved,
  hasNumber = true,
  whenOff,
}: {
  turfId: string;
  initial: InitialSlots;
  hoursKey: string;
  onHoursSaved: () => void;
  /** The turf's page shows Call or WhatsApp (lib/my/numbers.ts pageHasNumber). */
  hasNumber?: boolean;
  /** What to show instead when there is nothing to mark: "missing" (no free slots in the database yet) or the refusal (forbidden, not_claimed, malformed). */
  whenOff?: (why: string) => React.ReactNode;
}) {
  if (initial === undefined) return <Frame><Skeleton /></Frame>;
  if (initial === "missing") return whenOff?.("missing") ?? null;
  if (!isView(initial) && initial !== "failed") return whenOff?.(initial.error) ?? null;
  return <Editor turfId={turfId} initial={initial} hoursKey={hoursKey} onHoursSaved={onHoursSaved} hasNumber={hasNumber} whenOff={whenOff} />;
}

/**
 * The section around every state. lead: first use (never updated), when the
 * lead and the grounds rule show above the card; else nothing above it (the
 * Editor puts the grounds rule under the hours).
 */
function Frame({ children, lead = null }: { children: React.ReactNode; lead?: { hasNumber: boolean; grounds?: number | null } | null }) {
  return (
    <section id="slots" aria-labelledby="slots-h" className={`${lead ? "mt-5" : "mt-2"} scroll-mt-20`}>
      {/* Named for screen readers; on screen the Slots tab above says it, and the hours start sooner. */}
      <h2 id="slots-h" className="sr-only">
        Free slots
      </h2>
      {lead && (
        <>
          <p className="text-[14px] text-primary-600 leading-snug">{ownerLead(lead.hasNumber)}</p>
          <GroundsRule grounds={lead.grounds} className="mt-1 text-[14px]" />
        </>
      )}
      {children}
    </section>
  );
}

/** Two grounds or more: an hour is booked only when every ground is. */
function GroundsRule({ grounds, className }: { grounds?: number | null; className: string }) {
  if (grounds == null || grounds < 2) return null;
  return <p className={`${className} text-primary-500 leading-snug`}>You have {grounds} grounds: mark an hour booked only when all of them are taken.</p>;
}

const CARD = "mt-3 rounded-2xl border border-primary-200 bg-white p-4";

function Skeleton() {
  return (
    <div className={CARD} aria-hidden>
      <div className="h-11 rounded-full bg-primary-100 animate-pulse" />
      <div className="mt-3 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-11 w-20 shrink-0 rounded-full bg-primary-100 animate-pulse" />
        ))}
      </div>
      <div className="mt-4 h-4 w-48 rounded bg-primary-100 animate-pulse" />
      <div className="mt-3 grid grid-cols-3 min-[360px]:grid-cols-4 sm:grid-cols-6 gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`h-14 rounded-xl bg-primary-100 animate-pulse ${i >= 6 ? "hidden min-[360px]:block" : ""}`} />
        ))}
      </div>
    </div>
  );
}

function Editor({
  turfId,
  initial,
  hoursKey,
  onHoursSaved,
  hasNumber,
  whenOff,
}: {
  turfId: string;
  initial: OwnerSlots | "failed";
  hoursKey: string;
  onHoursSaved: () => void;
  hasNumber: boolean;
  whenOff?: (why: string) => React.ReactNode;
}) {
  const first = isView(initial) ? initial : null;
  // The owner's view (hours, grounds), as the database last answered it.
  const [view, setView] = useState<OwnerSlots | null>(first);
  const [phase, setPhase] = useState<"ready" | "loading" | "failed" | "hidden">(first ? "ready" : "failed");
  // Why a later read hid the section (the turf's claim ended, say), for whenOff.
  const [offWhy, setOffWhy] = useState("forbidden");
  const [q, setQ] = useState<Queue>(() => queueOf(first?.booked ?? []));
  const qRef = useRef(q);
  const [updatedAt, setUpdatedAt] = useState<string | null>(first?.updated_at ?? null);
  const updatedRef = useRef<string | null>(first?.updated_at ?? null);
  // First use (never updated when the section opened): the status line and its button go under the hours, so the
  // owner sees the hours before showing them, and stay there until the page is opened again (nothing jumps on a tap).
  const [firstUse] = useState(() => !!first && !first.updated_at);
  // The database's clock: now = the device's + skew, taken at each answer, so a phone set wrong shows the right hours.
  const skewRef = useRef(0);
  const [now, setNow] = useState<number | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [err, setErr] = useState<SaveError | null>(null);
  // "Not saved" on screen (SaveNote) for a few seconds after a failed save, with what to do (the reason stays under the hours).
  const [failNote, setFailNote] = useState<SaveError | null>(null);
  const [confirm, setConfirm] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [undo, setUndo] = useState<{ day: string; status: SlotStatus; changes: SlotChange[] } | null>(null);
  const lastLoad = useRef(0);
  const sending = useRef(false);
  const timers = useRef<{
    flash?: ReturnType<typeof setTimeout>;
    fail?: ReturnType<typeof setTimeout>;
    confirm?: ReturnType<typeof setTimeout>;
    undo?: ReturnType<typeof setTimeout>;
    clock?: ReturnType<typeof setTimeout>;
  }>({});
  const saveFailed = useCallback((e: SaveError) => {
    setErr(e);
    setFailNote(e);
    clearTimeout(timers.current.fail);
    timers.current.fail = setTimeout(() => setFailNote(null), 4000);
  }, []);

  const commit = useCallback((next: Queue) => {
    qRef.current = next;
    setQ(next);
  }, []);
  // The clock, worked out again on each minute (an hour drops off the moment it starts) and when players stop seeing the marks.
  const tick = useCallback(function next() {
    const t = Date.now() + skewRef.current;
    setNow(t);
    clearTimeout(timers.current.clock);
    timers.current.clock = setTimeout(next, nextTickMs(t, updatedRef.current));
  }, []);
  const clockFrom = useCallback(
    (serverNow: string) => {
      const t = Date.parse(serverNow);
      if (Number.isFinite(t)) skewRef.current = t - Date.now();
      tick();
    },
    [tick],
  );
  /** An answer from the database: what to draw from, and when it was last updated. */
  const take = useCallback(
    (r: OwnerSlots) => {
      setView(r);
      setUpdatedAt(r.updated_at);
      updatedRef.current = r.updated_at;
      clockFrom(r.now);
    },
    [clockFrom],
  );

  const reload = useCallback(async () => {
    if (hasUnsaved(qRef.current)) return;
    lastLoad.current = Date.now();
    try {
      const r = await getOwnerSlots(turfId);
      if (r === "missing" || "error" in r) {
        setOffWhy(r === "missing" ? "missing" : r.error);
        return setPhase("hidden");
      }
      if (hasUnsaved(qRef.current)) return; // a tap came in meanwhile: its own answer brings the marks
      commit(queueOf(r.booked));
      take(r);
      setPhase("ready");
    } catch {
      setPhase((p) => (p === "ready" ? p : "failed"));
    }
  }, [turfId, commit, take]);

  // Booking requests (components/my/BookingRequests.tsx): the switch and the list sit at the top of this section.
  // A confirm or a cancel changes marks, so the hours below are read again.
  const bookings = useOwnerBookings(turfId, { onSlotsChanged: () => void reload() });

  // The first answer's clock (tick keeps it), and a fresh read when the tab comes back.
  useEffect(() => {
    const t = setTimeout(() => {
      lastLoad.current = Date.now();
      if (first) clockFrom(first.now);
      else tick();
    }, 0);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      tick();
      if (Date.now() - lastLoad.current > RELOAD_AFTER_MS) void reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    const tm = timers.current;
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(tm.flash);
      clearTimeout(tm.fail);
      clearTimeout(tm.confirm);
      clearTimeout(tm.undo);
      clearTimeout(tm.clock);
    };
    // Once: first is the answer this section opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The owner changed their hours (Edit your listing, or the picker below): read the hours again.
  const hoursSeen = useRef(hoursKey);
  useEffect(() => {
    if (hoursSeen.current === hoursKey) return;
    const t = setTimeout(() => {
      hoursSeen.current = hoursKey;
      void reload();
    }, 0);
    return () => clearTimeout(t);
  }, [hoursKey, reload]);

  /** A failure: no "Saved" tick left from an earlier save next to it. */
  const noFlash = useCallback(() => {
    clearTimeout(timers.current.flash);
    setFlash(false);
  }, []);

  /** Save what waits, one batch at a time; taps made meanwhile go in the next. A failure puts every unsaved tap back. */
  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      for (;;) {
        const taken = takeBatch(qRef.current);
        if (!taken) break;
        commit(taken.q);
        let r: OwnerSlots | { error: string };
        try {
          r = await setOwnerSlots(turfId, taken.batch);
        } catch {
          commit(fail(qRef.current));
          setUndo(null);
          noFlash();
          saveFailed("network");
          break;
        }
        if ("error" in r) {
          commit(fail(qRef.current));
          setUndo(null);
          noFlash();
          saveFailed(r.error === "forbidden" || r.error === "not_claimed" ? r.error : "other");
          break;
        }
        commit(settle(qRef.current, r.booked));
        take(r);
        setFlash(true);
        clearTimeout(timers.current.flash);
        timers.current.flash = setTimeout(() => setFlash(false), 2000);
      }
    } finally {
      sending.current = false;
    }
  }, [turfId, commit, take, noFlash, saveFailed]);

  const onTap = (key: string) => {
    setErr(null);
    setFailNote(null);
    setConfirm("idle");
    commit(tap(qRef.current, key));
    void flush();
  };

  const onConfirm = async () => {
    if (hasUnsaved(qRef.current)) return;
    setErr(null);
    setConfirm("busy");
    try {
      const r = await confirmOwnerSlots(turfId);
      if ("error" in r) {
        setConfirm("idle");
        noFlash();
        setErr(r.error === "forbidden" || r.error === "not_claimed" ? r.error : "other");
        return;
      }
      if (!hasUnsaved(qRef.current)) commit(settle(qRef.current, r.booked));
      take(r);
      setConfirm("done");
      clearTimeout(timers.current.confirm);
      timers.current.confirm = setTimeout(() => setConfirm("idle"), 2000);
    } catch {
      noFlash();
      setConfirm("error");
    }
  };

  const days = useMemo(() => (view && now != null ? slotDays(view.hours, now) : []), [view, now]);
  const booked = useMemo(() => shown(q), [q]);

  if (phase === "hidden") return whenOff?.(offWhy) ?? null;
  // First use: the lead and the grounds rule above the hours (Frame); later, the grounds rule under them.
  const lead = firstUse ? { hasNumber, grounds: view?.grounds } : null;
  if (phase === "loading" || (phase === "ready" && (!view || now == null))) return <Frame lead={lead}><Skeleton /></Frame>;
  if (phase === "failed" || !view)
    return (
      <Frame>
        <div className={CARD}>
          <p className="text-[14px] text-primary-700">Couldn&rsquo;t load your free slots.</p>
          <button
            type="button"
            onClick={() => {
              setPhase("loading");
              void reload().then(() => setPhase((p) => (p === "loading" ? "failed" : p)));
            }}
            className="mt-3 h-11 px-5 rounded-full border border-primary-200 text-[14px] font-semibold text-primary-900 cursor-pointer"
          >
            Try again
          </button>
        </div>
      </Frame>
    );

  const footnote = (
    <p className="mt-2 text-[12px] text-primary-400 leading-snug">
      Players see free slots for 24 hours after your last tap or All correct. Changes reach your page within 2 minutes.{" "}
      {hasUsableHours(view.hours) && (
        <>
          Hours wrong?{" "}
          {/* 44px to tap, the line's height unchanged (the negative margin takes the extra back). */}
          <a href="#hours" className="-my-[14px] inline-flex min-h-11 items-center font-semibold text-accent-700 hover:underline">
            Change your hours
          </a>
        </>
      )}
    </p>
  );

  // No hours to make slots from: the owner picks them once, here.
  if (!hasUsableHours(view.hours))
    return (
      <Frame lead={lead}>
        <div className={CARD}>
          <HoursPicker
            turfId={turfId}
            onSaved={() => {
              onHoursSaved();
              void reload();
            }}
          />
        </div>
        {footnote}
      </Frame>
    );

  const picked = pick ? days.findIndex((d) => dayKey(d) === pick) : -1;
  const day: SlotDay | undefined = days[picked >= 0 ? picked : ownerDefault(days)];
  const status = ownerStatus(updatedAt, now ?? 0, hasNumber);
  const busy = hasUnsaved(q);
  const whole = day ? wholeDay(day, booked) : null;
  const undoHere = undo && day && undo.day === dayKey(day) ? undo : null;
  const before = day ? day.slots.filter((s) => !s.afterMidnight) : [];
  const after = day ? day.slots.filter((s) => s.afterMidnight) : [];

  const doWhole = () => {
    if (!whole || !day) return;
    setErr(null);
    setFailNote(null);
    commit(tapMany(qRef.current, whole.changes));
    setUndo({ day: dayKey(day), status: whole.status, changes: whole.undo });
    clearTimeout(timers.current.undo);
    timers.current.undo = setTimeout(() => setUndo(null), UNDO_MS);
    void flush();
  };
  const doUndo = () => {
    if (!undo) return;
    commit(tapMany(qRef.current, undo.changes));
    setUndo(null);
    clearTimeout(timers.current.undo);
    void flush();
  };

  const dot = status.kind === "live" ? "bg-accent-500" : status.kind === "ending" ? "bg-amber-500" : status.kind === "hidden" ? "bg-red-500" : "bg-primary-300";
  const lineTone = status.kind === "ending" ? "text-amber-800" : status.kind === "hidden" ? "text-red-700" : "text-primary-700";

  // Whether players see it, and the one tap that keeps it showing: on top for the daily check, under the hours on first use.
  // A page with no number says so on top even on first use (players see none of this until it has one); its All correct
  // goes under the hours, so the first row of hours stays on a small phone's first screen.
  const noNumber = status.kind === "no_number";
  const lineOnTop = !firstUse || noNumber;
  const buttonOnTop = !firstUse && !noNumber;
  const line = (
    <p className={`min-w-0 flex-1 ${noNumber || status.kind === "never" ? "basis-48" : "basis-28"} inline-flex items-start gap-2 text-[13px] font-semibold leading-snug ${lineTone}`}>
      <span className={`mt-[5px] w-2 h-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span>
        {status.line}
        {noNumber && (
          <>
            {" "}
            {/* 44px to tap, the line's height unchanged (the negative margin takes the extra back). */}
            <a href="#numbers" className="-my-[13px] inline-flex min-h-11 items-center text-accent-700 underline underline-offset-2">
              {OWNER_NO_NUMBER.link}
            </a>
          </>
        )}
      </span>
    </p>
  );
  const button = (
    <button
      type="button"
      onClick={() => void onConfirm()}
      disabled={busy || confirm === "busy"}
      className="shrink-0 inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-full bg-primary-900 text-white text-[14px] font-semibold cursor-pointer touch-manipulation disabled:opacity-40"
    >
      {confirm === "busy" ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> {status.button}
        </>
      ) : confirm === "done" ? (
        <>
          <Check className="w-4 h-4" aria-hidden /> Done
        </>
      ) : (
        <>
          <Check className="w-4 h-4" aria-hidden /> {status.button}
        </>
      )}
    </button>
  );
  const statusRow = (withLine: boolean, withButton: boolean, onTop: boolean) => (
    <>
      {/* The line and All correct side by side down to 320px (the line wraps); a long line or button goes on its own row. */}
      <div className={`flex flex-wrap items-center ${withLine ? "justify-between" : "justify-end"} gap-x-3 gap-y-2 ${onTop ? "" : "mt-4 border-t border-primary-100 pt-4"}`}>
        {withLine && line}
        {withButton && button}
      </div>
      {withButton && confirm === "error" && (
        <p role="alert" className="mt-2 text-[13px] text-red-600">
          Couldn&rsquo;t update. Check your connection and try again.
        </p>
      )}
    </>
  );

  return (
    <Frame lead={lead}>
      <BookingRequests turfId={turfId} hook={bookings} grounds={view.grounds} />
      {hasNumber && bookings.state && <RequestsToggle hook={bookings} status={status} />}
      <div className={CARD}>
        {lineOnTop && statusRow(true, buttonOnTop, true)}

        {/* Days */}
        <div role="tablist" aria-label="Day" className={`${lineOnTop ? "mt-3" : ""} -mx-4 px-4 flex gap-2 overflow-x-auto scrollbar-hide`}>
          {days.map((d) => {
            const on = day && dayKey(d) === dayKey(day);
            const quiet = d.state !== "open" || !d.slots.length;
            return (
              <button
                key={dayKey(d)}
                type="button"
                role="tab"
                aria-selected={!!on}
                onClick={() => {
                  setPick(dayKey(d));
                  setUndo(null);
                }}
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
              <div className="mt-2 grid grid-cols-3 min-[360px]:grid-cols-4 sm:grid-cols-6 gap-2">
                {before.map((s) => (
                  <Hour key={s.key} slot={s} booked={booked.has(s.key)} pending={unsaved(q, s.key)} onTap={onTap} />
                ))}
                {after.length > 0 && !day.night && <p className="col-span-full mt-1 text-[12px] font-semibold text-primary-500">After midnight</p>}
                {after.map((s) => (
                  <Hour key={s.key} slot={s} booked={booked.has(s.key)} pending={unsaved(q, s.key)} onTap={onTap} />
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-xl bg-primary-50 px-3 py-3 text-[14px] text-primary-600">
                {day.state === "closed" ? (
                  `Closed on ${day.weekday}.`
                ) : day.state === "open" && day.chip === "Today" ? (
                  "No more hours today."
                ) : (
                  <>
                    No opening hours for {day.weekday}.{" "}
                    <a href="#hours" className="-my-3 inline-flex min-h-11 items-center font-semibold text-accent-700 hover:underline">
                      Change your hours
                    </a>
                  </>
                )}
              </p>
            )}

            {!firstUse && <GroundsRule grounds={view.grounds} className="mt-2 text-[13px]" />}

            {err && (
              <p role="alert" className="mt-3 text-[13px] text-red-600">
                {err === "network" ? (
                  "Not saved. Check your connection and tap again."
                ) : err === "forbidden" ? (
                  <>
                    Couldn&rsquo;t save.{" "}
                    <Link href={`/login?next=${encodeURIComponent(`/my/turf/${turfId}`)}`} className="font-semibold underline">
                      Sign in again
                    </Link>
                    .
                  </>
                ) : err === "not_claimed" ? (
                  "Couldn't save: this turf isn't claimed any more."
                ) : (
                  "Couldn't save. Try again."
                )}
              </p>
            )}

            {/* One quick action for the whole day, and its Undo. */}
            {undoHere ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="text-[14px] text-primary-700">Whole day marked {undoHere.status}.</p>
                <button type="button" onClick={doUndo} className="h-11 px-3 -mx-1 rounded-full text-[14px] font-semibold text-accent-700 cursor-pointer touch-manipulation hover:underline">
                  Undo
                </button>
              </div>
            ) : (
              whole && (
                <button
                  type="button"
                  onClick={doWhole}
                  className="mt-3 w-full sm:w-auto h-11 px-4 rounded-full border border-primary-200 text-[14px] font-semibold text-primary-900 cursor-pointer touch-manipulation hover:bg-primary-50"
                >
                  {whole.status === "booked" ? "Mark whole day booked" : "Mark whole day free"}
                </button>
              )
            )}
          </>
        )}
        {!lineOnTop ? statusRow(true, true, false) : !buttonOnTop && statusRow(false, true, false)}
      </div>
      {footnote}
      <SaveNote state={busy ? "saving" : failNote ? "error" : flash ? "saved" : null} failed={failNote} />
    </Frame>
  );
}

/**
 * Whether the taps saved, so the owner sees it wherever they tapped: Saving…
 * and Saved at the bottom of the screen (above the phone's bottom bar); Not
 * saved under the header, clear of the reason and what to do, which is under
 * the hours. Always in the page, empty when there is nothing to say, so
 * screen readers hear each change. Not saved says what to do only when it
 * helps: tap again after a dropped connection or a hiccup, sign in again
 * when the sign-in ran out; a turf no longer claimed has nothing to do here
 * (the line under the hours says why).
 */
function SaveNote({ state, failed }: { state: "saving" | "saved" | "error" | null; failed: SaveError | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 ${
        state === "error" ? "top-[4.25rem] md:top-[4.75rem]" : "bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-6"
      }`}
    >
      {state && (
        <span
          className={`inline-flex items-center gap-2 h-10 px-4 rounded-full shadow-elevated text-[14px] font-semibold text-white ${
            state === "error" ? "bg-red-600" : state === "saved" ? "bg-accent-600" : "bg-primary-900"
          }`}
        >
          {state === "saving" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : state === "saved" ? (
            <>
              <Check className="w-4 h-4" aria-hidden /> Saved
            </>
          ) : failed === "forbidden" ? (
            "Not saved. Sign in again."
          ) : failed === "not_claimed" ? (
            "Not saved."
          ) : (
            "Not saved. Tap again."
          )}
        </span>
      )}
    </div>
  );
}

/**
 * "Take booking requests on TapTurf" (off until the owner turns it on): with
 * it on, players can ask for a free hour on the turf's page and the owner
 * confirms or declines above. Shown only where the page has a number. While
 * the free hours don't show to players (never shown, or a day old), it says
 * requests can't come either, naming the button below that shows them
 * (lib/booking/requests.ts toggleNotes).
 */
function RequestsToggle({ hook, status }: { hook: OwnerBookingsHook; status: SlotsStatus }) {
  const on = hook.state?.on === true;
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [justOn, setJustOn] = useState(false);
  const flip = async () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    const saved = await hook.setOn(!on);
    setSaving(false);
    if (!saved) return setFailed(true);
    setJustOn(!on);
  };
  const lines = toggleNotes({ on, justOn, status });
  return (
    <div className={CARD}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={saving}
        onClick={() => void flip()}
        className="w-full min-h-11 flex items-center justify-between gap-3 text-left cursor-pointer touch-manipulation disabled:cursor-wait"
      >
        <span className="text-[15px] font-semibold text-primary-900 leading-snug">{OWNER_COPY.toggle}</span>
        <span
          aria-hidden
          className={`relative shrink-0 w-[52px] h-8 rounded-full transition-colors ${on ? "bg-accent-600" : "bg-primary-200"} ${saving ? "opacity-70" : ""}`}
        >
          <span className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow flex items-center justify-center transition-transform ${on ? "translate-x-5" : ""}`}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary-500" />}
          </span>
        </span>
      </button>
      <p className="mt-1 text-[13px] text-primary-500 leading-snug">{OWNER_COPY.toggleHelp}</p>
      {lines.on && <p className="mt-2 text-[13px] font-semibold text-accent-800">{lines.on}</p>}
      {lines.hidden && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800 leading-snug">{lines.hidden}</p>}
      {failed && (
        <p role="alert" className="mt-2 text-[13px] text-red-600">
          {OWNER_COPY.toggleFailed}
        </p>
      )}
    </div>
  );
}

/** One hour: the time, and the word for its state (colour is never the only sign). One tap flips it. */
function Hour({ slot, booked, pending, onTap }: { slot: Slot; booked: boolean; pending: boolean; onTap: (key: string) => void }) {
  return (
    <button
      type="button"
      aria-pressed={booked}
      aria-label={`${slot.range}, ${booked ? "booked" : "free"}. Tap to mark ${booked ? "free" : "booked"}.`}
      onClick={() => onTap(slot.key)}
      className={`h-14 rounded-xl border-2 flex flex-col items-center justify-center cursor-pointer touch-manipulation select-none transition-colors ${
        booked ? "bg-primary-900 border-primary-900" : "bg-white border-accent-200 active:bg-accent-50"
      } ${pending ? "opacity-70" : ""}`}
    >
      <span className={`text-[16px] font-bold tabular-nums leading-tight ${booked ? "text-white" : "text-primary-900"}`}>{slot.label}</span>
      <span className={`text-[12px] font-semibold leading-tight ${booked ? "text-white/80" : "text-accent-700"}`}>{booked ? "Booked" : "Free"}</span>
    </button>
  );
}

const SELECT = "w-full h-11 px-3 rounded-xl border border-primary-200 bg-white text-[15px] text-primary-900 focus:outline-none focus:border-primary-400 disabled:bg-primary-50 disabled:text-primary-400";

/** A turf with no hours to make slots from: when it opens and closes, once (saved as the listing's hours). */
function HoursPicker({ turfId, onSaved }: { turfId: string; onSaved: () => void }) {
  const [open, setOpen] = useState("");
  const [close, setClose] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const ready = allDay || (!!open && !!close);

  const save = async () => {
    if (!ready) return;
    setState("saving");
    try {
      if (!(await saveSlotHours(turfId, { open, close, allDay }))) return setState("error");
      setState("idle");
      onSaved();
    } catch {
      setState("error");
    }
  };

  return (
    <div>
      <p className="text-[15px] font-semibold text-primary-900">First, when are you open?</p>
      <p className="mt-0.5 text-[13px] text-primary-500">Pick once. Your page shows these hours too.</p>
      {!allDay && (
        <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <label htmlFor={`${turfId}-opens`} className="text-[14px] text-primary-700">
            Opens
          </label>
          <select
            id={`${turfId}-opens`}
            value={open}
            onChange={(e) => {
              setOpen(e.target.value);
              setClose("");
              setState("idle");
            }}
            className={SELECT}
          >
            <option value="" disabled>
              Pick
            </option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={`${String(h).padStart(2, "0")}:00`}>
                {clockLabel(h * 60)}
              </option>
            ))}
          </select>
          <label htmlFor={`${turfId}-closes`} className="text-[14px] text-primary-700">
            Closes
          </label>
          <select
            id={`${turfId}-closes`}
            value={close}
            disabled={!open}
            onChange={(e) => {
              setClose(e.target.value);
              setState("idle");
            }}
            className={SELECT}
          >
            <option value="" disabled>
              Pick
            </option>
            {open &&
              closeChoices(Number(open.slice(0, 2))).map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
          </select>
        </div>
      )}
      <label className="mt-3 flex items-center gap-2.5 min-h-11 cursor-pointer">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => {
            setAllDay(e.target.checked);
            setState("idle");
          }}
          className="w-5 h-5 accent-[#16A34A]"
        />
        <span className="text-[15px] text-primary-800">Open 24 hours</span>
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={!ready || state === "saving"}
        className="mt-2 inline-flex items-center justify-center h-11 px-5 rounded-full bg-primary-900 text-white text-[14px] font-semibold cursor-pointer disabled:opacity-40"
      >
        {state === "saving" ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Saving" /> : "Save hours"}
      </button>
      {state === "error" && (
        <p role="alert" className="mt-2 text-[13px] text-red-600">
          Couldn&rsquo;t save your hours. Check your connection and try again.
        </p>
      )}
    </div>
  );
}

// The section's frame, card and loading state, for the site owner's read-only Slots tab (components/my/AdminSlots.tsx).
export { Frame as SlotsFrame, Skeleton as SlotsSkeleton, CARD as SLOTS_CARD };
