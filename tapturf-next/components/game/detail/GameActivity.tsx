"use client";

import { useState } from "react";
import { CalendarClock, CalendarX, CircleCheck, Megaphone, MapPin, Rocket, UserPlus, Users, UsersRound } from "lucide-react";
import { activityView, activityWhen, type ActivityEntry, type ActivityKind } from "@/lib/games/activity";

const ICON: Record<ActivityKind, typeof Users> = {
  posted: Rocket,
  joined: UserPlus,
  update: Megaphone,
  time: CalendarClock,
  venue: MapPin,
  spots: Users,
  booked: CircleCheck,
  confirmed: UsersRound,
  full: Users,
  cancelled: CalendarX,
};

/**
 * What happened to the game and when, newest first, the last thing on its
 * page: the five newest, then "Show all" (lib/games/activity.ts works it
 * out from what the page already has; no read of its own). Each line says
 * how long ago and the India date and time. data-nosnippet: a search
 * snippet should quote the game, not its log. Nothing with no entries.
 */
export function GameActivity({ log, now }: { log: readonly ActivityEntry[]; now: number }) {
  const [all, setAll] = useState(false);
  if (log.length === 0) return null;
  const { shown, more } = activityView(log, all);
  return (
    <section aria-labelledby="activity-h" data-nosnippet className="border-t border-primary-100 pt-5">
      <h2 id="activity-h" className="text-[16px] font-bold text-primary-900">Activity</h2>
      <ol id="activity-list" className="mt-3 space-y-3">
        {shown.map((e) => {
          const Icon = ICON[e.kind];
          const when = activityWhen(e, now);
          return (
            <li key={e.key} className="flex gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary-50 text-primary-500">
                <Icon className="w-3.5 h-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] leading-snug text-primary-900 [overflow-wrap:anywhere]">{e.text}</span>
                <time dateTime={when.iso} className="block text-[12px] text-primary-500">
                  {when.ago} · {when.stamp}
                </time>
              </span>
            </li>
          );
        })}
      </ol>
      {(more > 0 || all) && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          aria-controls="activity-list"
          className="mt-1 h-11 text-[14px] font-semibold text-accent-800 hover:underline underline-offset-2"
        >
          {all ? "Show fewer" : `Show all ${log.length}`}
        </button>
      )}
    </section>
  );
}
