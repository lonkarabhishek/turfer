"use client";

import { useState } from "react";
import { SPORT_ENGINES } from "@/lib/board";
import type { AnyRules, BoardSport, RulePreset } from "@/lib/board/types";
import { NumberInput } from "../inputs";
import { optionOn } from "./logic";

/**
 * A sport's rules as the engine's preset chips ("2 x 20", "Best of 3"),
 * shared by the setup screen and the mid-match rules sheet. A few rows
 * end in "Custom" for the one number groups change most.
 */

type Custom = { label: string; key: string; min: number; max: number; unit: string; base?: Record<string, unknown> };

const CUSTOM: Partial<Record<BoardSport, Record<string, Custom>>> = {
  football: { length: { label: "Minutes a half", key: "halfMinutes", min: 5, max: 60, unit: "minutes" } },
  // Custom is a timed game of 4 quarters; the pickup and 3x3 chips cover the rest.
  basketball: { format: { label: "Minutes a quarter", key: "periodMinutes", min: 1, max: 20, unit: "minutes", base: { periods: 4, clock: true, target: null, winBy: 1, scoring: "2s-3s", foulLimit: 4 } } },
  volleyball: { points: { label: "Points a set", key: "points", min: 5, max: 99, unit: "points" } },
  pickleball: { format: { label: "Points a game", key: "points", min: 5, max: 99, unit: "points" } },
  other: { format: { label: "First to", key: "target", min: 1, max: 999, unit: "points", base: { periods: null } } },
};

const CHIP = "press-tight min-h-12 px-3.5 py-2 rounded-xl border-2 text-[15px] font-bold leading-tight text-left transition-colors";
const chipTone = (on: boolean) => (on ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800 hover:border-primary-400");

export function RulesEditor({ sport, rules, onChange, idPrefix }: { sport: BoardSport; rules: AnyRules; onChange: (rules: AnyRules) => void; idPrefix: string }) {
  const engine = SPORT_ENGINES[sport];
  const presets = engine.presets as RulePreset<AnyRules>[];
  const customs = CUSTOM[sport] ?? {};
  // A row starts on Custom when its number matches none of the chips (a board set up that way, or changed mid-match).
  const [custom, setCustom] = useState<Record<string, boolean>>(() => Object.fromEntries(presets.filter((p) => customs[p.key] && !p.options.some((o) => optionOn(rules, o))).map((p) => [p.key, true])));
  const [texts, setTexts] = useState<Record<string, string>>({});
  const set = (patch: Record<string, unknown>) => onChange(engine.normalizeRules({ ...rules, ...patch }) as AnyRules);
  const r = rules as Record<string, unknown>;

  return (
    <div className="space-y-4">
      {presets.map((p) => {
        const c = customs[p.key];
        const isCustom = !!c && !!custom[p.key];
        const id = `${idPrefix}-${p.key}`;
        return (
          <div key={p.key}>
            <p id={`${id}-l`} className="text-[13px] font-semibold text-primary-800 mb-1.5">
              {p.label}
            </p>
            <div role="radiogroup" aria-labelledby={`${id}-l`} className="flex flex-wrap gap-2">
              {p.options.map((o) => {
                const on = !isCustom && optionOn(rules, o);
                return (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setCustom((x) => ({ ...x, [p.key]: false }));
                      set(o.rules as Record<string, unknown>);
                    }}
                    className={`${CHIP} ${chipTone(on)}`}
                  >
                    {o.label}
                  </button>
                );
              })}
              {c && (
                <button
                  type="button"
                  role="radio"
                  aria-checked={isCustom}
                  onClick={() => {
                    setCustom((x) => ({ ...x, [p.key]: true }));
                    if (c.base) set(c.base);
                  }}
                  className={`${CHIP} ${chipTone(isCustom)}`}
                >
                  Custom
                </button>
              )}
            </div>
            {isCustom && c && (
              <div className="mt-2 flex items-center gap-3">
                <label htmlFor={id} className="text-[14px] font-semibold text-primary-800">
                  {c.label}
                  <span className="block text-[12px] font-normal text-primary-500">
                    {c.min} to {c.max} {c.unit}
                  </span>
                </label>
                <div className="w-24 shrink-0">
                  <NumberInput
                    id={id}
                    value={texts[p.key] ?? (typeof r[c.key] === "number" ? String(r[c.key]) : "")}
                    onChange={(v) => {
                      setTexts((x) => ({ ...x, [p.key]: v }));
                      const n = Number(v);
                      if (v !== "" && n >= c.min) set({ [c.key]: Math.min(c.max, n) });
                    }}
                    min={c.min}
                    max={c.max}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
