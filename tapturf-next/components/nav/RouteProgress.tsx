"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Route-change loading affordance so a tap on a Link doesn't feel dead.
 * Two layers:
 *   1. A thin lime progress bar racing across the top.
 *   2. A tiny "sports slang" pill that appears near the top-center.
 * Both fire on click of an in-app link (or a [data-nav] button) and
 * clear the moment the route actually changes.
 */

const SLANGS = [
  "Lacing up…",
  "Chalking the pitch…",
  "Coin toss…",
  "Warming up…",
  "Rolling the ball…",
  "Nutmeg incoming…",
  "Off the blocks…",
  "Sprint on…",
  "Take the field…",
  "Whistle up…",
  "Setting the field…",
  "Ready set go…",
];

function isInAppNav(el: HTMLElement | null): boolean {
  if (!el) return false;
  const link = el.closest("a") as HTMLAnchorElement | null;
  if (!link) {
    // Buttons opt in via data-nav="true"
    const btn = el.closest("button") as HTMLButtonElement | null;
    return btn?.dataset.nav === "true";
  }
  const href = link.getAttribute("href") || "";
  if (!href) return false;
  // Skip: external, anchors, mailto, tel, download, target=_blank, cmd-click
  if (/^(https?:|mailto:|tel:|#|blob:|data:)/i.test(href)) return false;
  if (link.target === "_blank") return false;
  if (link.hasAttribute("download")) return false;
  return true;
}

function RouteProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [slang, setSlang] = useState<string>(SLANGS[0]);
  const maxTimer = useRef<number | null>(null);
  const key = `${pathname}?${searchParams?.toString() ?? ""}`;
  const lastKey = useRef(key);

  // Click detector — fires when the user actually initiates navigation
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // ignore modifier clicks (open in new tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (!isInAppNav(e.target as HTMLElement)) return;
      setSlang(SLANGS[Math.floor(Math.random() * SLANGS.length)]);
      setVisible(true);
      if (maxTimer.current) window.clearTimeout(maxTimer.current);
      // Hard cap so a nav that never resolves doesn't leave the pill stuck
      maxTimer.current = window.setTimeout(() => setVisible(false), 6000);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Hide as soon as the route actually changed
  useEffect(() => {
    if (key !== lastKey.current) {
      lastKey.current = key;
      setVisible(false);
      if (maxTimer.current) window.clearTimeout(maxTimer.current);
    }
  }, [key]);

  return (
    <>
      {/* Thin racing bar across the very top */}
      <div
        aria-hidden
        className="fixed top-0 left-0 right-0 h-[2px] z-[70] pointer-events-none"
        style={{ opacity: visible ? 1 : 0, transition: "opacity 120ms linear" }}
      >
        <div className="h-full bg-accent-500 animate-route-race" />
      </div>

      {/* Slang pill just below the header */}
      {visible && (
        <div className="fixed top-[64px] left-1/2 -translate-x-1/2 z-[70] pointer-events-none">
          <div className="inline-flex items-center gap-2 bg-primary-800 rounded-full px-3.5 py-1.5 shadow-elevated animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" aria-hidden />
            <span className="text-[12px] font-semibold text-white whitespace-nowrap">
              {slang}
            </span>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes route-race {
          0%   { transform: translateX(-100%); }
          40%  { transform: translateX(-15%); }
          70%  { transform: translateX(-5%); }
          100% { transform: translateX(0%); }
        }
        :global(.animate-route-race) {
          animation: route-race 5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          width: 100%;
          transform-origin: left;
        }
      `}</style>
    </>
  );
}

export function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <RouteProgressInner />
    </Suspense>
  );
}
