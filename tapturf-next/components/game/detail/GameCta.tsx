"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, Clock, MessageCircle } from "lucide-react";
import type { GameDay, SpotsInfo } from "@/lib/utils/game";
import type { CtaState } from "@/lib/utils/gameState";

/** Everything the bar (phones) and the side card (wide screens) show, for one ctaState(). */
export type CtaModel = {
  state: CtaState;
  free: boolean;
  /** "₹150" (or "Free"). */
  price: string;
  day: GameDay;
  /** formatTimeRange(). */
  range: string;
  duration: string | null;
  startClock: string;
  endClock: string;
  spots: SpotsInfo;
  current: number;
  max: number;
  pendingCount: number;
  /** firstName() of the host: "Rahul" or "the host". */
  hostFirst: string;
  /** wa.me link to the host, for an accepted player when the game has a number. */
  waHref: string | null;
  onAsk: () => void;
  onEdit: () => void;
  onShare: () => void;
  /** The link was just copied. */
  shared: boolean;
};

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const btn = "h-12 inline-flex items-center justify-center gap-2 rounded-full px-5 text-[16px] font-semibold whitespace-nowrap press-tight";

export function AskButton({ m, wide }: { m: CtaModel; wide?: boolean }) {
  return (
    <button type="button" onClick={m.onAsk} className={`${btn} px-6 bg-accent-600 hover:bg-accent-700 text-white ${wide ? "w-full" : ""}`}>
      Request to join
    </button>
  );
}

export function FindGame({ wide, label = "Find a game" }: { wide?: boolean; label?: string }) {
  return (
    <Link href="/games" className={`${btn} bg-primary-900 hover:bg-primary-800 text-white ${wide ? "w-full" : ""}`}>
      {label}
      <ArrowRight className="w-4 h-4" aria-hidden />
    </Link>
  );
}

export function OpenGames({ wide }: { wide?: boolean }) {
  return (
    <Link href="/games" className={`${btn} border border-primary-300 bg-white hover:bg-primary-50 text-primary-900 ${wide ? "w-full" : ""}`}>
      See open games
    </Link>
  );
}

export function WaitingPill({ wide }: { wide?: boolean }) {
  return (
    <span role="status" className={`${btn} report-pop bg-primary-100 text-primary-900 ${wide ? "w-full" : ""}`}>
      <Clock className="w-4 h-4" aria-hidden />
      Waiting
    </span>
  );
}

export function InPill({ wide }: { wide?: boolean }) {
  return (
    <span role="status" className={`${btn} report-pop border border-accent-200 bg-accent-50 text-accent-800 ${wide ? "w-full" : ""}`}>
      <CircleCheck className="w-4 h-4" aria-hidden />
      You&apos;re in
    </span>
  );
}

export function WhatsAppHost({ href, wide }: { href: string; wide?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#25D366] hover:bg-[#20c25c] text-[#052E16] ${wide ? "w-full" : ""}`}>
      <MessageCircle className="w-4 h-4" aria-hidden />
      WhatsApp host
    </a>
  );
}

export function PriceTitle({ m }: { m: CtaModel }) {
  if (m.free) return <>Free</>;
  return (
    <>
      {m.price}
      <span className="text-[13px] font-normal text-primary-500"> / player</span>
    </>
  );
}
