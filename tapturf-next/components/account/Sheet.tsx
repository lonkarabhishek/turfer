"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { FOCUSABLE } from "@/lib/account/prompts";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";

/**
 * A sheet over the page: from the bottom on a phone, centred on a wide
 * screen. Escape and a tap outside call onClose (unless locked, while
 * something is being sent); Tab stays inside; focus goes back where it
 * was when it closes. The heading gets focus first, so a phone's keyboard
 * opens only when a field is tapped. With the keyboard up it sits above
 * the keys (ViewportOverlay), scrolling inside when it is taller.
 */
export function Sheet({
  labelledBy,
  describedBy,
  onClose,
  locked = false,
  children,
}: {
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  locked?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  useEffect(() => {
    closeRef.current = onClose;
    lockedRef.current = locked;
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const heading = ref.current ? document.getElementById(labelledBy) : null;
    if (heading) {
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      // A heading is focused only to start reading there: no keyboard ring on it.
      heading.style.outline = "none";
      heading.focus();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!lockedRef.current) closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = ref.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [labelledBy]);

  return (
    // data-modal-open: PWALifecycle never reloads the page under an open sheet (a code half typed).
    <ViewportOverlay className="z-[70] flex items-end sm:items-center justify-center" data-modal-open="true">
      <div className="fixed inset-0 bg-primary-900/40" onClick={() => !locked && onClose()} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="relative w-full sm:max-w-md max-h-[calc(var(--vv-h,100dvh)*0.92)] overflow-y-auto overscroll-contain bg-white rounded-t-3xl sm:rounded-3xl shadow-elevated px-5 pt-6 pb-[max(1.25rem,var(--safe-b,env(safe-area-inset-bottom)))]"
      >
        {children}
      </div>
    </ViewportOverlay>
  );
}
