"use client";

import { TrendingUp } from "lucide-react";
import { trendChip, trendMeaning, trendRankOf } from "@/lib/map/trendingClient";
import { useTrending } from "./useTrending";

/**
 * On a turf's own page, over the top left corner of its photos: "Trending
 * #3 on TapTurf" and, under it, what that means ("Number 3 by page views
 * in the last 7 days"), only for a turf in the map's Trending answer
 * (useTrending: the same turfs, ranks and window as /map and the lists'
 * cards). Not the city's weekly pick: that is the gold line over the name,
 * and a turf that is both shows both.
 *
 * It arrives after the page has loaded, so it is laid over the gallery and
 * takes no room of its own: nothing on the page moves, and a turf that
 * does not trend renders nothing at all. Taps go through it to the photo
 * under it. Never in the server HTML (the page is cached for everyone, a
 * week at a time) and marked data-nosnippet. The page wraps the gallery in
 * a `relative` box for it.
 *
 * `bare`: the turf has no photos, so the gallery is the "Photos coming
 * soon" box, whose mark sits in the middle: on a phone the chip keeps to
 * one line at the top and the meaning goes to the foot of the box, so
 * neither covers it.
 */
export function TurfTrendChip({ id, slug, bare = false }: { id: string; slug?: string | null; bare?: boolean }) {
  const trend = useTrending();
  const rank = trendRankOf(trend, { id, slug });
  if (!trend || !rank) return null;
  const meaning = trendMeaning(rank, trend.window);
  return (
    <>
      {/* Clear of the gallery's own controls: the photo count is top right, "View all" and "Show all photos" bottom right. */}
      <div
        data-nosnippet
        data-trend-chip
        className={`pointer-events-none absolute z-10 md:left-4 md:top-4 md:max-w-xs ${bare ? "left-3 top-2 max-w-[calc(100%-1.5rem)]" : "left-2 top-3 max-w-[calc(100%-6rem)]"}`}
      >
        <div className={`inline-block rounded-xl bg-white px-2.5 shadow-md ${bare ? "py-1 md:py-1.5" : "py-1.5"}`}>
          {/* The map's Trending coral (lib/map/clusters.ts MAP_COLORS.trend, 5.0:1 on white), as on the cards. */}
          <p className="flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold leading-4 text-[#D81B4F] tabular-nums md:text-[14px] md:leading-5">
            <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={2.75} aria-hidden />
            {trendChip(rank)}
          </p>
          <p className={`mt-0.5 text-[11px] leading-[14px] text-primary-500 md:text-[12px] md:leading-4 ${bare ? "hidden md:block" : ""}`}>{meaning}</p>
        </div>
      </div>
      {bare && (
        <p
          data-nosnippet
          data-trend-meaning
          className="pointer-events-none absolute bottom-2.5 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-full bg-white px-2.5 py-1 text-[11px] leading-[14px] text-primary-500 shadow-md md:hidden"
        >
          {meaning}
        </p>
      )}
    </>
  );
}
