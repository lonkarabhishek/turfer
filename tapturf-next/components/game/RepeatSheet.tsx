"use client";

import { useEffect } from "react";
import { Check, Info, Minus, Plus, Repeat as RepeatIcon, X } from "lucide-react";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { formatGameDay } from "@/lib/utils/game";
import {
  MAX_EVERY,
  SERIES_DAYS,
  WEEK_ORDER,
  maxGames,
  monthlyChoices,
  nextDays,
  repeatLabel,
  repeatParts,
  repeatProblem,
  startRule,
  type Repeat,
  type RepeatEnds,
  type RepeatRule,
} from "@/lib/games/repeat";

const LETTER = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const plusDays = (d: string, n: number) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};

/** A radio row in a grouped card, as the create flow's rows. */
function Choice({ on, title, hint, onPick, children }: { on: boolean; title: string; hint?: string; onPick: () => void; children?: React.ReactNode }) {
  return (
    <div className="border-b border-primary-100 last:border-0">
      <button
        type="button"
        role="radio"
        aria-checked={on}
        onClick={onPick}
        className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] text-left active:bg-primary-50 transition-colors focus-neon"
      >
        <span className={`size-5 shrink-0 rounded-full border-2 grid place-items-center ${on ? "border-accent-500 bg-accent-500" : "border-primary-300 bg-white"}`} aria-hidden>
          {on && <span className="size-2 rounded-full bg-white" />}
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-primary-800 leading-snug">{title}</span>
          {hint && <span className="block text-[12px] text-primary-500 leading-snug mt-0.5">{hint}</span>}
        </span>
      </button>
      {on && children && <div className="px-4 pb-3.5 -mt-1">{children}</div>}
    </div>
  );
}

const groupLabel = "text-[11px] font-semibold text-primary-500 px-1 pb-2 pt-5 first:pt-1";

/**
 * How the game repeats, as a calendar asks it: not at all, weekly on the
 * days the host picks (every 1 to 4 weeks), or monthly on the same date or
 * the nth weekday of the first one; ending never (up to a year), on a
 * date or after a number of games. The line it makes and the next dates
 * show as they change (lib/games/repeat.ts, the database's own maths), and
 * that the host books the turf for each date. Every change applies at
 * once; Done closes it.
 */
