"use client";

import { useSyncExternalStore } from "react";

/**
 * "Switching to Mumbai…" while CitySync refreshes the page for a new
 * city. Module state, so the city line anywhere on the page can show it.
 */
let pending: string | null = null;
const listeners = new Set<() => void>();

export function setPendingCity(label: string | null): void {
  if (pending === label) return;
  pending = label;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function usePendingCity(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
}
