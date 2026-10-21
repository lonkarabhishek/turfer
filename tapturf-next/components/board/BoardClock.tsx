"use client";

import { useEffect, useState } from "react";
import { clockMs } from "@/lib/board";
import type { BoardView } from "@/lib/board/types";

/**
 * The match clock. It ticks by itself, once a second on the second and
 * only while running, so the header, tabs and pad around it never
 * re-render for it. The value always comes from now() (the scorer's
 * Date.now, or the follower's boardNow), never from counting ticks, so a
 * phone that slept in a pocket shows the right time as soon as it wakes.
 */

/** 7:05 from ms. up: rounded down (a clock reads 0:59 until a full minute is done); down: rounded up, so 0:00 means time is up. */
function mmss(ms: number, up: boolean): string {
  const t = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** The clock as people read it: football runs on through the halves (52:10) and writes stoppage time after the half (20:00 +2:13); basketball counts down. Null with no clock. */
export function clockLabel(view: BoardView, now: number): string | null {
  const c = view.clock;
  if (!c) return null;
  const shown = clockMs(view, now) ?? c.ms;
  if (c.down) return mmss(shown, false);
  if (c.limitMs !== null && shown > c.limitMs) return `${mmss(c.baseMs + c.limitMs, true)} +${mmss(shown - c.limitMs, true)}`;
  return mmss(c.baseMs + shown, true);
}

/** The period's time is up: a down clock at 0:00, or an up clock past the period's length (stoppage time). */
export function timeUp(view: BoardView, now: number): boolean {
  const c = view.clock;
  if (!c) return false;
  const shown = clockMs(view, now) ?? c.ms;
  return c.down ? shown <= 0 : c.limitMs !== null && shown >= c.limitMs;
}

/** Ms until the shown text changes, a little after the second turns. */
function msToNextSecond(view: BoardView, now: number): number {
  const shown = clockMs(view, now) ?? 0;
  const into = view.clock?.down ? shown % 1000 || 1000 : 1000 - (shown % 1000);
  return into + 15;
}

/** Re-render once when time runs out, not every second: the pad switches to "End half" then. */
export function useTimeUp(view: BoardView, now: () => number): boolean {
  const [, bump] = useState(0);
  const running = !!view.clock?.running;
  useEffect(() => {
    if (!running) return;
    const c = view.clock;
    const t0 = now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (c && !timeUp(view, t0)) {
      const shown = clockMs(view, t0) ?? c.ms;
      const left = c.down ? shown : c.limitMs === null ? null : c.limitMs - shown;
      if (left !== null) timer = setTimeout(() => bump((x) => x + 1), left + 20);
    }
    // Hidden tabs get their timers held back: check again when looked at.
    const onVisible = () => document.visibilityState === "visible" && bump((x) => x + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [view, now, running]);
  return timeUp(view, now());
}

export function BoardClock({ view, now, className = "" }: { view: BoardView; now: () => number; className?: string }) {
  const [, tick] = useState(0);
  const running = !!view.clock?.running;
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        tick((x) => x + 1);
        schedule();
      }, msToNextSecond(view, now()));
    };
    schedule();
    // Android holds back timers in a hidden tab: show the right time the moment it is visible again.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      tick((x) => x + 1);
      schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [view, now, running]);
  const text = clockLabel(view, now());
  if (text === null) return null;
  const up = timeUp(view, now());
  return (
    <span role="timer" aria-label={`Clock ${text}${up ? (view.clock?.down ? ", time up" : ", stoppage time") : ""}`} className={`tabular-nums ${up ? "text-amber-300" : ""} ${className}`}>
      {text}
    </span>
  );
}
