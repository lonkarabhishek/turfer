"use client";

import { Award, ChevronRight } from "lucide-react";
import { MEDALS } from "@/lib/profile/medals";
import { MedalArt } from "./MedalArt";
import { usePlayed } from "./usePlayed";

const BY_ID = new Map(MEDALS.map((m) => [m.id, m]));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The passport's way in on the Me card: the best three medals earned and
 * how many turfs are stamped (the played summary, lib/profile/playedStore.ts),
 * opening the Passport section. The same shape before it is in, so the
 * card never jumps.
 */
export function PassportEntry({ onOpen }: { onOpen: () => void }) {
  const played = usePlayed();
  const top = (played?.medals ?? []).map((id) => BY_ID.get(id)).filter((m) => !!m).slice(0, 3);
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
      {top.length > 0 ? (
        <span className="flex -space-x-3 shrink-0" aria-hidden>
          {top.map((m) => (
            <MedalArt key={m.id} art={m.art} size={36} />
          ))}
        </span>
      ) : (
        <span className="grid place-items-center w-[38px] h-[38px] shrink-0 rounded-full bg-accent-50 border border-accent-500/30" aria-hidden>
          <Award className="w-5 h-5 text-accent-600" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-primary-900 leading-tight">Your passport</span>
        <span className="block mt-0.5 text-[13px] text-primary-500 leading-snug">{line}</span>
      </span>
      <ChevronRight className="w-5 h-5 shrink-0 text-primary-400" aria-hidden />
    </button>
  );
}
