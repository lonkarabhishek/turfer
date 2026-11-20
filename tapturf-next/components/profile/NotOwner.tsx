"use client";

import type { ReactNode } from "react";
import { useHydrated } from "@/components/account/useVerified";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * A part of a public profile meant for its visitors ("Yours to earn"):
 * in the server render for everyone, and taken away in the browser only
 * for the signed-in player whose profile it is.
 */
export function NotOwner({ username, children }: { username: string; children: ReactNode }) {
  const { user } = useAuth();
  // After hydration, so the first render in the browser is the server's.
  const hydrated = useHydrated();
  return hydrated && user?.username === username ? null : <>{children}</>;
}
