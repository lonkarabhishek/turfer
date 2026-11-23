"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { UserAvatar } from "@/components/account/UserAvatar";
import { NameWithTick } from "@/components/account/VerifiedTick";
import { WithMedal } from "@/components/profile/MedalBadge";
import { aboutFacts, type About } from "@/lib/tournament/about";
import type { TournamentHost } from "@/lib/tournament/types";

/**
 * The foot of the tournament's masthead: who started it and when, how
 * long it has been running, how many matches were scored live and when it
 * last changed (the words are lib/tournament/about.ts; the venue, the
 * format, the dates, the progress and the views stay where the masthead
 * already had them). The organiser is named only when the page was served
 * one (lib/tournament/host.ts: signed in, with a public profile right
 * now): their photo with their medal on it, their name and tick, the
 * whole row a link to /u/<username>, never fetched ahead. Without one the
 * strip says when and names nobody. Drawn on the masthead's dark green, so
 * it bleeds to the card's edges (the header clips it round).
 */
export function TournamentAbout({ about, host, onProfile }: { about: About; host: TournamentHost | null; onProfile?: () => void }) {
  const facts = aboutFacts(about, !!host);
  const when = { dateTime: about.startedIso, title: about.startedStamp };
  if (!host && !facts.length && !about.updated) return null;
  return (
    <div data-tournament-about className="relative mt-5 -mx-5 -mb-5 sm:-mx-7 sm:-mb-7 border-t border-white/10 bg-black/20 px-5 sm:px-7 py-3 sm:flex sm:items-center sm:justify-between sm:gap-6">
      {host && (
        <Link
          href={`/u/${host.username}`}
          prefetch={false}
          onClick={onProfile}
          data-tournament-host={host.username}
          className="press-tight -mx-2 flex min-h-[52px] min-w-0 items-center gap-3 rounded-2xl px-2 py-1 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
        >
          <WithMedal badge={host.medal ? { medal: host.medal, medals: host.medals } : null} size={18}>
            <UserAvatar src={host.photo} name={host.name} size={40} className="ring-2 ring-white/25" />
          </WithMedal>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] leading-tight text-white/65">
              <time {...when}>{about.startedBy}</time>
            </span>
            <span className="mt-0.5 block text-[16px] font-bold leading-snug text-white break-words">
              <NameWithTick name={host.name} ticked={host.verified} />
            </span>
          </span>
          <ChevronRight className="w-4 h-4 shrink-0 text-white/50" aria-hidden />
        </Link>
      )}
      {(facts.length > 0 || about.updated) && (
        <div className={`min-w-0 text-[13px] leading-relaxed text-white/80 ${host ? "mt-2 sm:mt-0 sm:text-right" : ""}`}>
          {facts.length > 0 && (
            <p>
              {facts.map((f, i) => (
                // Each fact stays whole on its line; the dot goes with the one before it.
                <span key={f} className="whitespace-nowrap">
                  {f === about.started ? <time {...when}>{f}</time> : f}
                  {i < facts.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          )}
          {about.updated && (
            <p className="text-[12px] text-white/60">
              <time dateTime={about.updated.iso}>{about.updated.text}</time>
              {about.updated.stamp ? ` · ${about.updated.stamp}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
