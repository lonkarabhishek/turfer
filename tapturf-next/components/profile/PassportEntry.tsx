"use client";

import { Award, ChevronRight } from "lucide-react";
import { usePlayed } from "./usePlayed";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The passport's way in on the Me card: how many medals are earned and
 * how many turfs are stamped (the played summary, lib/profile/playedStore.ts),
 * opening the Passport section. The medals themselves are drawn once, in
 * the arc over the photo (components/dashboard/MedalCrown.tsx), so this
 * row carries the passport's mark, not a second stack of them. The same
 * shape before it is in, so the card never jumps.
 */
export function PassportEntry({ onOpen }: { onOpen: () => void }) {
  const played = usePlayed();
  const turfs = played ? Object.keys(played.turfs).length : 0;
  const line = !played
    ? "Medals, stamps and your streak"
    : played.medals.length || turfs
      ? `${plural(played.medals.length, "medal", "medals")} · ${plural(turfs, "stamp", "stamps")}`
      : "Earn medals and stamps by playing";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-3 w-full flex items-center gap-3 rounded-2xl border border-primary-200 bg-white px-3 py-2.5 text-left hover:border-accent-500 transition-colors focus-neon"
    >
      <span className="grid place-items-center w-[38px] h-[38px] shrink-0 rounded-full bg-accent-50 border border-accent-500/30" aria-hidden>
        <Award className="w-5 h-5 text-accent-600" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-primary-900 leading-tight">Your passport</span>
        <span className="block mt-0.5 text-[13px] text-primary-500 leading-snug">{line}</span>
      </span>
      <ChevronRight className="w-5 h-5 shrink-0 text-primary-400" aria-hidden />
    </button>
  );
}
