"use client";

import { useEffect, useSyncExternalStore } from "react";
import { playedForViewer, subscribePlayed, wantPlayed } from "@/lib/profile/playedStore";
import type { PlayedResponse } from "@/lib/profile/types";

/**
 * Where and when the signed-in person last played, their streak, counts
 * and medals (GET /api/me/played, once per tab session, shared by every
 * caller: lib/profile/playedStore.ts). Null for a signed-out visitor,
 * until it is in, and always in the server render and the hydration
 * pass: lists and turf pages are cached for everyone, so nothing personal
 * is ever in their HTML.
 */
export function usePlayed(): PlayedResponse | null {
  const data = useSyncExternalStore(subscribePlayed, playedForViewer, () => null);
  useEffect(() => wantPlayed(), []);
  return data;
}
