"use client";

import { useState, useSyncExternalStore } from "react";
import { getCityPref, type CityId } from "@/lib/city";

function subscribe(onChange: () => void) {
  window.addEventListener("tapturf:city-changed", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("tapturf:city-changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}

const serverSnapshot = () => null;

/**
 * The visitor's picked city (header picker, hero pill or /api/geo on a
 * first visit). Null on the server and before hydration, so the
 * all-cities view is what crawlers see; the client narrows in the
 * hydration commit, text for text, so nothing moves.
 */
export function useCityPref(): CityId | null {
  return useSyncExternalStore(subscribe, getCityPref, serverSnapshot);
}

const noopSubscribe = () => () => {};

/**
 * How many times the city changed after hydration. Used to add the
 * fade-in class only on a user-initiated change: the hydration commit
 * (server null, client pref) is the first observation and does not count.
 */
export function useCitySwapCount(pref: CityId | null): number {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [prev, setPrev] = useState<CityId | null | undefined>(undefined);
  const [swaps, setSwaps] = useState(0);
  if (hydrated && pref !== prev) {
    if (prev !== undefined) setSwaps((n) => n + 1);
    setPrev(pref);
  }
  return swaps;
}
