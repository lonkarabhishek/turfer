"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, CalendarClock, CalendarDays, CalendarPlus, CalendarX, CircleCheck, Crown, MapPin, Network, Pencil, Radio, Rocket, Settings2, Trash2, Undo2, Users } from "lucide-react";
import { activityLines, activityView, activityWhen, mergeLogs, type ActivityKind, type LogEntry } from "@/lib/tournament/activity";
import type { Resolution } from "@/lib/tournament/standings";
import type { TournamentGetResponse } from "@/lib/tournament/types";

const ICON: Record<ActivityKind, typeof Users> = {
  started: Rocket,
  settings: Settings2,
  venue: MapPin,
  dates: CalendarDays,
  team: Users,
  added: CalendarPlus,
  moved: CalendarClock,
  changed: ArrowLeftRight,
  out: CalendarX,
  live: Radio,
  result: CircleCheck,
  fixed: Pencil,
  cleared: Undo2,
  draw: Network,
  finished: Crown,
  off: Trash2,
};
const TONE: Partial<Record<ActivityKind, string>> = { live: "bg-red-50 text-red-600", result: "bg-accent-50 text-accent-700", finished: "bg-amber-100 text-amber-800" };

/**
 * What happened to the tournament and when, newest first: the Activity
 * tab on a phone, the last section on a wide screen. The ten newest, then
 * "Show all". lib/tournament/activity.ts works the lines out from what the
 * page already has and from the log that rides in every poll (the newest
 * few); only a tap on "Show all" of a longer log asks for the rest (GET
 * /api/tournament/<code>/activity), and again only when the log has moved
 * on while it is open. Each line says how long ago and the India day and
 * time, as the masthead's "Updated" line does. data-nosnippet: a search
 * snippet should quote the tournament, not its log.
 */
export function TournamentActivity({ code, data, res, now, className = "" }: { code: string; data: TournamentGetResponse; res: Resolution; now: number; className?: string }) {
  const [all, setAll] = useState(false);
  const [full, setFull] = useState<LogEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef<number | null>(null);
  const wire = data.activity;
  const partial = !!wire && wire.total > wire.log.length;
  const newest = wire?.log[wire.log.length - 1]?.at ?? 0;

  // The rest of a long log: asked for once per state of the log, only while "Show all" is open.
  useEffect(() => {
    if (!all || !partial) return;
    if (full && (full[full.length - 1]?.at ?? 0) >= newest) return;
    if (asked.current === newest) return;
    asked.current = newest;
    fetch(`/api/tournament/${code}/activity`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { log?: unknown } | null) => {
        if (b && Array.isArray(b.log)) {
          setFull(b.log as LogEntry[]);
          setFailed(false);
        } else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, [all, partial, newest, full, code]);

  const t = data.tournament;
  const host = data.host;
  const lines = useMemo(() => {
    const log = wire && partial && full ? mergeLogs(full, wire.log) : wire?.log;
    return activityLines({ tournament: t, res, host, log, total: wire && partial && !full ? wire.total : log?.length });
  }, [t, res, host, wire, partial, full]);
  if (lines.length === 0) return null;
  const { shown, more } = activityView(lines, all);
  const waiting = all && partial && !full;

  return (
    <section aria-labelledby="t-activity" data-nosnippet className={`mt-2 lg:mt-10 ${className}`}>
      <h2 id="t-activity" className="hidden lg:block text-[20px] font-bold text-primary-900 mb-3">
        Activity
      </h2>
      <div className="rounded-2xl border border-primary-200 bg-white px-3.5 py-4 sm:px-5">
        <ol id="t-activity-list" className="lg:columns-2 lg:gap-x-8 [&>li]:mb-3.5 [&>li]:break-inside-avoid">
          {shown.map((e) => {
            const Icon = ICON[e.kind];
            const when = activityWhen(e, now);
            return (
              <li key={e.key} className="flex gap-3">
                <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${TONE[e.kind] ?? "bg-primary-50 text-primary-500"}`}>
                  <Icon className="w-3.5 h-3.5" aria-hidden />
                </span>
                <span className="min-w-0">
                  {e.href ? (
                    <Link href={e.href} prefetch={false} className="block text-[14px] leading-snug font-semibold text-primary-900 underline decoration-primary-300 underline-offset-2 hover:decoration-primary-900 [overflow-wrap:anywhere]">
                      {e.text} <ArrowRight className="inline w-3.5 h-3.5 align-[-2px]" aria-hidden />
                    </Link>
                  ) : (
                    <span className="block text-[14px] leading-snug text-primary-900 [overflow-wrap:anywhere]">{e.text}</span>
                  )}
                  <time dateTime={when.iso} className="block text-[12px] text-primary-500">
                    {when.ago ? `${when.ago} · ${when.stamp}` : when.stamp}
                  </time>
                </span>
              </li>
            );
          })}
        </ol>
        {waiting && (
          <p role="status" className="mt-3 text-[13px] text-primary-500">
            {failed ? "Couldn’t load the earlier activity. Tap Show fewer, then Show all, to try again." : "Loading the earlier activity."}
          </p>
        )}
        {(more > 0 || all) && (
          <button
            type="button"
            onClick={() => {
              if (all) asked.current = null;
              setFailed(false);
              setAll((v) => !v);
            }}
            aria-expanded={all}
            aria-controls="t-activity-list"
            className="-mt-1.5 h-11 text-[14px] font-semibold text-accent-800 hover:underline underline-offset-2"
          >
            {all ? "Show fewer" : partial && !full ? "Show all" : `Show all ${lines.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
