"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useAsk } from "@/components/ask/AskProvider";
import { useCookieBanner } from "@/lib/consent";
import { loadMemory, loadTap, saveMemory, saveTap } from "@/lib/outcome/device";
import { DAYS, HOURS, OUTCOME_COPY as C, hourLabel, outcomeBody, shortName, startHour, thanksFor, type Day, type OutcomeAnswer, type Reason } from "@/lib/outcome/outcome";
import { afterAnswer, afterAsk, afterClose, decide, leftAfterTap, quietPath, type Tap } from "@/lib/outcome/prompt";
import type { OutcomeReply } from "@/lib/outcome/route";

/**
 * "Back from <turf>? Did you get a slot?": one small card over the phone's
 * bottom bar, shown once when a player returns after tapping Call or
 * WhatsApp (lib/outcome/prompt.ts decides when, and keeps it from
 * nagging). Not a modal: no backdrop, no focus trap, the page stays usable;
 * ✕ or Esc closes it (and nothing is asked for three days). One question
 * at a time, tapped, never typed. The answer is sent once, at the end
 * (POST /api/contact-outcome), with nothing about the player; the card
 * never waits on it. While the cookie card, the Ask panel or any sheet is
 * open it waits its turn. It sits above whatever holds the bottom edge (the
 * nav, a turf's Call and WhatsApp bar, the Ask pill: every
 * [data-bottom-bar], and a bar that lifts the cookie banner).
 */

/** After the return, before the card rises. */
const SHOW_AFTER_MS = 700;
/** The thanks stays this long, then the card goes by itself. */
const THANKS_MS = 2200;
/** With the free hours link in it, long enough to read and tap. */
const THANKS_LINK_MS = 8000;
const OUT_MS = 320;
/** While something else holds the screen (a sheet, the cookie card), it looks again this often. */
const BUSY_AGAIN_MS = 4000;

type Step = "ask" | "when" | "why" | "thanks";
type Draft = Pick<OutcomeAnswer, "outcome" | "reason" | "day" | "hour">;

const CHIP =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-[14px] font-semibold transition-colors touch-manipulation cursor-pointer focus-neon";
const PLAIN = `${CHIP} border-primary-200 bg-white text-primary-900 hover:bg-primary-50 active:bg-primary-100`;
const PICKED = `${CHIP} border-primary-900 bg-primary-900 text-white`;
const YES = `${CHIP} border-accent-500 bg-accent-500 text-white hover:bg-accent-600 active:bg-accent-600`;

/** How far the bars under the card reach up from the bottom of the window. */
function barLift(card: HTMLElement): number {
  const c = card.getBoundingClientRect();
  let lift = 0;
  document.querySelectorAll<HTMLElement>("[data-bottom-bar]").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.right > c.left && r.left < c.right && r.top > window.innerHeight / 2) lift = Math.max(lift, window.innerHeight - r.top);
  });
  return Math.ceil(lift);
}

