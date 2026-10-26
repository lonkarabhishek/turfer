"use client";

import { Star } from "lucide-react";
import { STAR_WORDS } from "@/lib/reviews/catalog";
import { buzz } from "../ui";

/**
 * Screen 1, "How was your game?": the overall stars first, so the parts
 * can't pull them up or down. Skipped when the star was tapped on the page.
 */
export function Overall({ turfName, stars, onPick }: { turfName: string; stars: number; onPick: (n: number) => void }) {
  return (
    <div className="pt-2 pb-4">
      <h2 className="text-[22px] font-bold text-primary-900 leading-tight">How was your game?</h2>
      <p className="mt-1 text-[14px] text-primary-500">{turfName} · about 20 seconds</p>
      <div role="radiogroup" aria-label="Overall" className="mt-6 grid grid-cols-5 gap-2">
        {STAR_WORDS.map((word, i) => {
          const n = i + 1;
          const on = stars === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${n} star${n === 1 ? "" : "s"}, ${word}`}
              onClick={() => {
                buzz();
                onPick(n);
              }}
              className={`press-tight min-h-[88px] rounded-2xl border flex flex-col items-center justify-center gap-1.5 px-1 transition-colors ${
                on ? "border-accent-500 bg-accent-50" : "border-primary-200 bg-white hover:border-primary-400"
              }`}
            >
              <span className="relative inline-flex items-center justify-center w-14 h-8">
                <Star className={`w-8 h-8 ${n <= stars ? "fill-accent-500 text-accent-500" : "fill-none text-primary-300"} ${on ? "report-star" : ""}`} aria-hidden />
              </span>
              <span className={`text-[11px] leading-tight text-center ${on ? "text-accent-800 font-semibold" : "text-primary-500"}`}>{word}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The chosen stars under the header on screens 2 and 3: still tappable. */
export function StarsBar({ stars, onPick }: { stars: number; onPick: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2 px-5 pb-2">
      <div role="radiogroup" aria-label="Overall" className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}, ${STAR_WORDS[n - 1]}`}
            onClick={() => {
              buzz();
              onPick(n);
            }}
            className="w-9 h-11 flex items-center justify-center"
          >
            <Star className={`w-6 h-6 ${n <= stars ? "fill-accent-500 text-accent-500" : "fill-none text-primary-300"}`} aria-hidden />
          </button>
        ))}
      </div>
      <span className="ml-1 whitespace-nowrap text-[14px] font-semibold text-primary-700">{stars ? STAR_WORDS[stars - 1] : ""}</span>
    </div>
  );
}
