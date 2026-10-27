"use client";

import { useSyncExternalStore } from "react";
import { nextTallest, sameBox, viewportBox, type Tallest, type ViewportBox, type ViewportReading } from "./viewport";

/**
 * The visible part of the page (lib/ui/viewport.ts) while `active`,
 * following window.visualViewport's resize and scroll (once a frame).
 * null on the server, while inactive, where visualViewport is missing,
 * and while pinch zoomed: the overlay then stays as CSS has it.
 */
export function useVisualViewport(active = true): ViewportBox | null {
  return useSyncExternalStore(active ? subscribe : noSubscribe, active ? snapshot : none, none);
}

// One reading for every sheet: the tallest height seen survives between sheets, so
// a sheet that opens with the keyboard already up still knows it is up.
let tallest: Tallest | null = null;
let last: ViewportBox | null = null;
let touchQuery: MediaQueryList | null = null;

function read(): ViewportReading | null {
  const vv = typeof window === "undefined" ? null : window.visualViewport;
  if (!vv) return null;
  return { innerHeight: window.innerHeight, width: vv.width, height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale };
}

function touch(): boolean {
  try {
    touchQuery ??= window.matchMedia("(any-pointer: coarse)");
    return touchQuery.matches;
  } catch {
    return false;
  }
}

function snapshot(): ViewportBox | null {
  const r = read();
  if (!r) return null;
  tallest = nextTallest(tallest, r);
  const box = viewportBox(r, tallest.height, touch());
  // The same object while nothing moved: useSyncExternalStore re-renders on a new one.
  if (!sameBox(box, last)) last = box;
  return last;
}

function subscribe(onChange: () => void): () => void {
  const vv = typeof window === "undefined" ? null : window.visualViewport;
  if (!vv) return () => {};
  let frame = 0;
  const changed = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onChange();
    });
  };
  vv.addEventListener("resize", changed);
  vv.addEventListener("scroll", changed);
  // A turned phone resizes the window first; the visual viewport follows.
  window.addEventListener("resize", changed);
  return () => {
    vv.removeEventListener("resize", changed);
    vv.removeEventListener("scroll", changed);
    window.removeEventListener("resize", changed);
    if (frame) cancelAnimationFrame(frame);
  };
}

const noSubscribe = () => () => {};
const none = () => null;