export function OutcomeCard() {
  const pathname = usePathname() ?? "";
  const banner = useCookieBanner();
  const { open: askOpen } = useAsk();
  const busy = banner || askOpen;
  const [tap, setTap] = useState<Tap | null>(null);
  const [step, setStep] = useState<Step>("ask");
  const [draft, setDraft] = useState<Draft>({ outcome: "dismissed", reason: null, day: null, hour: null });
  const [free, setFree] = useState<{ href: string; city: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [lift, setLift] = useState(0);
  const titleId = useId();
  const card = useRef<HTMLElement>(null);
  const hours = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const again = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const checkRef = useRef<() => void>(() => {});
  const live = useRef({ pathname, busy, showing: false });
  useEffect(() => {
    live.current = { pathname, busy, showing: !!tap };
  });

  /** The player is on the page: ask now, wait, or forget the tap. */
  const check = useCallback(() => {
    if (live.current.showing || document.visibilityState !== "visible") return;
    const now = Date.now();
    const waiting = loadTap();
    if (!waiting) return;
    const { memory, ok } = loadMemory(now);
    // No memory, no card: a ✕ could not be kept.
    if (!ok) return saveTap(null);
    // Never over or under a sheet that is open (sign-in, pick a username, a request): it waits its turn.
    const busy = live.current.busy || !!document.querySelector('[aria-modal="true"]');
    const d = decide({ tap: waiting, memory, now, path: live.current.pathname, busy });
    clearTimeout(again.current);
    if (d.do === "wait") {
      if (d.tap !== waiting) saveTap(d.tap);
      if (d.why === "busy") again.current = setTimeout(() => checkRef.current(), BUSY_AGAIN_MS);
      return;
    }
    saveTap(null);
    if (d.do === "forget" || !saveMemory(afterAsk(memory, now))) return;
    live.current.showing = true;
    setStep("ask");
    setDraft({ outcome: "dismissed", reason: null, day: null, hour: null });
    setFree(null);
    setLeaving(false);
    setTap(d.tap);
  }, []);

  useEffect(() => {
    checkRef.current = check;
    return () => clearTimeout(again.current);
  }, [check]);

  useEffect(() => {
    let wait: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(wait);
      wait = setTimeout(check, SHOW_AFTER_MS);
    };
    const left = () => saveTap(leftAfterTap(loadTap()));
    const onVisibility = () => (document.visibilityState === "hidden" ? left() : soon());
    // A desktop's dialer or WhatsApp app takes the window's focus without hiding the page. Focus moving into a frame (a map) is not leaving.
    const onBlur = () => {
      if (!(document.activeElement instanceof HTMLIFrameElement)) left();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", soon);
    window.addEventListener("pageshow", soon);
    return () => {
      clearTimeout(wait);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", soon);
      window.removeEventListener("pageshow", soon);
    };
  }, [check]);

  // A page loaded or changed, or the bottom edge came free: a tap they are already back from may be waiting.
  useEffect(() => {
    const t = setTimeout(check, SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [check, pathname, busy]);

  const gone = useCallback(() => {
    clearTimeout(timer.current);
    live.current.showing = false;
    setTap(null);
  }, []);

  const fade = useCallback(() => {
    clearTimeout(timer.current);
    setLeaving(true);
    timer.current = setTimeout(gone, OUT_MS);
  }, [gone]);

  const fadeIn = useCallback(
    (ms: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(fade, ms);
    },
    [fade],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  /** One answer per tap, sent once; the card has already moved on. */
  const send = useCallback((t: Tap, d: Draft) => {
    const a: OutcomeAnswer = { turf: t.turf, kind: t.kind, source: t.source, signedIn: t.signedIn, ...d };
    try {
      void fetch("/api/contact-outcome", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify(outcomeBody(a)) })
        .then((r) => (r.status === 200 ? (r.json() as Promise<OutcomeReply>) : null))
        .then((j) => {
          if (j?.ok && j.free && d.reason === "full") {
            setFree(j.free);
            fadeIn(THANKS_LINK_MS);
          }
        })
        .catch(() => {});
    } catch {
      /* not sent: nothing else changes */
    }
  }, [fadeIn]);

  const finish = useCallback(
    (d: Draft) => {
      if (!tap) return;
      const now = Date.now();
      saveMemory(afterAnswer(loadMemory(now).memory, tap.turf, now));
      setDraft(d);
      setStep("thanks");
      send(tap, d);
      // A full slot's thanks waits a little longer: the free hours link may be on its way.
      fadeIn(d.reason === "full" ? THANKS_MS + 1200 : THANKS_MS);
    },
    [tap, send, fadeIn],
  );

  /** ✕ or Esc: what was said so far is sent (nothing said: dismissed), and nothing is asked for three days. */
  const close = useCallback(() => {
    if (!tap || leaving) return;
    if (step !== "thanks") {
      const now = Date.now();
      const m = loadMemory(now).memory;
      saveMemory(afterClose(draft.outcome === "dismissed" ? m : afterAnswer(m, tap.turf, now), now));
      send(tap, draft);
    }
    fade();
  }, [tap, leaving, step, draft, send, fade]);

  useEffect(() => {
    if (!tap) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tap, close]);

  // Clear of the bars under it, however tall they are on this page.
  useLayoutEffect(() => {
    const el = card.current;
    if (!tap || !el) return;
    const update = () => setLift(barLift(el));
    update();
    const settle = setTimeout(update, 450);
    window.addEventListener("resize", update);
    const watch = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    document.querySelectorAll("[data-bottom-bar]").forEach((b) => watch?.observe(b));
    return () => {
      clearTimeout(settle);
      window.removeEventListener("resize", update);
      watch?.disconnect();
    };
  }, [tap, pathname]);

  // The hour row opens at the next hour worth asking about.
  useLayoutEffect(() => {
    const row = hours.current;
    if (!row || !draft.day) return;
    const chip = row.querySelector<HTMLElement>(`[data-hour="${startHour(draft.day, Date.now())}"]`);
    // Lined up with the card's own edge (the row's left padding).
    if (chip) row.scrollLeft = Math.max(0, chip.offsetLeft - 14);
  }, [draft.day, step]);

  if (!tap || quietPath(pathname)) return null;

  const start = (outcome: "got_slot" | "not_this_time") => {
    setDraft({ outcome, reason: null, day: null, hour: null });
    setStep(outcome === "got_slot" ? "when" : "why");
  };
  const pickDay = (day: Day | null) => (day ? setDraft((d) => ({ ...d, day, hour: null })) : finish({ ...draft, day: null, hour: null }));
  const why = (reason: Reason) => {
    const d: Draft = { outcome: "not_this_time", reason, day: null, hour: null };
    if (reason !== "full") return finish(d);
    setDraft(d);
    setStep("when");
  };

  return (
    <section
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-outcome-card={step}
      style={{ "--outcome-lift": `${lift}px` } as React.CSSProperties}
      className={`fixed z-40 left-3 right-3 bottom-[max(calc(env(safe-area-inset-bottom)+4rem),calc(var(--consent-lift,0px)+0.5rem),calc(var(--outcome-lift,0px)+0.5rem))] md:left-6 md:right-auto md:w-[22rem] md:bottom-[max(1.5rem,calc(var(--consent-lift,0px)+0.5rem),calc(var(--outcome-lift,0px)+0.5rem))] print:hidden ${leaving ? "outcome-out" : "outcome-in"}`}
      onPointerEnter={() => step === "thanks" && free && clearTimeout(timer.current)}
      onPointerLeave={() => step === "thanks" && free && !leaving && fadeIn(THANKS_MS)}
    >
      <div className="relative rounded-2xl border border-primary-200 bg-white p-3.5 pr-12 shadow-elevated">
        <button
          type="button"
          onClick={close}
          aria-label={C.close}
          className="absolute right-0.5 top-0.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-primary-500 hover:bg-primary-100 focus-neon cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <div aria-live="polite">
          <div key={step} className={step === "ask" ? "" : "outcome-step"}>
          {step === "ask" && (
            <>
              <p id={titleId} className="text-[15px] leading-snug text-primary-900">
                <span className="block text-[13px] text-primary-500 [overflow-wrap:anywhere]">{C.ask(shortName(tap.name))}</span>
                <span className="font-semibold">{C.askLine}</span>
              </p>
              <div className="mt-2.5 -mr-8 flex flex-wrap gap-2">
                <button type="button" className={YES} onClick={() => start("got_slot")}>
                  {C.yes}
                </button>
                <button type="button" className={PLAIN} onClick={() => start("not_this_time")}>
                  {C.no}
                </button>
                <button type="button" className={PLAIN} onClick={() => finish({ outcome: "deciding", reason: null, day: null, hour: null })}>
                  {C.deciding}
                </button>
              </div>
            </>
          )}
          {step === "why" && (
            <>
              <p id={titleId} className="text-[15px] font-semibold leading-snug text-primary-900">
                {C.why}
              </p>
              <div className="mt-2.5 -mr-8 flex flex-wrap gap-2">
                {(Object.keys(C.reasons) as Reason[]).map((r) => (
                  <button key={r} type="button" className={PLAIN} onClick={() => why(r)}>
                    {C.reasons[r]}
                  </button>
                ))}
              </div>
            </>
          )}
          {step === "when" && (
            <>
              <p id={titleId} className="text-[15px] font-semibold leading-snug text-primary-900">
                {draft.outcome === "got_slot" ? C.whenPlay : C.whenWanted}
              </p>
              <div className="mt-2.5 -mr-8 flex flex-wrap items-center gap-2">
                {DAYS.map((d) => (
                  <button key={d} type="button" aria-pressed={draft.day === d} className={draft.day === d ? PICKED : PLAIN} onClick={() => pickDay(d)}>
                    {C.days[d]}
                  </button>
                ))}
                <button type="button" className={PLAIN} onClick={() => pickDay(null)}>
                  {C.days.later}
                </button>
                <button
                  type="button"
                  onClick={() => finish(draft)}
                  className="inline-flex h-11 items-center rounded-full px-3 text-[14px] font-semibold text-primary-600 underline underline-offset-2 hover:text-primary-900 focus-neon cursor-pointer"
                >
                  {draft.day ? C.done : C.skip}
                </button>
              </div>
              {draft.day && (
                <div ref={hours} role="group" aria-label={C.hour} className="outcome-step relative mt-2 -ml-3.5 -mr-12 flex gap-2 overflow-x-auto px-3.5 pb-0.5 scrollbar-hide">
                  {HOURS.map((h) => (
                    <button key={h} type="button" data-hour={h} className={`${PLAIN} min-w-[4.25rem] px-3`} onClick={() => finish({ ...draft, hour: h })}>
                      {hourLabel(h)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {step === "thanks" && (
            <>
              <p id={titleId} className="py-1 text-[15px] font-semibold leading-snug text-primary-900">
                {thanksFor(draft)}
              </p>
              {free && draft.reason === "full" && (
                <Link href={free.href} prefetch={false} onClick={gone} className="outcome-step inline-flex min-h-11 items-center text-[14px] font-semibold text-accent-700 underline underline-offset-2 focus-neon">
                  {C.freeLink(free.city)}
                </Link>
              )}
            </>
          )}
          </div>
        </div>
      </div>
    </section>
  );
}
