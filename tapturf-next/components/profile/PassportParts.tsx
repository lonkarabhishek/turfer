import Link from "next/link";
import { ChevronRight, Star } from "lucide-react";
import { turfPath } from "@/lib/utils/turfPath";
import type { MedalArt as Art } from "@/lib/profile/medals";
import { MedalArt } from "./MedalArt";

/**
 * Pieces of the passport that the Me tab and the public profile share:
 * the numbers, a medal tile and the reviewed turfs. No state, so the
 * public profile renders them on the server.
 */

export type NumberItem = { label: string; value: number | string; href?: string };

export function PassportNumbers({ items, cols = 4, label }: { items: NumberItem[]; cols?: 3 | 4; label: string }) {
  return (
    <ul className={`grid ${cols === 4 ? "grid-cols-4" : "grid-cols-3"} gap-2`} aria-label={label}>
      {items.map((it) => {
        const inner = (
          <>
            <span className="block font-display text-[26px] sm:text-[30px] leading-none font-semibold text-primary-900 tabular-nums">{it.value}</span>
            <span className="mt-1.5 block text-[12px] font-medium text-primary-500 leading-tight">{it.label}</span>
          </>
        );
        return (
          <li key={it.label}>
            {it.href ? (
              <Link href={it.href} className="block h-full rounded-2xl bg-white border border-primary-200 px-2 py-3.5 text-center hover:border-accent-500 transition-colors focus-neon">
                {inner}
              </Link>
            ) : (
              <div className="h-full rounded-2xl bg-white border border-primary-200 px-2 py-3.5 text-center">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One medal: its art, its name, and a line under it (when it was earned, what it is for, or what it takes). */
export function MedalTile({ art, name, line, locked = false, progress }: { art: Art; name: string; line: string; locked?: boolean; progress?: number }) {
  return (
    <div className={`flex flex-col items-center text-center rounded-2xl px-2 pt-3 pb-3 h-full ${locked ? "bg-primary-50" : "bg-white border border-primary-200"}`}>
      <MedalArt art={art} locked={locked} size={60} />
      <p className={`mt-2 text-[13px] font-semibold leading-tight ${locked ? "text-primary-600" : "text-primary-900"}`}>
        {name}
        {locked && <span className="sr-only"> (not earned yet)</span>}
      </p>
      <p className="mt-1 text-[12px] leading-snug text-primary-500">{line}</p>
      {locked && typeof progress === "number" && progress > 0 && (
        <span className="mt-2 block w-full max-w-[84px] h-1 rounded-full bg-primary-200 overflow-hidden" aria-hidden>
          <span className="block h-full rounded-full bg-accent-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

export type ReviewedItem = { turfId: string; slug: string | null; name: string; cityLabel: string | null; rating: number; when?: string | null };

export function ReviewedList({ items }: { items: ReviewedItem[] }) {
  return (
    <ul className="divide-y divide-primary-100 rounded-2xl border border-primary-200 bg-white overflow-hidden">
      {items.map((r) => (
        <li key={r.turfId}>
          <Link href={turfPath({ id: r.turfId, slug: r.slug })} className="flex items-center gap-3 px-4 py-3 min-h-[60px] hover:bg-primary-50 transition-colors focus-neon">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-primary-900 truncate">{r.name}</span>
              <span className="block text-[13px] text-primary-500 truncate">{[r.cityLabel, r.when].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="inline-flex items-center gap-1 shrink-0 text-[14px] font-semibold text-primary-900 tabular-nums" aria-label={`Rated ${r.rating} out of 5`}>
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-hidden />
              {r.rating}
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 text-primary-400" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
