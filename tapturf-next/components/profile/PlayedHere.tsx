"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { playedHereShort, playedHereText } from "@/lib/profile/playedHere";
import { usePlayed } from "./usePlayed";

/**
 * "You played here on 12 Oct", for the signed-in person only, from their
 * own played games (usePlayed). Nothing in the server HTML or the
 * hydration pass, so cached lists and turf pages stay the same for
 * everyone else.
 */

/**
 * On a turf card's photo, top right: over the picture, so the list never
 * moves when it arrives. wide: nothing else on top of the photo (no
 * Trending or Claimed label), so it may take the photo's width.
 */
export function PlayedBadge({ turfId, wide = false }: { turfId: string; wide?: boolean }) {
  const played = usePlayed();
  const [now] = useState(Date.now);
  const day = played?.turfs[turfId];
  if (!day) return null;
  return (
    <span className={`absolute top-2.5 right-2.5 z-10 ${wide ? "max-w-[calc(100%-1.25rem)]" : "max-w-[55%]"} inline-flex h-6 items-center gap-1 rounded-full bg-primary-900/85 backdrop-blur-sm pl-1.5 pr-2.5 text-[11px] font-semibold text-white shadow-soft pointer-events-none`}>
      <CircleCheck className="w-3.5 h-3.5 shrink-0 text-accent-300" aria-hidden />
      <span className="truncate" aria-hidden>
        {playedHereShort(day, now)}
      </span>
      <span className="sr-only">{playedHereText(day, now)}.</span>
    </span>
  );
}

/** The turf page's line, under "Games at this turf". */
export function PlayedHereNote({ turfId }: { turfId: string }) {
  const played = usePlayed();
  const [now] = useState(Date.now);
  const day = played?.turfs[turfId];
  if (!day) return null;
  return (
    <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-accent-50 border border-accent-500/30 pl-2 pr-3.5 py-1.5 text-[14px] font-semibold text-accent-800">
      <CircleCheck className="w-4 h-4 shrink-0 text-accent-600" aria-hidden />
      {playedHereText(day, now)}
    </p>
  );
}
