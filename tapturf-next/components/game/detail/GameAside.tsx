"use client";

import { CalendarDays, Clock, Pencil, Share2, Users } from "lucide-react";
import { AskButton, FindGame, InPill, OpenGames, WaitingPill, WhatsAppHost, btn, cap, type CtaModel } from "./GameCta";

/** Wide screens: the card beside the page, sticky, with the price, when and who, and the one thing to do. */
export function GameAside({ m }: { m: CtaModel }) {
  const shareable = m.state !== "cancelled";
  const players = m.state === "ended" || m.state === "cancelled" ? m.spots.title : m.spots.open === 0 ? `${m.spots.title} · Full` : `${m.spots.title} · ${m.spots.open} open`;
  return (
    <aside className="hidden lg:block" aria-label="Join this game">
      <div className="sticky top-24 rounded-3xl border border-primary-200 bg-white p-6 shadow-elevated">
        <p className="text-[30px] font-bold text-primary-900 leading-none">{m.free ? "Free" : m.price}</p>
        <p className="mt-1.5 text-[15px] text-primary-500">{m.free ? "No cost to join" : "per player"}</p>

        <ul className="mt-5 rounded-2xl border border-primary-200 divide-y divide-primary-100">
          <li className="h-12 flex items-center gap-3 px-4 text-[15px] text-primary-900">
            <CalendarDays className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
            <span className="truncate">{m.day.title}</span>
          </li>
          <li className="h-12 flex items-center gap-3 px-4 text-[15px] text-primary-900">
            <Clock className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
            <span className="truncate">
              <span className="whitespace-nowrap">{m.range}</span>
              {m.duration && ` · ${m.duration}`}
            </span>
          </li>
          <li className="h-12 flex items-center gap-3 px-4 text-[15px] text-primary-900">
            <Users className="w-4 h-4 text-primary-500 shrink-0" aria-hidden />
            <span className="truncate">{players}</span>
          </li>
        </ul>

        <div className="mt-5 space-y-3">
          <AsideControl m={m} />
        </div>

        {shareable && (
          <button
            type="button"
            onClick={m.onShare}
            className="mt-3 w-full h-11 inline-flex items-center justify-center gap-2 rounded-full border border-primary-300 text-[15px] font-semibold text-primary-900 hover:bg-primary-50"
          >
            <Share2 className="w-4 h-4" aria-hidden />
            {m.shared ? "Link copied" : "Share"}
          </button>
        )}
      </div>
    </aside>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="text-[14px] text-primary-500 leading-snug text-center">{children}</p>;
}

function AsideControl({ m }: { m: CtaModel }) {
  switch (m.state) {
    case "host":
      return (
        <>
          <button type="button" onClick={m.onEdit} className={`${btn} w-full bg-primary-900 hover:bg-primary-800 text-white`}>
            <Pencil className="w-4 h-4" aria-hidden />
            Edit game
          </button>
          {m.pendingCount > 0 && (
            <a href="#requests" className="flex h-11 items-center justify-center text-[15px] font-semibold text-accent-800 hover:underline underline-offset-2">
              {m.pendingCount === 1 ? "1 request waiting" : `${m.pendingCount} requests waiting`}
            </a>
          )}
        </>
      );
    case "cancelled":
      return (
        <>
          <Helper>The host cancelled this game.</Helper>
          <FindGame wide />
        </>
      );
    case "ended":
      return (
        <>
          <Helper>This game has ended.</Helper>
          <FindGame wide />
        </>
      );
    case "declined":
      return (
        <>
          <Helper>Your request was declined. Try another game.</Helper>
          <FindGame wide />
        </>
      );
    case "accepted":
      return (
        <>
          <InPill wide />
          {m.waHref && <WhatsAppHost href={m.waHref} wide />}
        </>
      );
    case "pending":
      return (
        <>
          <WaitingPill wide />
          <Helper>Request sent. {cap(m.hostFirst)} will accept or decline.</Helper>
        </>
      );
    case "full":
      return (
        <>
          <Helper>{m.spots.line}</Helper>
          <OpenGames wide />
        </>
      );
    default:
      return (
        <>
          <AskButton m={m} wide />
          <Helper>The host accepts each player. You&apos;ll get a notification.</Helper>
        </>
      );
  }
}
