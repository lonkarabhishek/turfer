"use client";

import { useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import { SPORT_ENGINES, SPORT_LIST, newBoard } from "@/lib/board";
import type { AnyRules, Board, BoardSport, Side } from "@/lib/board/types";
import { Field, PrimaryButton, Segmented, TextInput } from "../inputs";
import { RulesEditor } from "./Rules";
import type { BoardPrefs } from "./storage";

/** What Setup asks of the live link. keep: give the previous match's link to this one. */
export type SetupLive = { on: boolean; keep: boolean };

/** Sports that serve: the first server can be picked now or before the first point. */
const SERVE_SPORTS: readonly BoardSport[] = ["volleyball", "badminton", "pickleball", "tennis", "table-tennis", "padel"];
/** Racquet games name players when it is singles. */
const PLAYER_SPORTS: readonly BoardSport[] = ["badminton", "pickleball", "tennis", "table-tennis", "padel"];

/** A name that fits half a phone's segmented control. */
const short = (name: string) => (name.length > 13 ? `${name.slice(0, 12).trim()}…` : name);

const singles = (sport: BoardSport, rules: AnyRules) => PLAYER_SPORTS.includes(sport) && (rules as { doubles?: boolean }).doubles === false;

/** On/off switch drawn as a track and knob; the row around it is the tap target. */
function SwitchKnob({ on }: { on: boolean }) {
  return (
    <span className={`relative w-[51px] h-[31px] rounded-full shrink-0 transition-colors ${on ? "bg-accent-500" : "bg-primary-300"}`} aria-hidden>
      <span className={`absolute top-[2px] left-[2px] w-[27px] h-[27px] bg-white rounded-full shadow-sm motion-safe:transition-transform motion-safe:duration-200 ${on ? "translate-x-[20px]" : ""}`} />
    </span>
  );
}

function SwitchRow({ on, onToggle, title, detail }: { on: boolean; onToggle: () => void; title: string; detail: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="w-full min-h-14 px-4 py-2 flex items-center justify-between gap-3 text-left">
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold text-primary-900">{title}</span>
        <span className="block text-[12px] text-primary-500">{detail}</span>
      </span>
      <SwitchKnob on={on} />
    </button>
  );
}

const nameInput = "w-full h-12 px-3.5 rounded-xl bg-primary-50 border border-primary-200 text-[16px] font-semibold text-primary-900 placeholder:text-primary-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white";

/**
 * The sport, the names, the format as the engine's preset chips, who
 * serves first, and the live link. Everything else has a sensible
 * default. initial comes from a game reminder (?sport, &name, &venue) or
 * the last board's sport. live is left out when the site has no live
 * links; keepFrom names the previous match when its link can move here.
 */
export function Setup({
  onStart,
  initial,
  live,
}: {
  onStart: (b: Board, live: SetupLive, prefs: BoardPrefs) => void;
  initial: { sport: BoardSport; name: string; venue: string };
  live?: { on: boolean; keepFrom: string | null; loginFirst?: boolean };
}) {
  const [sport, setSport] = useState<BoardSport>(initial.sport);
  // Each sport keeps its own picks while they look around.
  const [picked, setPicked] = useState<Partial<Record<BoardSport, AnyRules>>>({});
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [otherName, setOtherName] = useState(initial.name);
  const [first, setFirst] = useState<"later" | Side>("later");
  const [names, setNames] = useState(false);
  const [showMore, setShowMore] = useState(!!initial.venue);
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState(initial.venue);
  // Until they choose, follow the page: on from a game reminder, or when the last match's link is going.
  const [liveChoice, setLiveChoice] = useState<boolean | null>(null);
  const liveOn = !!live && (liveChoice ?? (live.on || !!live.keepFrom));
  const [keep, setKeep] = useState(true);

  const engine = SPORT_ENGINES[sport];
  const rules = (picked[sport] ?? engine.normalizeRules({})) as AnyRules;
  const solo = singles(sport, rules);
  const placeholders: [string, string] = solo ? ["Player A", "Player B"] : ["Team A", "Team B"];
  const a = teamA.trim() || placeholders[0];
  const b = teamB.trim() || placeholders[1];
  const serves = SERVE_SPORTS.includes(sport);

  const start = () => {
    const ruleInput = sport === "other" ? { ...rules, name: otherName } : rules;
    const board = newBoard(sport, {
      teamA: a,
      teamB: b.toLowerCase() === a.toLowerCase() ? `${b} 2` : b,
      title,
      venue,
      rules: ruleInput,
      ...(serves && first !== "later" ? { firstServe: first } : {}),
    });
    onStart(board, { on: !!live && liveOn, keep: !!live?.keepFrom && liveOn && keep }, { swap: false, names: sport === "basketball" && names });
  };

  return (
    <div className="space-y-5">
      <div>
        <p id="sb-sport-l" className="text-[13px] font-semibold text-primary-800 mb-1.5">
          Sport
        </p>
        <div role="radiogroup" aria-labelledby="sb-sport-l" className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {SPORT_LIST.map((x) => {
            const on = x.sport === sport;
            return (
              <button
                key={x.sport}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setSport(x.sport)}
                className={`press-tight min-h-16 px-1 py-2 rounded-xl border-2 flex flex-col items-center justify-center gap-1 text-center transition-colors ${on ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800 hover:border-primary-400"}`}
              >
                <span className="text-[22px] leading-none" aria-hidden>
                  {x.icon}
                </span>
                <span className="text-[13px] font-bold leading-tight">{x.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {sport === "other" && (
        <Field label="Which sport?" htmlFor="sb-other" hint="Shown on the score and the live link. Optional.">
          <TextInput id="sb-other" value={otherName} onChange={setOtherName} placeholder="Kabaddi, frisbee, carrom" maxLength={32} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label={solo ? "Player 1" : "Team 1"} htmlFor="sb-a">
          <input id="sb-a" value={teamA} onChange={(e) => setTeamA(e.target.value.slice(0, 32))} placeholder={placeholders[0]} maxLength={32} autoComplete="off" autoCapitalize="words" className={nameInput} />
        </Field>
        <Field label={solo ? "Player 2" : "Team 2"} htmlFor="sb-b">
          <input id="sb-b" value={teamB} onChange={(e) => setTeamB(e.target.value.slice(0, 32))} placeholder={placeholders[1]} maxLength={32} autoComplete="off" autoCapitalize="words" className={nameInput} />
        </Field>
      </div>

      <RulesEditor key={sport} sport={sport} rules={rules} onChange={(r) => setPicked((x) => ({ ...x, [sport]: r }))} idPrefix={`sb-${sport}`} />

      {serves && (
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Serves first</p>
          <Segmented
            value={first}
            onChange={setFirst}
            ariaLabel="Serves first"
            options={[
              { value: "later", label: "Toss later" },
              { value: "a", label: short(a) },
              { value: "b", label: short(b) },
            ]}
          />
        </div>
      )}

      {sport === "basketball" && (
        <div className="rounded-2xl border border-primary-200">
          <SwitchRow on={names} onToggle={() => setNames((v) => !v)} title="Track player points" detail={names ? "After a basket or foul, tap Add player to name who it was." : "Off: one tap a basket. Turn on to name scorers."} />
        </div>
      )}

      <div className="rounded-2xl border border-primary-200">
        <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="w-full min-h-14 px-4 py-2 flex items-center justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-primary-900">Venue and title</span>
            <span className="block text-[12px] text-primary-500 truncate">{venue.trim() ? `Venue: ${venue.trim()}` : "Optional. Shown on the score and the live link."}</span>
          </span>
          <ChevronDown className={`w-5 h-5 shrink-0 text-primary-500 motion-safe:transition-transform ${showMore ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {showMore && (
          <div className="px-4 pb-4 grid sm:grid-cols-2 gap-3">
            <Field label="Venue" htmlFor="sb-venue">
              <TextInput id="sb-venue" value={venue} onChange={setVenue} placeholder="Turf or court name, area" maxLength={48} />
            </Field>
            <Field label="Tournament or series" htmlFor="sb-title">
              <TextInput id="sb-title" value={title} onChange={setTitle} placeholder="Sunday League" maxLength={48} />
            </Field>
          </div>
        )}
      </div>

      {live && (
        <div className="rounded-2xl border border-primary-200">
          <SwitchRow on={liveOn} onToggle={() => setLiveChoice(!liveOn)} title="Live link: let others follow the score" detail="One link for the group. No app needed." />
          {liveOn && (
            <div className="px-4 pb-2">
              {live.keepFrom && (
                <label className="min-h-12 py-2 flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="w-5 h-5 shrink-0 accent-accent-600" />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-primary-900">Keep the same live link</span>
                    <span className="block text-[12px] text-primary-500">{keep ? `Friends following ${live.keepFrom} move to this match.` : "This match gets a new link."}</span>
                  </span>
                </label>
              )}
              {live.loginFirst && !(live.keepFrom && keep) && (
                <p className="py-1 text-[13px] leading-snug text-primary-700">You log in when the match starts, with Google or your phone. Friends see the score and log in to follow it live.</p>
              )}
              <p className="flex items-center gap-1 text-[12px] leading-snug text-primary-500">
                <span className="min-w-0">Team and player names, any TapTurf usernames you tag, and the score are uploaded for this link.</span>
                <a href="/privacy#live-links" target="_blank" rel="noopener" className="shrink-0 min-h-12 px-2 inline-flex items-center font-semibold text-accent-700 underline underline-offset-2">
                  Privacy
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      <PrimaryButton onClick={start} className="w-full h-14 text-[17px]">
        <Play className="w-5 h-5" aria-hidden /> {sport === "other" ? "Start match" : `Start ${engine.label.toLowerCase()} match`}
      </PrimaryButton>
      <p className="-mt-3 text-[12px] text-primary-400 text-center">Saved in this browser after every point. No account needed.</p>
    </div>
  );
}
