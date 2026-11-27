"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { trendRankOf } from "@/lib/map/trendingClient";
import { LIVE_LABEL, eventsAt, eventsCard } from "@/lib/tournament/turfEvents";
import { useTrending } from "./useTrending";
import { useTurfEvents } from "./useTurfEvents";

/**
 * On a turf's own page, over the bottom left corner of its photos: "On at
 * this turf", only for a turf that a live tournament that is on has as its
 * venue (useTurfEvents: GET /api/turf-events, read in the browser once the
 * page is idle). For each tournament, three at most: a "Live now" row for
 * every match of it being scored right now ("Titans v Kings", a link to
 * the live scorecard), its name, its format, when it started and how many
 * matches are played, its next match while nothing is being scored, and a
 * link to its points table and fixtures. Every word is
 * lib/tournament/turfEvents.ts (eventsCard). Nothing about who organises it.
 *
 * It arrives after the page has loaded, so it is laid over the gallery and
 * takes no room of its own: nothing on the page moves, and a turf with
 * nothing on renders nothing at all. Never in the server HTML (the page is
 * cached for everyone, a week at a time) and marked data-nosnippet. The
 * page wraps the gallery in a `relative` box for it and for the Trending
 * chip, which keeps the top left corner; when this turf trends too
 * (useTrending: the same shared read the chip made, never a second
 * request) the card stops short of the chip, and scrolls inside itself
 * when three tournaments are taller than what is left of the photo.
 *
 * `photos`: how many photos the gallery shows. On a phone the gallery with
 * more than one photo ends in a row of dots, inside the same box, and
 * "View all" sits at the bottom right: from 360 px the card sits beside
 * that button, on a narrower phone above it with the photo's whole width.
 * With no photo the gallery is the "Photos coming soon" box and the card
 * may use its whole width, always a little above the foot of that box,
 * where a phone puts the chip's second line. Where the card sits never
 * depends on the chip, only how tall it may grow, so the chip arriving
 * after the card moves nothing.
 */
export function TurfEventsCard({ id, slug, photos }: { id: string; slug?: string | null; photos: number }) {
  const events = useTurfEvents();
  const chip = !!trendRankOf(useTrending(), { id, slug });
  const card = events ? eventsCard(eventsAt(events, id), events.at) : null;
  if (!card) return null;
  // Each height is the box less the card's own gap at the foot and 12px at the top, or, when the chip is there, the chip's own
  // room; under 360 px, where the card has the photo's whole width, it also stops short of the photo count at the top right.
  const phone =
    photos === 0
      ? `left-3 bottom-[38px] max-w-[calc(100%-1.5rem)] ${chip ? "max-h-[calc(100%-78px)]" : "max-h-[calc(100%-48px)]"}`
      : `left-2 bottom-[50px] max-w-[calc(100%-1rem)] min-[360px]:max-w-[calc(100%-7.5rem)] ${chip ? "max-h-[calc(100%-124px)]" : "max-h-[calc(100%-94px)]"} ${
          photos === 1
            ? `min-[360px]:bottom-3 ${chip ? "min-[360px]:max-h-[calc(100%-72px)]" : "min-[360px]:max-h-[calc(100%-24px)]"}`
            : `min-[360px]:bottom-[30px] ${chip ? "min-[360px]:max-h-[calc(100%-90px)]" : "min-[360px]:max-h-[calc(100%-42px)]"}`
        }`;
  const wide = `md:left-4 md:bottom-4 md:max-w-[min(22rem,calc(50%-2rem))] ${chip ? "md:max-h-[calc(100%-6rem)]" : "md:max-h-[calc(100%-2rem)]"}`;
  return (
    <aside
      data-nosnippet
      data-turf-events
      aria-label={card.heading}
      className={`absolute z-[11] overflow-y-auto overscroll-contain rounded-xl bg-white px-3 py-1.5 shadow-md md:py-2 ${phone} ${wide}`}
    >
      <p className="text-[11px] font-semibold uppercase leading-4 tracking-wide text-primary-500">{card.heading}</p>
      <ul className="divide-y divide-primary-100">
        {card.items.map((t) => (
          <li key={t.code} className="py-1.5 first:pt-0.5 last:pb-0">
            {t.live.map((l) => (
              <Link key={l.href} href={l.href} prefetch={false} aria-label={l.says} className="flex min-h-[32px] items-center gap-1.5 text-[13px] font-semibold leading-snug text-primary-900 hover:underline underline-offset-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-red-600 motion-safe:animate-pulse" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="text-red-700">{LIVE_LABEL}</span> · {l.sides}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
              </Link>
            ))}
            <p className="text-[13px] font-semibold leading-snug text-primary-800 line-clamp-2 [overflow-wrap:anywhere]">{t.name}</p>
            {/* Each fact keeps to one line where it can: the line breaks between facts, not inside "3 of 6 matches played". */}
            <p className="mt-0.5 text-[12px] leading-4 text-primary-500 tabular-nums">
              {t.facts.map((f, i) => (
                <Fragment key={f}>
                  <span className="inline-block">{i < t.facts.length - 1 ? `${f} ·` : f}</span>{" "}
                </Fragment>
              ))}
            </p>
            {t.next && <p className="mt-0.5 text-[12px] leading-4 text-primary-500 tabular-nums [overflow-wrap:anywhere]">{t.next}</p>}
            <Link href={t.href} prefetch={false} aria-label={t.linkSays} className="inline-flex min-h-[32px] items-center gap-0.5 text-[12px] font-semibold text-accent-700 underline underline-offset-2">
              {t.link}
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
