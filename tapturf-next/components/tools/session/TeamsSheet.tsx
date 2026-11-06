"use client";

import { useState } from "react";
import { ChevronDown, Shuffle } from "lucide-react";
import type { Rules } from "@/lib/cricket/scoring";
import { splitTeams } from "@/lib/tools/teams";
import { FORMATS } from "@/lib/turfSession/plan";
import { sameNames, sideName } from "@/lib/turfSession/names";
import type { Changes } from "@/lib/turfSession/session";
import type { Session, Side } from "@/lib/turfSession/types";
import { Sheet } from "../scorer/ui";
import { NumberChips, SwitchKnob } from "../scorer/Setup";
import { HouseRules, ruleSummary } from "./HouseRules";
import { SidesEditor } from "./SidesEditor";

/**
 * "Change teams or overs": the side names, who plays for whom (a tap moves
 * a player; add or take one out; or shuffle again), overs, players a side,
 * quick mode and the house rules. From the next match on, or this one when
 * it has no ball yet.
 */
export function TeamsSheet({ session, emptyNow, n, onSave, onClose }: { session: Session; emptyNow: boolean; n: number; onSave: (ch: Changes) => void; onClose: () => void }) {
  const f = FORMATS[session.format];
  const [a, setA] = useState(session.sides.a.name);
  const [b, setB] = useState(session.sides.b.name);
  const [sides, setSides] = useState<{ a: Side; b: Side }>(session.sides);
  const [overs, setOvers] = useState(session.overs);
  const [players, setPlayers] = useState(session.playersPerSide);
  const [pick, setPick] = useState(session.pick);
  const [rules, setRules] = useState<Rules>(session.rules);
  const [showRules, setShowRules] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const named = { a: { ...sides.a, name: sideName(a) || "Team A" }, b: { ...sides.b, name: sideName(b) || "Team B" } };

  const shuffle = () => {
    const everyone = [...sides.a.players, ...sides.b.players].map((name) => ({ name, rating: 3 }));
    const [x, y] = splitTeams(everyone, 2, "random");
    setSides({ a: { ...sides.a, players: x.map((p) => p.name) }, b: { ...sides.b, players: y.map((p) => p.name) } });
  };

  const save = () => {
    if (sameNames(named.a.name, named.b.name)) return setErr("The two teams need different names.");
    onSave({ sides: named, overs, playersPerSide: players, pick, rules });
  };

  return (
    <Sheet title="Change teams or overs" subtitle={emptyNow ? `Match ${n} hasn't started, so it starts with these.` : "Changes start from the next match."} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">
          <span className="block text-[13px] font-semibold text-primary-800 mb-1.5">Team 1</span>
          <input value={a} onChange={(e) => { setErr(null); setA(e.target.value.slice(0, 30)); }} onFocus={(e) => e.currentTarget.select()} maxLength={30} autoComplete="off" aria-label="Team 1 name" className="w-full h-12 px-3 rounded-xl bg-primary-50 border-2 border-primary-200 text-[16px] font-semibold text-primary-900 focus:outline-none focus:border-accent-500" />
        </label>
        <label className="block min-w-0">
          <span className="block text-[13px] font-semibold text-primary-800 mb-1.5">Team 2</span>
          <input value={b} onChange={(e) => { setErr(null); setB(e.target.value.slice(0, 30)); }} onFocus={(e) => e.currentTarget.select()} maxLength={30} autoComplete="off" aria-label="Team 2 name" className="w-full h-12 px-3 rounded-xl bg-primary-50 border-2 border-primary-200 text-[16px] font-semibold text-primary-900 focus:outline-none focus:border-accent-500" />
        </label>
      </div>
      <div className="mt-3">
        <SidesEditor sides={named} onChange={(s) => setSides(s)} add remove />
        <button type="button" onClick={shuffle} disabled={sides.a.players.length + sides.b.players.length < 2} className="press-tight mt-2 w-full h-12 rounded-full border-2 border-primary-200 text-[15px] font-bold text-primary-800 inline-flex items-center justify-center gap-2 disabled:opacity-40">
          <Shuffle className="w-4 h-4" aria-hidden /> Shuffle teams
        </button>
      </div>
      <div className="mt-4 space-y-4">
        <NumberChips label="Overs a match" value={overs} onChange={setOvers} presets={f.oversChips} max={50} id="ts-overs" unit="overs" cols="grid-cols-3 sm:grid-cols-6" />
        <NumberChips label="Players a side" value={players} onChange={(v) => setPlayers(Math.max(2, v))} presets={f.playersChips} max={30} id="ts-players" unit="players" cols={f.playersChips.length > 3 ? "grid-cols-[1fr_1fr_1fr_1fr_auto]" : "grid-cols-[1fr_1fr_1fr_auto]"} />
      </div>
      <button type="button" role="switch" aria-checked={pick} onClick={() => setPick(!pick)} className="mt-4 w-full min-h-14 py-2 flex items-center justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-primary-900">Ask who bats and bowls</span>
          <span className="block text-[12px] text-primary-600">Picks the next batter after each wicket and the bowler each over. Off: batters come in the order listed and bowlers take turns.</span>
        </span>
        <SwitchKnob on={pick} />
      </button>
      <div className="mt-2 rounded-2xl border border-primary-200">
        <button type="button" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules} className="w-full min-h-14 px-4 py-2 flex items-center justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-primary-900">House rules</span>
            <span className="block text-[12px] text-primary-600 truncate">{ruleSummary(rules)}</span>
          </span>
          <ChevronDown className={`w-5 h-5 shrink-0 text-primary-500 motion-safe:transition-transform ${showRules ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {showRules && (
          <div className="px-4 pb-4">
            <HouseRules rules={rules} onChange={setRules} />
          </div>
        )}
      </div>
      {err && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-red-700">
          {err}
        </p>
      )}
      <button type="button" onClick={save} className="press-tight mt-4 w-full h-14 rounded-full bg-primary-900 text-white text-[17px] font-bold">
        Save
      </button>
    </Sheet>
  );
}
