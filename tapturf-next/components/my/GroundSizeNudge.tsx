import { Plus, Ruler } from "lucide-react";
import type { GroundSizeState } from "./GroundSizes";

/**
 * On a turf's dashboard (/my/turf/<id>): while the turf has no ground size,
 * a card asking for it, with a button down to the Ground size section
 * (GroundSizes). Nothing until that section has looked, or once it's set.
 */
export function GroundSizeNudge({ state, className = "" }: { state: GroundSizeState; className?: string }) {
  if (state !== "none") return null;
  return (
    <section aria-label="Add your ground size" className={`rounded-2xl border border-accent-200 bg-accent-50/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${className}`}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className="w-10 h-10 shrink-0 rounded-full bg-accent-50 text-accent-700 inline-flex items-center justify-center">
          <Ruler className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-primary-900 leading-snug">Add your ground size</p>
          <p className="mt-0.5 text-[13px] text-primary-600 leading-snug">
            Players pick turfs by size: length, width and net height. Your page then shows what your ground suits, from adult cricket to juniors and football.
          </p>
        </div>
      </div>
      <a
        href="#ground-size"
        className="press-tight self-start sm:self-auto shrink-0 inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[13px] font-semibold transition-colors"
      >
        <Plus className="w-4 h-4" aria-hidden /> Add size
      </a>
    </section>
  );
}
