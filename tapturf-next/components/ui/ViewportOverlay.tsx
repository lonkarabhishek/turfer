"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type HTMLAttributes } from "react";
import { useVisualViewport } from "@/lib/ui/useVisualViewport";
import { revealDelta, type ViewportBox } from "@/lib/ui/viewport";

/**
 * The fixed layer under a sheet or modal (in place of `fixed inset-0`),
 * kept to the part of the page the phone shows. With an on-screen
 * keyboard on iOS Safari and in-app browsers, which ignore the layout's
 * interactiveWidget and lay the keys over the page, the layer ends at
 * the keys, so a sheet anchored with items-end sits right above them
 * and a centred card centres in what is left. Android Chrome shrinks
 * the layout itself, and the layer is then the whole page as before.
 *
 * Children size themselves to the visible height with
 * `var(--vv-h, 100dvh)` (e.g. max-h-[calc(var(--vv-h,100dvh)*0.85)]),
 * and pad the bottom with `var(--safe-b, env(safe-area-inset-bottom))`:
 * no home-indicator gap while the keys cover it.
 *
 * A focused field stays in view: when the keyboard opens (or a field is
 * focused) the scrolling boxes between it and this layer scroll just
 * enough to show it. Pass `box` when the sheet reads useVisualViewport
 * itself (to know whether the keyboard is up); otherwise this reads it.
 */
export function ViewportOverlay({
  box: given,
  className = "",
  style,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { box?: ViewportBox | null }) {
  const own = useVisualViewport(given === undefined);
  const box = given === undefined ? own : given;
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  const reveal = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (ref.current) revealFocused(ref.current);
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // The keys came up (or went down): the field being typed in may now be under the sheet's own edge.
  const height = box?.height;
  useEffect(() => {
    if (height !== undefined) reveal();
  }, [height, reveal]);

  const place = (
    box
      ? { top: box.top, height: box.height, bottom: "auto", "--vv-h": `${box.height}px`, ...(box.keyboard ? { "--safe-b": "0px" } : null) }
      : null
  ) as CSSProperties | null;

  return (
    <div
      ref={ref}
      {...rest}
      className={`fixed inset-0 ${className}`}
      style={place ? { ...place, ...style } : style}
      onFocus={(e) => {
        rest.onFocus?.(e);
        reveal();
      }}
    >
      {children}
    </div>
  );
}

const NOT_TEXT = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isTextField(el: Element | null): el is HTMLElement {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type);
  return el instanceof HTMLElement && el.isContentEditable;
}

/** Scroll each scrolling box from the focused field out to the layer just enough to show the field. Never the page itself. */
function revealFocused(root: HTMLElement) {
  const el = document.activeElement;
  if (!isTextField(el) || !root.contains(el)) return;
  for (let n = el.parentElement; n; n = n === root ? null : n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy !== "auto" && oy !== "scroll") || n.scrollHeight <= n.clientHeight + 1) continue;
    const top = n.getBoundingClientRect().top + n.clientTop;
    const f = el.getBoundingClientRect();
    const d = revealDelta({ top: f.top, bottom: f.bottom }, { top, bottom: top + n.clientHeight });
    if (d) n.scrollTop += d;
  }
}
