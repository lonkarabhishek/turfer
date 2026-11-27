"use client";

import type { ComponentProps } from "react";
import { trendCard } from "@/lib/map/trendingClient";
import { TurfCard } from "./TurfCard";
import { useTrending } from "./useTrending";

/**
 * A TurfCard that says "Trending #N" when its turf is among the most
 * viewed, exactly as /map's cards do with Trending on: for lists drawn by
 * a server component (a sport page, /turf-near-me), which cannot call the
 * hook themselves, and for the near-me finder, whose cards come later (no
 * cards, no read). The label arrives after the page is idle (useTrending:
 * one read per tab in 10 minutes), is never in the server HTML, sits over
 * the photo so nothing moves, and changes no order: the list stays ranked
 * as it was. TurfListingClient calls useTrending once and passes
 * trendCard's props to TurfCard itself.
 */
export function TrendTurfCard(props: Omit<ComponentProps<typeof TurfCard>, "trendRank" | "trendOver">) {
  const trend = useTrending();
  return <TurfCard {...props} {...trendCard(trend, props.turf)} />;
}
