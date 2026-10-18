"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { LoggedInHome } from "./LoggedInHome";
import { HomeHero } from "./HomeHero";
import type { HomeHeroProps } from "@/lib/home/types";

/**
 * Home switcher: signed-in users see LoggedInHome, everyone else (and
 * everyone while auth resolves) sees the hero. The hero props are the
 * small, already-shaped numbers from lib/home/data.ts.
 */
export function HomeShell({ hero }: { hero: HomeHeroProps }) {
  const { user, loading } = useAuth();
  if (loading || !user) return <HomeHero {...hero} />;
  return <LoggedInHome />;
}
