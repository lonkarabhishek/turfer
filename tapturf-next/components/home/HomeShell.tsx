"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import type { CityLineProps } from "@/lib/cityLine";
import type { HomeScope, ScopedHome } from "@/lib/home/select";
import { LoggedInHome } from "./LoggedInHome";
import { HomeHero } from "./HomeHero";

/**
 * Home switcher: signed-in users see LoggedInHome, everyone else (and
 * everyone while auth resolves) sees the hero. Both get the city the
 * page was rendered for and its city line, from the server.
 */
export function HomeShell({ hero, scope, line }: { hero: ScopedHome["hero"]; scope: HomeScope; line: CityLineProps }) {
  const { user, loading } = useAuth();
  if (loading || !user) return <HomeHero hero={hero} scope={scope} line={line} />;
  return <LoggedInHome scope={scope} line={line} />;
}
