"use client";

import Link from "next/link";
import { ArrowLeft, Ban, History, Share2, Users } from "lucide-react";
import type { HeroChip } from "@/lib/utils/gameState";
import type { SportFamily } from "@/lib/utils/sport";
import { GamePhoto } from "./GamePhoto";
import { SportGlyph } from "./SportArt";

export type { HeroChip };

const chipBase = "photo-chip inline-flex items-center gap-1.5 h-8 px-3 rounded-full shadow-soft text-[13px] font-semibold whitespace-nowrap";
/** White chips (photo-chip-light: solid white with a dark border under prefers-contrast: more). */
const lightChip = `${chipBase} photo-chip-light bg-white/95 text-primary-900`;

/**
 * The turf's photo (or its sport drawing) with the sport and one status
 * chip on it, and, on phones, back and share buttons. No other text on
 * the photo and no scrim: the title sits on the white sheet below.
 */
export function GameHero({
  photos,
  family,
  sport,
  sportName,
  chip,
  muted,
  onShare,
}: {
  photos: readonly string[] | undefined;
  family: SportFamily;
  /** The stored sport, for the glyph. */
  sport: string;
  /** sportLabel(sport). */
  sportName: string;
  chip: HeroChip;
  /** Ended or cancelled: the photo goes partly grey. */
  muted: boolean;
  onShare: () => void;
}) {
  return (
    <div className="relative">
      <GamePhoto
        photos={photos}
        family={family}
        eager
        hero
        sizes="(min-width:1024px) 760px, 100vw"
        className={`relative aspect-[2/1] lg:aspect-[21/9] sm:rounded-3xl ${muted ? "grayscale-[60%]" : ""}`}
        imgClassName="object-[center_60%]"
      />
      <Link
        href="/games"
        aria-label="All games"
        className="photo-btn lg:hidden absolute top-3 left-4 size-11 rounded-full bg-white shadow-soft grid place-items-center text-primary-900"
      >
        <ArrowLeft className="w-5 h-5" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={onShare}
        aria-label="Share this game"
        className="photo-btn lg:hidden absolute top-3 right-4 size-11 rounded-full bg-white shadow-soft grid place-items-center text-primary-900"
      >
        <Share2 className="w-5 h-5" aria-hidden />
      </button>
      <div className="absolute left-4 bottom-8 sm:bottom-4 flex flex-wrap items-center gap-2 pr-4">
        <span className={lightChip}>
          <SportGlyph sport={sport} className="w-4 h-4 text-accent-700" />
          {sportName}
        </span>
        {chip === "hosting" && <span className={`${chipBase} bg-accent-600 text-white`}>You&apos;re hosting</span>}
        {chip === "live" && (
          <span className={lightChip}>
            <span className="pulse-live size-2 rounded-full bg-hot-500" aria-hidden />
            Happening now
          </span>
        )}
        {chip === "full" && (
          <span className={`${chipBase} bg-primary-900 text-white`}>
            <Users className="w-4 h-4" aria-hidden />
            Full
          </span>
        )}
        {chip === "ended" && (
          <span className={lightChip}>
            <History className="w-4 h-4" aria-hidden />
            Ended
          </span>
        )}
        {chip === "cancelled" && (
          <span className={lightChip}>
            <Ban className="w-4 h-4" aria-hidden />
            Cancelled
          </span>
        )}
      </div>
    </div>
  );
}
