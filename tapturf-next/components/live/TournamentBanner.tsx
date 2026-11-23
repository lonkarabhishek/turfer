"use client";

import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { bannerOf, type LiveTournament } from "@/lib/tournament/scorecard";

/**
 * Over a live scorecard that is a tournament's match: the tournament's
 * name, which match this is there, the two sides by their tournament
 * names when the scorer typed them differently, the next match once this
 * one is over, and the way to the tournament's table and fixtures (the
 * words are lib/tournament/scorecard.ts). One link, the whole strip. Edge
 * to edge over the score on a phone, a card of its own from sm up. A
 * scorecard that is no tournament's never draws this.
 */
export function TournamentBanner({ tournament, shown, over, onOpen, className = "" }: { tournament: LiveTournament; shown: { a: string; b: string } | null; over: boolean; onOpen?: () => void; className?: string }) {
  const b = bannerOf(tournament, { shown, over });
  return (
    <Link
      href={b.href}
      onClick={onOpen}
      data-live-tournament={tournament.code}
      className={`press-tight group flex items-start gap-3 bg-accent-50 px-3 py-3 text-left hover:bg-accent-100/70 sm:rounded-2xl sm:border sm:border-accent-500/25 sm:px-4 ${className}`}
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-900 text-accent-300" aria-hidden>
        <Trophy className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold leading-tight text-primary-600">
          {b.place}
          {b.sides ? ` · ${b.sides}` : ""}
        </span>
        <span className="mt-0.5 block text-[16px] font-bold leading-snug text-primary-900 break-words">{b.name}</span>
        {b.next && <span className="mt-1 block text-[13px] leading-snug text-primary-700">{b.next}</span>}
        <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold text-accent-700 group-hover:underline underline-offset-2">
          {b.link} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </span>
    </Link>
  );
}
