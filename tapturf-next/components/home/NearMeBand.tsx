import Link from "next/link";
import { Navigation } from "lucide-react";

/** Dark band to /turf-near-me with the honest count of turfs that have map pins. */
export function NearMeBand({ pins }: { pins: number }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 mt-12">
      <Link
        href="/turf-near-me"
        className="group press-tight flex items-center justify-between gap-4 rounded-3xl bg-primary-900 hover:bg-primary-600 text-white px-6 py-6 md:px-8 md:py-7 transition-colors"
      >
        <span className="min-w-0">
          <span className="block font-display text-[22px] md:text-[28px] leading-tight">Find the nearest turf</span>
          <span className="block text-[15px] text-white/70 mt-1 tabular-nums">
            {pins > 0
              ? `${pins.toLocaleString("en-IN")} turfs with map pins, sorted by how far they are from you.`
              : "Sorted by how far they are from you."}
          </span>
        </span>
        <span
          aria-hidden
          className="shrink-0 w-11 h-11 rounded-full bg-white/15 group-hover:bg-white/25 inline-flex items-center justify-center transition-colors"
        >
          <Navigation className="w-5 h-5" />
        </span>
      </Link>
    </section>
  );
}
