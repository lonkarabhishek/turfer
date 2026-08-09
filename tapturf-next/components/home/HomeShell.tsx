"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { LoggedInHome } from "./LoggedInHome";
import { MarketingHome } from "./MarketingHome";
import type { Turf } from "@/types/turf";

/**
 * Home switcher — signed-in users see LoggedInHome, everyone else
 * sees the city-scoped marketing page. Per-city turfs are provided
 * from the server so the marketing hero paints instantly regardless
 * of client-side auth or city-preference resolution.
 */
export function HomeShell({
  nashikTurfs,
  puneTurfs,
}: {
  nashikTurfs: Turf[];
  puneTurfs: Turf[];
}) {
  const { user, loading } = useAuth();

  // While auth resolves, show marketing so the page isn't blank.
  if (loading) return <MarketingHome nashikTurfs={nashikTurfs} puneTurfs={puneTurfs} />;
  if (user) return <LoggedInHome />;
  return <MarketingHome nashikTurfs={nashikTurfs} puneTurfs={puneTurfs} />;
}
