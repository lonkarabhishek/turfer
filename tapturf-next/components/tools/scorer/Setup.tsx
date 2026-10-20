"use client";

import { useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import { DEFAULT_RULES, newMatch, type Match, type Rules, type Side } from "@/lib/cricket/scoring";
import { Field, NumberInput, PrimaryButton, Segmented, TextInput } from "../inputs";

const OVERS = [5, 6, 8, 10, 20];
const PLAYERS = [6, 8, 11];

/** Chips with a "Custom" box: one tap for the usual numbers, typing only for odd ones. */
function NumberChips({ label, value, onChange, presets, max, id, unit, cols }: { label: string; value: number; onChange: (n: number) => void; presets: number[]; max: number; id: string; unit: string; cols: string }) {
  const [custom, setCustom] = useState(!presets.includes(value));
  const [text, setText] = useState(presets.includes(value) ? "" : String(value));
  return (
    <div>
      <p id={`${id}-l`} className="text-[13px] font-semibold text-primary-800 mb-1.5">
        {label}
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-l`} className={`grid gap-2 ${cols}`}>
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={!custom && value === n}
            aria-label={`${n} ${unit}`}
            onClick={() => {
              setCustom(false);
              onChange(n);
            }}
            className={`press-tight h-12 px-2 rounded-xl border-2 text-[17px] font-bold tabular-nums transition-colors ${!custom && value === n ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800 hover:border-primary-400"}`}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          onClick={() => setCustom(true)}
          className={`press-tight h-12 px-3 rounded-xl border-2 text-[15px] font-bold transition-colors ${custom ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800 hover:border-primary-400"}`}
        >
          Custom
        </button>
      </div>
      {custom && (
        <div className="mt-2 max-w-[160px]">
          <NumberInput
            id={id}
            value={text}
            onChange={(v) => {
              setText(v);
              const n = Number(v);
              if (v !== "" && n >= 1) onChange(Math.min(max, n));
            }}
            placeholder={String(value)}
            max={max}
            ariaLabel={`${label}, custom`}
          />
        </div>
      )}
    </div>
  );
}

const names = (s: string) =>
  s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 30);

/** Teams, overs, players, who bats. Everything else has a sensible default. */
export function Setup({ onStart }: { onStart: (m: Match) => void }) {
  const [teamA, setTeamA] = useState("Team A");
  const [teamB, setTeamB] = useState("Team B");
  const [overs, setOvers] = useState(6);
  const [players, setPlayers] = useState(8);
  const [first, setFirst] = useState<Side>("a");
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [showRules, setShowRules] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [namesA, setNamesA] = useState("");
  const [namesB, setNamesB] = useState("");
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");

  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules((r) => ({ ...r, [k]: v }));
  const a = teamA.trim() || "Team A";
  const b = teamB.trim() || "Team B";

  const start = () => {
    onStart(
      newMatch({
        teamA: a,
        teamB: b === a ? `${b} 2` : b,
        overs,
        playersPerSide: players,
        battingFirst: first,
        rules,
        players: { a: names(namesA), b: names(namesB) },
        title,
        venue,
      }),
    );
  };

  const ruleSummary = [
    rules.wideRuns === 1 ? "Wide 1 run" : `Wide ${rules.wideRuns} runs`,
    rules.noBallRuns === 1 ? "No-ball 1 run" : `No-ball ${rules.noBallRuns} runs`,
    rules.freeHit ? "free hit" : "no free hit",
    rules.lastManStands ? "last man stands" : "",
    rules.maxOversPerBowler ? `${rules.maxOversPerBowler} overs a bowler` : "",
    rules.retireAt ? `retire at ${rules.retireAt}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Team 1" htmlFor="ls-a">
          <input id="ls-a" value={teamA} onChange={(e) => setTeamA(e.target.value.slice(0, 32))} onFocus={(e) => e.currentTarget.select()} maxLength={32} autoComplete="off" className="w-full h-12 px-3.5 rounded-xl bg-primary-50 border border-primary-200 text-[16px] font-semibold text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white" />
        </Field>
        <Field label="Team 2" htmlFor="ls-b">
          <input id="ls-b" value={teamB} onChange={(e) => setTeamB(e.target.value.slice(0, 32))} onFocus={(e) => e.currentTarget.select()} maxLength={32} autoComplete="off" className="w-full h-12 px-3.5 rounded-xl bg-primary-50 border border-primary-200 text-[16px] font-semibold text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white" />
        </Field>
      </div>

      <NumberChips label="Overs a side" value={overs} onChange={setOvers} presets={OVERS} max={50} id="ls-overs" unit="overs" cols="grid-cols-3 sm:grid-cols-6" />
      <NumberChips label="Players a side" value={players} onChange={setPlayers} presets={PLAYERS} max={30} id="ls-players" unit="players" cols="grid-cols-[1fr_1fr_1fr_auto]" />

      <div>
        <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Batting first</p>
        <Segmented
          value={first}
          onChange={setFirst}
          ariaLabel="Batting first"
          options={[
            { value: "a", label: a },
            { value: "b", label: b },
          ]}
        />
      </div>

      <div className="rounded-2xl border border-primary-200">
        <button type="button" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules} className="w-full min-h-14 px-4 py-2 flex items-center justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-primary-900">House rules</span>
            <span className="block text-[12px] text-primary-500 truncate">{ruleSummary}</span>
          </span>
          <ChevronDown className={`w-5 h-5 shrink-0 text-primary-500 motion-safe:transition-transform ${showRules ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {showRules && (
          <div className="px-4 pb-4 space-y-4">
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
            <p className="text-[12px] text-primary-400">Last man stands lets the last batter carry on alone. Retire at only reminds you; you decide.</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-primary-200">
        <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="w-full min-h-14 px-4 py-2 flex items-center justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-primary-900">Player names and venue</span>
            <span className="block text-[12px] text-primary-500 truncate">Optional. Skip it and name players as they come in.</span>
          </span>
          <ChevronDown className={`w-5 h-5 shrink-0 text-primary-500 motion-safe:transition-transform ${showMore ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {showMore && (
          <div className="px-4 pb-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              {(
                [
                  ["a", a, namesA, setNamesA],
                  ["b", b, namesB, setNamesB],
                ] as const
              ).map(([side, label, val, setVal]) => (
                <Field key={side} label={`${label} players`} htmlFor={`ls-names-${side}`} hint="One per line, or commas. Batting order if you like.">
                  <textarea
                    id={`ls-names-${side}`}
                    value={val}
                    onChange={(e) => setVal(e.target.value.slice(0, 900))}
                    rows={4}
                    placeholder={side === "a" ? "Rohan, Amit, Sahil" : "Vikas, Sameer, Arjun"}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-primary-50 border border-primary-200 text-[16px] text-primary-900 placeholder:text-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white"
                  />
                </Field>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Venue" htmlFor="ls-venue">
                <TextInput id="ls-venue" value={venue} onChange={setVenue} placeholder="Turf name, area" maxLength={48} />
              </Field>
              <Field label="Tournament or series" htmlFor="ls-title">
                <TextInput id="ls-title" value={title} onChange={setTitle} placeholder="Sunday Box League" maxLength={48} />
              </Field>
            </div>
          </div>
        )}
      </div>

      <PrimaryButton onClick={start} className="w-full h-14 text-[17px]">
        <Play className="w-5 h-5" aria-hidden /> Start match
      </PrimaryButton>
      <p className="-mt-3 text-[12px] text-primary-400 text-center">Saved in this browser after every ball. No account needed.</p>
    </div>
  );
}
