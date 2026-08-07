"use client";

import { useEffect } from "react";

/**
 * iOS PWAs (Add to Home Screen) don't refetch anything when the user
 * switches back after backgrounding — the JS just resumes with the
 * old state. Force a fresh reload when we become visible again after
 * being away >45s. Skips the reload if:
 *  - user is actively typing (would nuke their in-flight input)
 *  - a modal / login sheet is currently open (data-modal-open attr)
 * Also fires on the bfcache "pageshow" event so back/forward nav
 * inside Safari doesn't serve a stale snapshot.
 */
export function PWALifecycle() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let hiddenSince = 0;
    const IDLE_MS = 45_000;

    const isTyping = () => {
      const a = document.activeElement as HTMLElement | null;
      if (!a) return false;
      const tag = a.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        a.isContentEditable === true
      );
    };

    const isModalOpen = () =>
      !!document.querySelector('[data-modal-open="true"]');

    const safeReload = () => {
      if (isTyping() || isModalOpen()) return;
      window.location.reload();
    };

    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince = Date.now();
        return;
      }
      if (!hiddenSince) return;
      const awayMs = Date.now() - hiddenSince;
      hiddenSince = 0;
      if (awayMs >= IDLE_MS) safeReload();
    };

    // bfcache: Safari restores a snapshot without re-running scripts.
    // If persisted is true, the DOM is stale — reload to be safe.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) safeReload();
    };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
