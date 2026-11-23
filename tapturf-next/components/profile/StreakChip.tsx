"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { streakLabel, streakPlain, streakShown } from "@/lib/profile/streak";

/**
 * The weekly streak beside a username (the site owner, 23 Nov 2026:
 * "Streak should be an emoji next to the username and if clicked on it
 * should show the streak"): the fire emoji and the number of weeks, a real
 * button named "4-week streak". Only for a streak that is alive now and 2
 * weeks or longer (lib/profile/streak.ts streakShown, the Passport's own
 * number); nothing for anyone else. What a tap shows is its caller's: the
 * player's own Me card opens their streak's words, the public profile one
 * plain line.
 */
export function StreakButton({ weeks, open, onToggle, controls, className = "" }: { weeks: number; open: boolean; onToggle: () => void; controls: string; className?: string }) {
  return (
    <button
      type="button"
      data-streak-chip={weeks}
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={streakLabel(weeks)}
      title={streakLabel(weeks)}
      className={`inline-flex shrink-0 items-center gap-0.5 min-h-[44px] min-w-[44px] justify-center rounded-full px-1.5 font-semibold text-primary-800 tabular-nums hover:bg-amber-50 focus-neon ${open ? "bg-amber-50" : ""} ${className}`}
    >
      <span aria-hidden>🔥</span>
      <span aria-hidden>{weeks}</span>
    </button>
  );
}

/** Close on a tap anywhere else, and on Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

/**
 * A public profile's "@username", with the streak beside it when there is
 * one to show: "@asha · 🔥 4". A tap shows one plain line under it
 * ("4-week streak: played 4 weeks in a row"), and a tap again or anywhere
 * else puts it away. A long username is cut with an ellipsis before the
 * streak ever leaves the card. Without a streak it is the plain line it
 * always was.
 */
export function UsernameStreak({ username, current }: { username: string; current: number }) {
  const weeks = streakShown(current);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  useDismiss(box, open, () => setOpen(false));
  if (!weeks) return <p className="mt-1 text-[15px] text-primary-500">@{username}</p>;
  return (
    <div ref={box} className="mt-0.5">
      <p className="flex items-center justify-center gap-1 text-[15px] text-primary-500">
        <span className="min-w-0 truncate">@{username}</span>
        <span aria-hidden className="text-primary-300">
          ·
        </span>
        <StreakButton weeks={weeks} open={open} onToggle={() => setOpen((o) => !o)} controls={id} />
      </p>
      <p id={id} role="status" hidden={!open} className={open ? "mx-auto -mt-0.5 mb-1 inline-block rounded-2xl bg-amber-50 px-3 py-1.5 text-[13px] font-medium leading-snug text-amber-900" : "hidden"}>
        {open ? streakPlain(weeks) : ""}
      </p>
    </div>
  );
}
