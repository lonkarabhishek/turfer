import Link from "next/link";
import { Repeat as RepeatIcon } from "lucide-react";
import { endsLabel, repeatLabel } from "@/lib/games/repeat";
import type { SeriesInfo } from "@/lib/games/types";
import { formatGameDay } from "@/lib/utils/game";

/** "Every Tue and Thu" as the middle of a sentence. */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * A game one of a repeat: how it repeats ("Repeats every Tue and Thu"),
 * that players join each game on its own, and its next games, each a
 * link to its own page. The host can stop it here (onStop opens the
 * sheet). Nothing for a game that isn't one.
 */
export function GameRepeat({
  info,
  others,
  isHost,
  onStop,
}: {
  info: SeriesInfo;
  /** Its other games still open, soonest first. */
  others: { id: string; date: string }[];
  isHost: boolean;
  onStop: () => void;
}) {
  const label = repeatLabel(info.rule);
  const ends = endsLabel(info.ends, info.starts_on);
  return (
    <section aria-labelledby="game-repeat" className="rounded-2xl border border-primary-200 bg-white px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="size-10 shrink-0 rounded-xl grid place-items-center bg-accent-50 text-accent-700">
          <RepeatIcon className="w-5 h-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="game-repeat" className="text-[16px] font-semibold text-primary-900 leading-snug">
            {info.active ? `Repeats ${lowerFirst(label)}` : `Repeated ${lowerFirst(label)}`}
          </h2>
          <p className="text-[14px] text-primary-500 leading-snug">
            {info.active
              ? `${ends ? `${ends.charAt(0).toUpperCase()}${ends.slice(1)}. ` : ""}${isHost ? "Players join each game on its own." : "Join each game on its own."}`
              : "No more games are going up."}
          </p>
        </div>
      </div>
      {others.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold text-primary-500 mb-1.5">{info.active ? "Next games" : "Its other games still on"}</p>
          <ul className="flex flex-wrap gap-1.5">
            {others.slice(0, 4).map((g) => (
              <li key={g.id}>
                <Link
                  href={`/game/${g.id}`}
                  className="inline-flex items-center h-9 px-3 rounded-full border border-primary-200 bg-primary-50 hover:border-accent-500 text-[13px] font-semibold text-primary-800 whitespace-nowrap focus-neon"
                >
                  {formatGameDay(g.date).short}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {isHost && info.active && (
        <button
          type="button"
          onClick={onStop}
          className="mt-3 inline-flex items-center min-h-11 px-4 rounded-full border-2 border-primary-200 bg-white hover:border-hot-500 text-[14px] font-bold text-primary-800 transition-colors focus-neon"
        >
          Stop repeating
        </button>
      )}
    </section>
  );
}
