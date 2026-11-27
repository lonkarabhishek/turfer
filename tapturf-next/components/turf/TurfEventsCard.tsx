"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LIVE_LABEL, eventsAt, eventsCard, type EventsCard } from "@/lib/tournament/turfEvents";
import { useTurfEvents } from "./useTurfEvents";
import { whenOffScreen } from "./whenOffScreen";

/**
 * "On at this turf" on a turf's own page ("Coming up at this turf" when
 * every tournament listed is still to start): a section of the page's
 * body right before "Games at this turf" and built as its sibling (the
 * same divider, heading, line under it and grid of cards), only for a turf
 * that a live tournament which is on, or still to start, has as its venue
 * (useTurfEvents: GET /api/turf-events, read in the browser once the page
 * is idle). One card for each tournament, three at most: its name, a
 * "Live now" row for every match of it being scored right now ("Titans v
 * Kings", a link to the live scorecard), its format, when it started and
 * how many matches are played, its next match while nothing is being
 * scored, and a button to its points table and fixtures. Every word is
 * lib/tournament/turfEvents.ts (eventsCard). Nothing about who organises
 * it. A turf with nothing on has no section, no heading and no empty
 * state: it looks exactly as it always did.
 *
 * It was a card laid over the photos until the site owner saw it there
 * (27 Nov 2026: "fix the tournament view on turf page, i dont like it.
 * Show it like a games at this turf section, only visible when the
 * tournament is live"). Nothing of it is on the gallery now.
 *
 * Turf pages are built ahead and kept a week, so nothing here is in the
 * page's HTML: the server renders an empty, zero-height div. A section
 * that arrives in the body would push what is under it, so it is shown by
 * the rule Free slots has (whenOffScreen.ts): only while its place is off
 * the screen, below it, or above it where the browser keeps the view
 * still. With its place on screen when the answer comes it waits until
 * the visitor scrolls on (or for the next page, where the tab already
 * knows the answer and the section is there before they reach it; on a
 * move inside the site, such as Back from the tournament, it is drawn
 * with the page). What is shown changes or goes by the same rule, so a
 * later read never moves what is in view either. Marked data-nosnippet.
 */
export function TurfEventsCard({ id }: { id: string }) {
  const events = useTurfEvents();
  const anchor = useRef<HTMLDivElement>(null);
  // What the list says for this turf now, and what is on the page: the second follows the first only while its place is off screen.
  const card = useMemo(() => (events ? eventsCard(eventsAt(events, id), events.at) : null), [events, id]);
  // It starts as what is known when the page is first drawn: nothing in the server's HTML and its hydration (useTurfEvents
  // answers null there), but on a move inside the site (a list's card tapped, Back from the tournament) the tab already
  // knows, and the section is part of the page from its first frame, where it moves nothing either.
  const [shown, setShown] = useState<EventsCard | null>(card);
  useEffect(() => {
    if (card === shown || !anchor.current) return;
    return whenOffScreen(anchor.current, () => setShown(card));
  }, [card, shown]);

  return (
    <div ref={anchor} data-nosnippet="">
      {shown && (
        <section className="section-divider" aria-labelledby="turf-events" data-turf-events>
          <h2 id="turf-events" className="text-[22px] font-bold text-primary-900 font-display mb-1">
            {shown.heading}
          </h2>
          <p className="text-[14px] text-primary-500 mb-5">{shown.sub}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shown.items.map((t) => (
              <article key={t.code} className="flex flex-col rounded-3xl border border-primary-200 bg-white p-4 shadow-soft">
                <h3 className="text-[18px] font-bold leading-snug text-primary-900 line-clamp-2 [overflow-wrap:anywhere]">{t.name}</h3>
                {t.live.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {t.live.map((l) => (
                      <li key={l.href}>
                        <Link href={l.href} prefetch={false} aria-label={l.says} className="flex min-h-[44px] items-center gap-2 rounded-2xl border border-red-600/25 bg-red-50 px-3 py-2 text-[15px] font-semibold leading-snug text-primary-900 hover:bg-red-100/70">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-600 motion-safe:animate-pulse" aria-hidden />
                          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                            <span className="text-red-700">{LIVE_LABEL}</span> · {l.sides}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-red-700" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {/* Each fact keeps to one line where it can: the line breaks between facts, not inside "3 of 6 matches played". */}
                <p className="mt-3 text-[14px] leading-5 text-primary-700 tabular-nums">
                  {t.facts.map((f, i) => (
                    <Fragment key={f}>
                      <span className="inline-block">{i < t.facts.length - 1 ? `${f} ·` : f}</span>{" "}
                    </Fragment>
                  ))}
                </p>
                {t.next && <p className="mt-1 text-[14px] leading-5 text-primary-500 tabular-nums [overflow-wrap:anywhere]">{t.next}</p>}
                <div className="mt-auto pt-4">
                  <Link href={t.href} prefetch={false} aria-label={t.linkSays} className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-4 text-[15px] font-semibold text-primary-900 hover:bg-primary-100">
                    {t.link}
                    <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
