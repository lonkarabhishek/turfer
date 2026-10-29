import { CalendarCheck, CalendarClock, IndianRupee, Users } from "lucide-react";
import type { GameDay, SkillInfo, SpotsInfo } from "@/lib/utils/game";

/** Three bars: rising (1 to 3 lit) for beginners to advanced, three equal lit bars for all levels. Decorative. */
export function LevelMeter({ meter, className = "" }: { meter: SkillInfo["meter"]; className?: string }) {
  const all = meter === 0;
  return (
    <span className={`level-meter ${className}`} data-all={all ? "" : undefined} aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <i key={n} data-on={all || n <= meter ? "" : undefined} />
      ))}
    </span>
  );
}

/** A small calendar page: the weekday on a green band (grey once played), the date below. Decorative. */
export function CalTile({ day, past }: { day: GameDay; past: boolean }) {
  return (
    <span aria-hidden="true" className={`size-10 shrink-0 rounded-xl border overflow-hidden flex flex-col bg-white ${past ? "border-primary-200" : "border-accent-200"}`}>
      <span className={`h-3.5 shrink-0 text-center text-[9px] font-bold tracking-wider leading-[14px] text-white ${past ? "bg-primary-500" : "bg-accent-600"}`}>
        {day.weekday}
      </span>
      <span className="flex-1 grid place-items-center text-[17px] font-bold leading-none text-primary-900 tabular">{day.dom}</span>
    </span>
  );
}

/**
 * "10 AM – 12 PM · 2 hours"; a night game "11 PM – 1 AM · 2 hours · ends
 * next day". The range and the length each stay on one line and the only
 * place it can break is after the "·" that follows the range, so on a
 * narrow screen it reads "11 PM – 1 AM ·" / "2 hours · ends next day",
 * never with "day" alone. `spoken` (speakTimeRange) is what screen readers
 * hear instead of the range.
 */
export function RangeAndLength({ range, spoken, length }: { range: string; spoken?: string; length: string | null }) {
  return (
    <>
      {spoken && <span className="sr-only">{spoken}</span>}
      <span aria-hidden={spoken ? "true" : undefined} className="whitespace-nowrap">{range}</span>
      {length && (
        <>
          <span className="whitespace-nowrap">{"\u00a0·"}</span> <span className="whitespace-nowrap">{length}</span>
        </>
      )}
    </>
  );
}

function FactRow({ tile, title, hint, className = "" }: { tile: React.ReactNode; title: React.ReactNode; hint: React.ReactNode; className?: string }) {
  return (
    <li className={`flex items-center gap-3 px-4 py-3 min-h-16 ${className}`}>
      {tile}
      <div className="min-w-0">
        <p className="text-[16px] font-semibold text-primary-900 leading-snug">{title}</p>
        <p className="text-[14px] text-primary-500 leading-snug">{hint}</p>
      </div>
    </li>
  );
}

const tileBox = "size-10 shrink-0 rounded-xl grid place-items-center";

/**
 * The five things a player decides on, near the top and never folded
 * away: when, price, players, skill level and whether the turf is
 * booked. Each with an icon and words (never colour alone). One list on
 * phones; two columns (3 + 2) on wide screens.
 */
export function GameFacts({
  day,
  past,
  range,
  spokenRange,
  length,
  price,
  spots,
  skill,
  turf,
}: {
  day: GameDay;
  past: boolean;
  /** formatTimeRange(): shown, hidden from screen readers. */
  range: string;
  /** speakTimeRange(): what screen readers hear instead. */
  spokenRange: string;
  /** "2 hours", "2 hours · ends next day" (null when the slot has no end). */
  length: string | null;
  price: { free: boolean; label: string };
  spots: SpotsInfo;
  skill: SkillInfo;
  turf: { booked: boolean; title: string; hint: string };
}) {
  // Wide screens: the first three rows down the left column, the last two down the right.
  const col2 = "lg:border-l lg:border-primary-100";
  return (
    <ul
      aria-label="Game details"
      className="rounded-2xl border border-primary-200 bg-white divide-y divide-primary-100 lg:divide-y-0 lg:grid lg:grid-cols-2 lg:grid-rows-3 lg:grid-flow-col lg:[&>li:not(:first-child)]:border-t lg:[&>li:nth-child(4)]:border-t-0 lg:[&>li]:border-primary-100"
    >
      <FactRow
        tile={<CalTile day={day} past={past} />}
        title={day.title}
        hint={<RangeAndLength range={range} spoken={spokenRange} length={length} />}
      />
      <FactRow
        tile={
          <span className={`${tileBox} ${price.free ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-700"}`}>
            <IndianRupee className="w-5 h-5" aria-hidden />
          </span>
        }
        title={price.free ? "Free" : `${price.label} per player`}
        hint={price.free ? "No cost to join" : "Set by the host"}
      />
      <FactRow
        tile={
          <span className={`${tileBox} bg-primary-50 text-primary-700`}>
            <Users className="w-5 h-5" aria-hidden />
          </span>
        }
        title={spots.title}
        hint={spots.hint}
      />
      <FactRow
        className={col2}
        tile={
          <span className={`${tileBox} bg-primary-50`}>
            <LevelMeter meter={skill.meter} />
          </span>
        }
        title={
          <>
            <span className="sr-only">Skill level: </span>
            {skill.title}
          </>
        }
        hint={skill.hint}
      />
      <FactRow
        className={col2}
        tile={
          turf.booked ? (
            <span className={`${tileBox} bg-accent-50 text-accent-700`}>
              <CalendarCheck className="w-5 h-5" aria-hidden />
            </span>
          ) : (
            <span className={`${tileBox} bg-amber-50 text-amber-700`}>
              <CalendarClock className="w-5 h-5" aria-hidden />
            </span>
          )
        }
        title={turf.title}
        hint={turf.hint}
      />
    </ul>
  );
}
