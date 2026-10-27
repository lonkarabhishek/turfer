"use client";

import { useSyncExternalStore } from "react";
import { nextTallest, sameBox, viewportBox, type Tallest, type ViewportBox, type ViewportReading } from "./viewport";

/**
 * The visible part of the page (lib/ui/viewport.ts) while `active`,
 * following window.visualViewport's resize and scroll (once a frame) and
 * focus moving in and out of text fields. null on the server, while
 * inactive and where visualViewport is missing: the overlay then stays as
 * CSS has it. Zoomed in, it is still the visible area; while a pinch is
 * moving the zoom it holds where it was (moving a sheet under someone's
 * fingers is worse) and catches up once the zoom has been still a moment.
 */
export function useVisualViewport(active = true): ViewportBox | null {
  return useSyncExternalStore(active ? subscribe : noSubscribe, active ? snapshot : none, none);
}

const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

/** A field that brings up an on-screen keyboard when focused. */
export function isTextField(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

// One reading for every sheet: the tallest height seen survives between sheets, so
// a sheet that opens with the keyboard already up still knows it is up.
let tallest: Tallest | null = null;
let last: ViewportBox | null = null;
let touchQuery: MediaQueryList | null = null;
/** Until this time (performance.now()) a pinch is moving the zoom: the box stays as it was. */
let pinchUntil = 0;
/** How long the zoom must be still before the box follows it again. */
const PINCH_SETTLE_MS = 200;

function read(): ViewportReading | null {
  const vv = typeof window === "undefined" ? null : window.visualViewport;
  if (!vv) return null;
  return {
    innerHeight: window.innerHeight,
    width: vv.width,
    height: vv.height,
    offsetTop: vv.offsetTop,
    offsetLeft: vv.offsetLeft,
    scale: vv.scale,
    typing: isTextField(document.activeElement),
  };
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
  if (last && performance.now() < pinchUntil) return last;
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
  let settle: ReturnType<typeof setTimeout> | undefined;
  let scale = vv.scale;
  const changed = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onChange();
    });
  };
  const moved = () => {
    // The zoom changed since the last event: a pinch (or iOS zooming to a field) is under way.
    if (Math.abs(vv.scale - scale) > 0.01) {
      scale = vv.scale;
      pinchUntil = performance.now() + PINCH_SETTLE_MS;
      clearTimeout(settle);
      settle = setTimeout(changed, PINCH_SETTLE_MS + 20);
      return;
    }
    changed();
  };
  vv.addEventListener("resize", moved);
  vv.addEventListener("scroll", moved);
  // A turned phone resizes the window first; the visual viewport follows.
  window.addEventListener("resize", moved);
  // A field focused or left: whether the keys can be up.
  document.addEventListener("focusin", changed);
  document.addEventListener("focusout", changed);
  return () => {
    vv.removeEventListener("resize", moved);
    vv.removeEventListener("scroll", moved);
    window.removeEventListener("resize", moved);
    document.removeEventListener("focusin", changed);
    document.removeEventListener("focusout", changed);
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(settle);
  };
}

const noSubscribe = () => () => {};
const none = () => null;
