"use client";

import { useState } from "react";
import { CircleCheck, Star } from "lucide-react";
import { openReport } from "@/components/turf/reviews/ui";
import { playedHereText } from "@/lib/profile/playedHere";
import { usePlayed } from "./usePlayed";

/**
 * The turf page's line, under "Games at this turf", with "Rate it" when
 * they played here and haven't reviewed it (it opens the review sheet).
 */
export function PlayedHereNote({ turfId }: { turfId: string }) {
  const played = usePlayed();
  const [now] = useState(Date.now);
  const day = played?.turfs[turfId];
  if (!day) return null;
  const rate = played?.toReview.includes(turfId);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <p className="inline-flex items-center gap-2 rounded-full bg-accent-50 border border-accent-500/30 pl-2 pr-3.5 py-1.5 text-[14px] font-semibold text-accent-800">
        <CircleCheck className="w-4 h-4 shrink-0 text-accent-600" aria-hidden />
        {playedHereText(day, now)}
      </p>
      {rate && (
        <button
          type="button"
          onClick={() => openReport({ channel: "turf_page" })}
          className="inline-flex items-center gap-1.5 min-h-[40px] rounded-full bg-accent-500 px-4 text-[14px] font-semibold text-white hover:bg-accent-600 focus-neon"
        >
          <Star className="w-4 h-4" aria-hidden />
          Rate it
        </button>
      )}
    </div>
  );
}
