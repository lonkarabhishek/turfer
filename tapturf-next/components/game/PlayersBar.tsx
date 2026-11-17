"use client";

import { useEffect, useRef } from "react";
import { Zap } from "lucide-react";
import { barOf, barWords, type Speed } from "@/lib/games/progress";

/**
 * How full a game is: a thin bar of games.current_players of max_players
 * (lib/games/progress.ts), the same on the game page and on every card
 * and tile. The fill grows once: as the page first paints, or when the
 * bar scrolls into view (it is held empty off screen until then). A game
 * that is really filling fast gets a slow sheen across the fill and, with
 * `label`, the words beside it; a slow game gets a plain bar and nothing
 * said. No motion under prefers-reduced-motion (app/globals.css). It is a
 * progressbar with its numbers and a sentence for screen readers; the
 * count itself stays in the words next to it ("7 of 14 going").
 * Phrasing content only (spans), so it sits inside a link or a paragraph;
 * its row is a fixed height, with or without a label: nothing shifts.
 */
export function PlayersBar({
  current,
  max,
  speed,
  over = false,
  size = "card",
  label = true,
  className = "",
}: {
  current: number;
  max: number;
  /** speedOf() for this game: what to say beside the bar, and whether it moves. */
  speed: Speed;
  /** Played or called off: a muted bar, "joined" for screen readers. */
  over?: boolean;
  /** card: 6px in a 20px row. page: 8px (the game page's lineup). tile: 4px (the home's rows). */
  size?: "card" | "page" | "tile";
  /** The small words beside the bar ("Filling fast", "Almost full: 2 spots left"). The game page writes its own line. */
  label?: boolean;
  className?: string;
}) {
  const bar = barOf(current, max);
  const fill = useRef<HTMLSpanElement>(null);

  // A bar below the fold waits, empty, and fills when it comes on screen. One that is on screen when the page
  // loads is already filling (the stylesheet's own animation), so it is left alone: no flash.
  useEffect(() => {
    const el = fill.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return;
    el.dataset.fill = "wait";
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.dataset.fill = "go";
        io.disconnect();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      delete el.dataset.fill;
    };
  }, []);

  if (bar.max === 0) return null;
  const tone = over || bar.full ? "bg-primary-400" : speed.kind === "almost" ? "bg-hot-500" : "bg-accent-500";
  const height = size === "page" ? "h-2" : size === "tile" ? "h-1" : "h-1.5";
  const moving = speed.fast && !over && !bar.full;
  const words = label && !over && (speed.kind === "fast" || speed.kind === "almost") ? speed.label : null;
  return (
    <span className={`flex items-center gap-2 ${size === "page" ? "h-2" : size === "tile" ? "h-3" : "h-5"} ${className}`}>
      <span
        role="progressbar"
        aria-label="Players in"
        aria-valuemin={0}
        aria-valuemax={bar.max}
        aria-valuenow={Math.min(bar.current, bar.max)}
        aria-valuetext={barWords(bar, speed, over)}
        className={`block flex-1 min-w-0 overflow-hidden rounded-full bg-primary-100 ${height}`}
      >
        <span ref={fill} className={`players-bar-fill ${moving ? "players-bar-sheen" : ""} block h-full rounded-full ${tone}`} style={{ width: `${bar.percent}%` }} />
      </span>
      {words && (
        <span className={`shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold leading-5 whitespace-nowrap ${speed.kind === "almost" ? "text-hot-600" : "text-accent-800"}`}>
          {speed.fast && <Zap className="w-3.5 h-3.5" aria-hidden />}
          {words}
        </span>
      )}
    </span>
  );
}