export function RepeatSheet({
  open,
  start,
  startTime,
  endTime,
  value,
  onChange,
  onClose,
  place = "turf",
}: {
  open: boolean;
  /** What the game is at: a turf on TapTurf, or a venue the host typed in. */
  place?: "turf" | "venue";
  /** The first day (the create flow's date), YYYY-MM-DD. */
  start: string;
  startTime: string;
  endTime: string | null;
  /** null: does not repeat. */
  value: Repeat | null;
  onChange: (r: Repeat | null) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const freq = value?.rule.freq ?? null;
  const ends: RepeatEnds = value?.ends ?? { type: "never" };
  const most = value ? maxGames(value.rule, start) : 2;
  const set = (rule: RepeatRule, e: RepeatEnds = ends) => {
    // "After N" never asks for more games than the rule makes in its year.
    const fixed = e.type === "after" ? { ...e, count: Math.min(e.count, maxGames(rule, start)) } : e;
    onChange({ rule, ends: fixed });
  };
  const pickFreq = (f: RepeatRule["freq"] | null) => {
    if (!f) return onChange(null);
    if (value?.rule.freq === f) return;
    set(startRule(f, start));
  };
  const toggleDay = (d: number) => {
    if (value?.rule.freq !== "weekly") return;
    const days = value.rule.days.includes(d) ? value.rule.days.filter((x) => x !== d) : [...value.rule.days, d];
    if (days.length === 0) return; // at least one day
    set({ ...value.rule, days: days.sort((a, b) => a - b) });
  };
  const setEnds = (e: RepeatEnds) => value && set(value.rule, e);

  const problem = value ? repeatProblem(value, start) : null;
  const next = value && !problem ? nextDays(value, start, startTime || "00:00", 5) : [];

  return (
    <ViewportOverlay className="z-[70] flex items-end sm:items-center justify-center" data-modal-open="true">
      <div className="fixed inset-0 bg-primary-800/50 animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="repeat-title"
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-elevated animate-slide-up flex flex-col max-h-[calc(var(--vv-h,100dvh)*0.9)]"
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 bg-primary-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-primary-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center shadow-neon shrink-0">
              <RepeatIcon className="w-4 h-4 text-white" strokeWidth={2.5} aria-hidden />
            </span>
            <p id="repeat-title" className="text-[15px] font-bold text-primary-800 leading-none">Repeat</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors focus-neon">
            <X className="w-4 h-4 text-primary-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
          <div role="radiogroup" aria-label="How often" className="bg-white border border-primary-200 rounded-2xl overflow-hidden">
            <Choice on={!freq} title="Does not repeat" onPick={() => pickFreq(null)} />
            <Choice on={freq === "weekly"} title="Weekly" hint="On the days you pick, every 1 to 4 weeks" onPick={() => pickFreq("weekly")}>
              {value?.rule.freq === "weekly" && (
                <div className="space-y-3">
                  <div>
                    <p className="text-[12px] font-semibold text-primary-600 mb-1.5">Every</p>
                    <div className="flex bg-primary-100 rounded-xl p-1 gap-0.5" role="radiogroup" aria-label="Every how many weeks">
                      {Array.from({ length: MAX_EVERY }, (_, i) => i + 1).map((n) => {
                        const on = value.rule.freq === "weekly" && value.rule.interval === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => value.rule.freq === "weekly" && set({ ...value.rule, interval: n })}
                            className={`flex-1 min-h-[40px] rounded-lg text-[13px] font-bold transition-all focus-neon ${on ? "bg-white text-accent-600 shadow-sm" : "text-primary-600"}`}
                          >
                            {n === 1 ? "Week" : `${n} weeks`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-primary-600 mb-1.5">On</p>
                    <div className="grid grid-cols-7 gap-1">
                      {WEEK_ORDER.map((d) => {
                        const on = value.rule.freq === "weekly" && value.rule.days.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={on}
                            aria-label={DAY_NAME[d]}
                            onClick={() => toggleDay(d)}
                            className={`aspect-square min-h-9 rounded-full text-[14px] font-bold grid place-items-center transition-all active:scale-95 focus-neon ${
                              on ? "bg-accent-500 text-white shadow-neon" : "bg-white border-2 border-primary-200 text-primary-700"
                            }`}
                          >
                            {LETTER[d]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </Choice>
            <Choice on={freq === "monthly"} title="Monthly" hint="The same date, or a weekday such as the first Sunday" onPick={() => pickFreq("monthly")}>
              {value?.rule.freq === "monthly" && (
                <div role="radiogroup" aria-label="Which day of the month" className="space-y-1.5">
                  {monthlyChoices(start).map((c) => {
                    const r = value.rule;
                    const on = r.freq === "monthly" && r.by === c.by && (c.by === "date" || (r.by === "weekday" && c.by === "weekday" && r.nth === c.nth));
                    return (
                      <button
                        key={repeatLabel(c)}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => set(c)}
                        className={`w-full flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 min-h-[44px] text-left text-[14px] font-semibold border-2 transition-all focus-neon ${
                          on ? "border-accent-500 bg-accent-50 text-primary-900" : "border-primary-200 bg-white text-primary-700"
                        }`}
                      >
                        {repeatLabel(c).replace(/^Monthly on/, "On")}
                        {on && <Check className="w-4 h-4 text-accent-600 shrink-0" strokeWidth={3} aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              )}
            </Choice>
          </div>

          {value && (
            <>
              <p className={groupLabel}>Ends</p>
              <div role="radiogroup" aria-label="Ends" className="bg-white border border-primary-200 rounded-2xl overflow-hidden">
                <Choice on={ends.type === "never"} title="Never" hint="Runs up to a year. Stop it any time." onPick={() => setEnds({ type: "never" })} />
                <Choice
                  on={ends.type === "on"}
                  title="On a date"
                  onPick={() => ends.type !== "on" && setEnds({ type: "on", date: plusDays(start, 56) })}
                >
                  {ends.type === "on" && (
                    <input
                      type="date"
                      aria-label="Last day"
                      value={ends.date}
                      min={start}
                      max={plusDays(start, SERIES_DAYS)}
                      onChange={(e) => e.target.value && setEnds({ type: "on", date: e.target.value })}
                      className="w-full min-h-11 border border-primary-200 rounded-xl px-3 py-2 text-[15px] text-primary-900 bg-primary-50 focus:outline-none focus:ring-2 focus:ring-accent-600"
                    />
                  )}
                </Choice>
                <Choice on={ends.type === "after"} title="After a number of games" onPick={() => ends.type !== "after" && setEnds({ type: "after", count: Math.min(8, most) })}>
                  {ends.type === "after" && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-3 bg-primary-100 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => setEnds({ type: "after", count: Math.max(2, ends.count - 1) })}
                          className="w-9 h-9 flex items-center justify-center rounded-lg bg-white text-primary-800 shadow-sm active:scale-95 focus-neon"
                          aria-label="Fewer games"
                        >
                          <Minus className="w-4 h-4" aria-hidden />
                        </button>
                        <span className="font-mono text-[16px] font-bold text-primary-800 tabular w-6 text-center" aria-live="polite">{ends.count}</span>
                        <button
                          type="button"
                          onClick={() => setEnds({ type: "after", count: Math.min(most, ends.count + 1) })}
                          className="w-9 h-9 flex items-center justify-center rounded-lg bg-white text-primary-800 shadow-sm active:scale-95 focus-neon"
                          aria-label="More games"
                        >
                          <Plus className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                      <span className="text-[14px] text-primary-600">games</span>
                    </div>
                  )}
                </Choice>
              </div>

              <p className="flex gap-2 text-[12px] text-primary-600 px-1 pt-4 leading-snug">
                <Info className="w-4 h-4 shrink-0 text-primary-400 mt-px" aria-hidden />
                <span>
                  Each game goes up 4 weeks ahead and players join each one. For bookings, contact the {place} directly for each date.
                </span>
              </p>
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-primary-200 px-4 py-3 bg-white">
          {/* What it makes, always in view while it changes */}
          {value && (
            <div className="mb-3 rounded-2xl bg-accent-50 border border-accent-500/30 px-3.5 py-2.5" aria-live="polite">
              {problem ? (
                <p className="text-[14px] font-semibold text-hot-600">
                  {problem === "ends" ? "That ends before a second game. Pick a later date or more games." : "Check how it repeats."}
                </p>
              ) : (
                <>
                  <p className="text-[14px] font-bold text-primary-900 leading-snug">
                    {repeatParts(value, start, startTime || null, endTime).map((p, i) => (
                      <span key={i} className={i === 1 ? "whitespace-nowrap" : undefined}>
                        {i > 0 && ", "}
                        {p}
                      </span>
                    ))}
                  </p>
                  {next.length > 0 && (
                    <p className="text-[12px] text-primary-700 mt-1 leading-snug">
                      <span className="font-semibold">Next: </span>
                      {next.slice(0, 4).map((d) => formatGameDay(d).plain).join(" · ")}
                      {next.length > 4 && " …"}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={!!problem}
            className="w-full min-h-[52px] rounded-full bg-primary-800 hover:bg-primary-900 text-white font-bold text-base transition-all disabled:opacity-30 active:scale-[0.98] focus-neon"
          >
            Done
          </button>
        </div>
        <div className="sm:hidden h-[var(--safe-b,env(safe-area-inset-bottom))] bg-white shrink-0" />
      </div>
    </ViewportOverlay>
  );
}
