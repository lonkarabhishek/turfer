"use client";

import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";
import { streakNudge, sundayWords, type Streak } from "@/lib/profile/streak";
import { usePlayed } from "./usePlayed";

/**
 * The weekly streak, as one line: "3-week streak. Play this week to keep
 * it." Honest: from played games only (a game counts once it is over),
 * India weeks, Monday to Sunday. Nothing for someone who never played.
 */

export function StreakLine({ streak, games, compact = false }: { streak: Streak; games: number; compact?: boolean }) {
  const n = streakNudge(streak, games);
  if (!n) return null;
  const hot = n.tone === "hot";
  return (
    <span className="flex items-center gap-2.5 min-w-0 text-left">
      <span className={`grid place-items-center shrink-0 rounded-full ${compact ? "w-8 h-8" : "w-10 h-10"} ${hot ? "bg-hot-500 text-white" : "bg-amber-100 text-amber-700"}`} aria-hidden>
        <Flame className={compact ? "w-4 h-4" : "w-5 h-5"} strokeWidth={2.5} />
      </span>
      <span className="min-w-0">
        <span className={`block font-semibold text-primary-900 leading-tight ${compact ? "text-[14px]" : "text-[15px]"}`}>{n.title}</span>
        <span className={`block text-primary-600 leading-snug ${compact ? "text-[12px]" : "text-[13px]"}`}>
          {n.detail}
          {hot && <span className="text-primary-500"> Until {sundayWords(streak)}.</span>}
        </span>
      </span>
    </span>
  );
}

/** From the signed-in person's played games, as a link to their passport. Nothing until it is in. */
export function StreakNudge({ href = "/dashboard?tab=passport", className = "" }: { href?: string; className?: string }) {
  const played = usePlayed();
  if (!played || !streakNudge(played.streak, played.games)) return null;
  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 hover:border-amber-400 transition-colors focus-neon ${className}`}
    >
      <StreakLine streak={played.streak} games={played.games} compact />
      <ChevronRight className="w-5 h-5 shrink-0 text-amber-700" aria-hidden />
    </Link>
  );
}
