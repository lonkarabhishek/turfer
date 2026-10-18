"use client";

import { useSyncExternalStore } from "react";
import { CITY_COOKIE, parseCityCookie, type CityChoice } from "@/lib/city";

function subscribe(onChange: () => void) {
  window.addEventListener("tapturf:city-changed", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("tapturf:city-changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}

const RE = new RegExp(`(?:^|;\\s*)${CITY_COOKIE}=([^;]*)`);
const snapshot = () => document.cookie.match(RE)?.[1] ?? "";
const serverSnapshot = () => null;

/**
 * The tt_city cookie, live. Only for interaction-time UI (the menu row,
 * the picker): content never branches on it during render, because the
 * server snapshot is null.
 */
export function useCityChoice(): CityChoice | null {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return parseCityCookie(raw);
}
