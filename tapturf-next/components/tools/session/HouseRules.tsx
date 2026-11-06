"use client";

import type { Rules } from "@/lib/cricket/scoring";
import { Segmented } from "../inputs";

/** One line for a fold's subtitle: "Wide 1 run, No-ball 1 run, free hit". */
export function ruleSummary(rules: Rules): string {
  return [
    rules.wideRuns === 1 ? "Wide 1 run" : `Wide ${rules.wideRuns} runs`,
    rules.noBallRuns === 1 ? "No-ball 1 run" : `No-ball ${rules.noBallRuns} runs`,
    rules.freeHit ? "free hit" : "no free hit",
    rules.lastManStands ? "last man stands" : "",
    rules.maxOversPerBowler ? `${rules.maxOversPerBowler} overs a bowler` : "",
    rules.retireAt ? `retire at ${rules.retireAt}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** The Live Cricket Scorer's house rules (components/tools/scorer/Setup.tsx), the same choices in the same words. */
export function HouseRules({ rules, onChange }: { rules: Rules; onChange: (r: Rules) => void }) {
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => onChange({ ...rules, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">A wide gives</p>
          <Segmented
            value={String(rules.wideRuns) as "0" | "1" | "2"}
            onChange={(v) => set("wideRuns", Number(v))}
            ariaLabel="Runs for a wide"
            options={[
              { value: "1", label: "1 run" },
              { value: "0", label: "0 runs" },
              { value: "2", label: "2 runs" },
            ]}
          />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">A no-ball gives</p>
          <Segmented
            value={String(rules.noBallRuns) as "0" | "1" | "2"}
            onChange={(v) => set("noBallRuns", Number(v))}
            ariaLabel="Runs for a no-ball"
            options={[
              { value: "1", label: "1 run" },
              { value: "2", label: "2 runs" },
              { value: "0", label: "0 runs" },
            ]}
          />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Free hit after a no-ball</p>
          <Segmented
            value={rules.freeHit ? "on" : "off"}
            onChange={(v) => set("freeHit", v === "on")}
            ariaLabel="Free hit after a no-ball"
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
          />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Last man stands</p>
          <Segmented
            value={rules.lastManStands ? "on" : "off"}
            onChange={(v) => set("lastManStands", v === "on")}
            ariaLabel="Last man stands"
            options={[
              { value: "off", label: "Off" },
              { value: "on", label: "On" },
            ]}
          />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Max overs a bowler</p>
          <Segmented
            value={rules.maxOversPerBowler ? String(rules.maxOversPerBowler) : "none"}
            onChange={(v) => set("maxOversPerBowler", v === "none" ? null : Number(v))}
            ariaLabel="Max overs a bowler"
            options={[
              { value: "none", label: "No limit" },
              { value: "1", label: "1" },
              { value: "2", label: "2" },
              { value: "3", label: "3" },
              { value: "4", label: "4" },
            ]}
          />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Batter retires at</p>
          <Segmented
            value={rules.retireAt ? String(rules.retireAt) : "none"}
            onChange={(v) => set("retireAt", v === "none" ? null : Number(v))}
            ariaLabel="Batter retires at"
            options={[
              { value: "none", label: "Off" },
              { value: "25", label: "25" },
              { value: "30", label: "30" },
              { value: "50", label: "50" },
            ]}
          />
        </div>
      </div>
      <p className="text-[12px] text-primary-500">Last man stands lets the last batter carry on alone. Retire at only reminds you; you decide.</p>
    </div>
  );
}
