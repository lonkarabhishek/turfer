"use client";

import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import { starWord } from "@/lib/reviews/catalog";
import { rateTitle } from "@/lib/reviews/sheet";
import type { RateHint } from "@/lib/reviews/types";
import { buzz, StarsShown } from "./ui";

/**
 * The top of "Player reports": the first star is tapped right here, and
 * that opens the sheet on its second screen. Worded for the viewer when
 * they called or played here lately (review_mine's hint), so there is
 * nothing to dismiss and nothing nags. Signed-out visitors get it too.
 * For a signed-in viewer it waits for their own read (GET /api/reviews):
 * offering fresh stars to someone who already rated here would start a
 * new report over theirs.
 */
export function RateInline({
  turfName,
  hint,
  now,
  mine,
  blocked,
  state,
  onRetry,
  onRate,
  onEdit,
}: {
  turfName: string;
  hint: RateHint | null;
  /** The visitor's clock, after hydration (the hint's day words read it). */
  now: Date | null;
  /** Their live, held or hidden report. */
  mine: { rating: number; status?: string } | null;
  blocked: boolean;
  /** loading: the sign-in or their own read isn't in yet; failed: their own read didn't come back. */
  state: "ready" | "loading" | "failed";
  onRetry: () => void;
  onRate: (stars: number) => void;
  onEdit: () => void;
}) {
  const [hover, setHover] = useState(0);
  const [picked, setPicked] = useState(0);

  if (state === "loading") {
    return (
      <div className="rounded-2xl border border-primary-200 bg-white p-4 md:p-5" aria-busy="true" aria-label="Loading your report">
        <div className="h-5 w-56 max-w-full rounded-full bg-primary-100 animate-pulse" />
        <div className="mt-2 h-4 w-40 rounded-full bg-primary-100 animate-pulse" />
        <div className="mt-3 h-11 w-56 rounded-full bg-primary-50" />
      </div>
    );
  }

  if (state === "failed") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3">
        <p className="text-[14px] text-primary-700">Couldn&apos;t check your report here just now.</p>
        <button type="button" onClick={onRetry} className="press-tight min-h-11 px-4 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-semibold text-primary-900">
          Try again
        </button>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4">
        <p className="text-[15px] text-primary-800">You manage this turf, so you can&apos;t rate it.</p>
        <Link href="/my" className="mt-1 inline-block text-[14px] font-semibold text-accent-700 hover:text-accent-800">
          See what players say on myTapturf
        </Link>
      </div>
    );
  }

  if (mine) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-white px-4 py-3">
        <p className="text-[14px] text-primary-700 flex flex-wrap items-center gap-x-2">
          <span className="font-semibold text-primary-900">Your report:</span>
          <StarsShown n={mine.rating} />
          <span>{starWord(mine.rating)}</span>
          {mine.status === "held" && <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[12px] font-semibold text-primary-700">Under review</span>}
        </p>
        <button type="button" onClick={onEdit} className="press-tight min-h-11 px-4 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-semibold text-primary-900">
          Edit
        </button>
      </div>
    );
  }

  const shown = hover || picked;
  return (
    <div className="rounded-2xl border border-primary-200 bg-white p-4 md:p-5 shadow-card">
      <p className="text-[17px] font-semibold text-primary-900 leading-snug">{rateTitle(turfName, now ? hint : null, now ?? new Date(0))}</p>
      <p className="mt-0.5 text-[14px] text-primary-500">Tap a star. About 20 seconds, no typing.</p>
      <div role="radiogroup" aria-label="Your overall rating" className="mt-3 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={picked === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}, ${starWord(n)}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => {
              buzz();
              setPicked(n);
              onRate(n);
            }}
            className="press-tight w-11 h-11 rounded-full flex items-center justify-center hover:bg-accent-50"
          >
            <Star className={`w-8 h-8 transition-colors ${n <= shown ? "fill-accent-500 text-accent-500" : "fill-none text-primary-300"} ${picked === n ? "report-star" : ""}`} />
          </button>
        ))}
        <span className="ml-2 text-[14px] font-semibold text-primary-700 min-w-[5rem]" aria-hidden>
          {shown ? starWord(shown) : ""}
        </span>
      </div>
    </div>
  );
}
