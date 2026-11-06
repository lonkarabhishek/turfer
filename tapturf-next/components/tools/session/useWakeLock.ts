"use client";

import { useEffect } from "react";

type Sentinel = { release: () => Promise<void>; addEventListener?: (type: "release", fn: () => void) => void };
type WakeLockNav = Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };

/**
 * Keeps the screen on while `on` and the page is visible, where the
 * browser allows it (the Screen Wake Lock API). The browser drops the lock
 * when the page is hidden; it is asked for again when the page comes back.
 * Nothing happens where the API is missing or says no.
 */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || typeof navigator === "undefined") return;
    const nav = navigator as WakeLockNav;
    if (!nav.wakeLock) return;
    let lock: Sentinel | null = null;
    let alive = true;
    const take = async () => {
      if (!alive || lock || document.visibilityState !== "visible") return;
      try {
        const l = await nav.wakeLock!.request("screen");
        if (!alive) {
          void l.release().catch(() => {});
          return;
        }
        lock = l;
        l.addEventListener?.("release", () => {
          if (lock === l) lock = null;
        });
      } catch {
        /* not allowed now (battery saver, no user gesture yet): the screen just sleeps as usual */
      }
    };
    const onVisible = () => void take();
    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      if (lock) void lock.release().catch(() => {});
      lock = null;
    };
  }, [on]);
}
