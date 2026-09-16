"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { LoggedInHome } from "./LoggedInHome";
import { MarketingHome } from "./MarketingHome";
import type { Turf } from "@/types/turf";

/**
 * Home switcher — signed-in users see LoggedInHome, everyone else
 * sees the marketing page. Per-city turfs are still accepted from
 * the server so future signals (best-seller strip, live activity)
 * can drop back in without another prop change.
 */
export function HomeShell({
  nashikTurfs: _nashikTurfs,
  puneTurfs: _puneTurfs,
}: {
  nashikTurfs: Turf[];
  puneTurfs: Turf[];
}) {
  const { user, loading } = useAuth();

  // While auth resolves, show marketing so the page isn't blank.
  if (loading) return <MarketingHome />;
  if (user) return <LoggedInHome />;
  return <MarketingHome />;
}
