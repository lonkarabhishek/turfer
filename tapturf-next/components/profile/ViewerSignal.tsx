"use client";

import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Under AuthProvider, on every page (AuthWrapper): says who is signed in
 * (their account id and how they signed in), or null once it is known
 * they are not, to the played store (lib/profile/playedStore.ts), through
 * window: window.__tapturfViewer and a "tapturf:viewer" event. Not an
 * import, so the turf cards' "Played here" and the layout share no code
 * and every page's scripts stay as they were. Draws nothing.
 */
export function ViewerSignal() {
  const { user, signedInWith, settled } = useAuth();
  const id = user?.id ?? null;
  useEffect(() => {
    // Still finding out: say nothing yet (the store keeps what it has).
    if (id ? !signedInWith : !settled) return;
    const w = window as unknown as { __tapturfViewer?: { id: string; how: "phone" | "google" } | null };
    w.__tapturfViewer = id && signedInWith ? { id, how: signedInWith } : null;
    window.dispatchEvent(new Event("tapturf:viewer"));
  }, [id, signedInWith, settled]);
  return null;
}
