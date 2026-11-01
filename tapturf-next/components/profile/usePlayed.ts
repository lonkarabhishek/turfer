"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ensurePlayed, forgetPlayed, playedNow, subscribePlayed } from "@/lib/profile/client";
import type { PlayedResponse } from "@/lib/profile/types";

/**
 * Where and when the signed-in person last played, and their streak
 * (GET /api/me/played, once per tab session, shared by every caller).
 * Null for a signed-out visitor, until it is in, and always in the server
 * render and the hydration pass: lists and turf pages are cached for
 * everyone, so nothing personal is ever in their HTML.
 */
export function usePlayed(): PlayedResponse | null {
  const { user, signedInWith, settled } = useAuth();
  const userId = user?.id ?? null;
  const data = useSyncExternalStore(
    subscribePlayed,
    () => playedNow(userId),
    () => null,
  );
  useEffect(() => {
    if (userId && signedInWith) void ensurePlayed(userId, signedInWith);
    else if (settled && !userId) forgetPlayed();
  }, [userId, signedInWith, settled]);
  return userId ? data : null;
}
