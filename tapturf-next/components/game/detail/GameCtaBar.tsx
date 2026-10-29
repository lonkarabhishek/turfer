"use client";

import Link from "next/link";
import { CircleCheck, Pencil } from "lucide-react";
import { liftCookieBanner } from "@/components/consent/liftCookieBanner";
import { AskButton, FindGame, InPill, OpenGames, PriceTitle, WaitingPill, WhatsAppHost, btn, cap, type CtaModel } from "./GameCta";

/** The bar's two lines for each state. */
function barText(m: CtaModel): { title: React.ReactNode; sub: React.ReactNode } {
  switch (m.state) {
    case "host":
      return {
        title: "Your game",
        sub: m.pendingCount > 0 ? (
          <span className="font-semibold text-accent-800">{m.pendingCount === 1 ? "1 request waiting" : `${m.pendingCount} requests waiting`}</span>
        ) : (
          m.spots.title
        ),
      };
    case "cancelled":
      return { title: "Cancelled", sub: m.day.plain };
    case "ended":
      return { title: "Game ended", sub: m.day.plain };
    case "accepted":
      return {
        title: (
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck className="w-5 h-5 text-accent-700" aria-hidden />
            You&apos;re in
          </span>
        ),
        sub: `${m.day.short} · ${m.startClock}`,
      };
    case "pending":
      return { title: "Request sent", sub: `${cap(m.hostFirst)} will accept or decline` };
    case "declined":
      return { title: "Request declined", sub: "Try another game" };
    case "full":
      return { title: <PriceTitle m={m} />, sub: `${m.day.short} · Full` };
    case "live":
      return { title: <PriceTitle m={m} />, sub: `Till ${m.endClock} · ${m.spots.hint}` };
    default:
      return { title: <PriceTitle m={m} />, sub: `${m.day.short} · ${m.spots.hint}` };
  }
}

/**
 * Phones and tablets: a solid white bar over the bottom nav (at the very
 * bottom from 768px, where there is no nav) with what matters now on the
 * left and the one thing to do on the right.
 */
export function GameCtaBar({ m }: { m: CtaModel }) {
  const { title, sub } = barText(m);
  return (
    <div
      ref={liftCookieBanner}
      className="fixed inset-x-0 z-30 lg:hidden bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0 md:pb-[calc(0.625rem+env(safe-area-inset-bottom))] bg-white border-t border-primary-200 px-4 md:pr-36 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]"
    >
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-bold text-primary-900 leading-tight truncate">{title}</p>
          <p className="text-[13px] text-primary-500 leading-snug truncate">{sub}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BarControl m={m} />
        </div>
      </div>
    </div>
  );
}

function BarControl({ m }: { m: CtaModel }) {
  switch (m.state) {
    case "host":
      return (
        <>
          <button
            type="button"
            onClick={m.onEdit}
            aria-label="Edit game"
            className="size-12 rounded-full border border-primary-300 bg-white grid place-items-center text-primary-900 hover:bg-primary-50"
          >
            <Pencil className="w-5 h-5" aria-hidden />
          </button>
          <Link href="/dashboard" className={`${btn} relative bg-primary-900 hover:bg-primary-800 text-white`}>
            Manage
            {m.pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-accent-400 text-primary-950 text-[11px] font-bold grid place-items-center">
                <span aria-hidden="true">{m.pendingCount}</span>
                <span className="sr-only">{m.pendingCount === 1 ? "1 request waiting" : `${m.pendingCount} requests waiting`}</span>
              </span>
            )}
          </Link>
        </>
      );
    case "cancelled":
    case "ended":
    case "declined":
      return <FindGame />;
    case "accepted":
      return m.waHref ? <WhatsAppHost href={m.waHref} /> : <InPill />;
    case "pending":
      return <WaitingPill />;
    case "full":
      return <OpenGames />;
    default:
      return <AskButton m={m} />;
  }
}
