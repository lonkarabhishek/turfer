"use client";

import { useState } from "react";
import { ChevronDown, Coins, Play, Shuffle } from "lucide-react";
import { DEFAULT_RULES, type Rules } from "@/lib/cricket/scoring";
import { splitTeams } from "@/lib/tools/teams";
import { FORMATS, indiaDay, planChips, setupPlan } from "@/lib/turfSession/plan";
import { readNames, sameNames, sideName, type Prefill } from "@/lib/turfSession/names";
import type { NewSession } from "@/lib/turfSession/session";
import type { Format, Side, SideKey } from "@/lib/turfSession/types";
import { Field, PrimaryButton, Segmented, TextInput } from "../inputs";
import { NumberChips, SwitchKnob } from "../scorer/Setup";
import { HouseRules, ruleSummary } from "./HouseRules";
import { SidesEditor } from "./SidesEditor";

export type GameStrip = { state: "loading" | "failed" | "ok"; line: string } | null;

/** "Ask who bats and bowls", in setup and in Change teams or overs. */
export const PICK_HINT = "Picks the next batter after each wicket and the bowler each over, so the top scorers are real. Off: no questions; they go in as Batter 1 and Bowler 1, and a tap on one in the scorer names them.";

/** Players a side chips: four and Custom on one row from 360 px; under that they wrap, so each is 44 px wide at least. */
export const PLAYER_COLS = (chips: number) => (chips > 3 ? "grid-cols-3 min-[360px]:grid-cols-[1fr_1fr_1fr_1fr_auto]" : "grid-cols-[1fr_1fr_1fr_auto]");

/** India's date now, read when Start is tapped. */
const todayInIndia = () => indiaDay(Date.now());

/** "2-hour", "90-minute", "1-hour": the slot as the hint says it. */
function slotWords(min: number): string {
  if (min % 60 === 0) return `${min / 60}-hour`;
  return `${min}-minute`;
}

/** Players kept on their side as the names change; new ones go to the smaller side, names gone come off. */
function syncSides(sides: { a: Side; b: Side }, names: string[]): { a: Side; b: Side } {
  const want = new Set(names.map((n) => n.toLowerCase()));
  const a = sides.a.players.filter((p) => want.has(p.toLowerCase()));
  const b = sides.b.players.filter((p) => want.has(p.toLowerCase()));
  const placed = new Set([...a, ...b].map((p) => p.toLowerCase()));
  for (const n of names) {
    if (placed.has(n.toLowerCase())) continue;
    (a.length <= b.length ? a : b).push(n);
    placed.add(n.toLowerCase());
  }
  return { a: { ...sides.a, players: a }, b: { ...sides.b, players: b } };
}

/**
 * S1: a new session in about three taps. Team names, overs a match and
 * Start; everything else has a default: the format (box cricket, or the
 * game's), players a side, who bats first, players' names (optional, split
 * at random), house rules, venue and the matches planned. From a game it
 * is all filled in.
 */
export function SessionSetup({ prefill, strip, sameTeams, onBlank, onStart }: { prefill: Prefill | null; strip: GameStrip; sameTeams: { a: Side; b: Side } | null; onBlank: () => void; onStart: (x: NewSession, how: "balls" | "final") => void }) {
  const [format, setFormat] = useState<Format>(prefill?.format ?? "box");
  const f = FORMATS[format];
  const [a, setA] = useState(prefill?.sides.a.name ?? "Team A");
  const [b, setB] = useState(prefill?.sides.b.name ?? "Team B");
  const [overs, setOvers] = useState(prefill?.overs ?? f.overs);
  const [players, setPlayers] = useState(prefill?.playersPerSide ?? f.players);
  const [touched, setTouched] = useState({ overs: false, players: false });
  const [first, setFirst] = useState<SideKey>("a");
  const [toss, setToss] = useState("");
  const allNames = prefill ? [...prefill.sides.a.players, ...prefill.sides.b.players] : [];
  const [text, setText] = useState(allNames.join("\n"));
  const [sides, setSides] = useState<{ a: Side; b: Side }>(prefill ? prefill.sides : { a: { name: "Team A", players: [] }, b: { name: "Team B", players: [] } });
  const [pickChoice, setPickChoice] = useState<boolean | null>(null);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [venue, setVenue] = useState(prefill?.venue ?? "");
  // Undefined until a chip is tapped: till then, from a game, the guess follows the overs and format chosen.
  const [pickedPlan, setPlan] = useState<number | null | undefined>(undefined);
  const plan = setupPlan(prefill?.slot ?? null, format, overs, pickedPlan);
  const [showPlayers, setShowPlayers] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nameA = sideName(a) || "Team A";
  const nameB = sideName(b) || "Team B";
  const named = { a: { ...sides.a, name: nameA }, b: { ...sides.b, name: nameB } };
  const autoPick = named.a.players.length >= 3 && named.b.players.length >= 3;
  const pick = pickChoice ?? autoPick;
  const count = named.a.players.length + named.b.players.length;

  const pickFormat = (x: Format) => {
    setFormat(x);
    if (!touched.overs) setOvers(FORMATS[x].overs);
    if (!touched.players) setPlayers(FORMATS[x].players);
  };

  const onText = (v: string) => {
    setText(v);
    setSides((s) => syncSides(s, readNames(v)));
  };
  const split = () => {
    const names = readNames(text);
    const [x, y] = splitTeams(
      names.map((name) => ({ name, rating: 3 })),
      2,
      "random",
    );
    setSides({ a: { ...sides.a, players: x.map((p) => p.name) }, b: { ...sides.b, players: y.map((p) => p.name) } });
  };
  const fillSame = (s: { a: Side; b: Side }) => {
    setA(s.a.name);
    setB(s.b.name);
    setSides(s);
    setText([...s.a.players, ...s.b.players].join("\n"));
    if (s.a.players.length || s.b.players.length) setShowPlayers(true);
  };
  const doToss = () => {
    const side: SideKey = Math.random() < 0.5 ? "a" : "b";
    setFirst(side);
    setToss(`Toss: ${side === "a" ? nameA : nameB} bat first`);
  };

  const go = (how: "balls" | "final") => {
    if (sameNames(nameA, nameB)) return setErr("The two teams need different names.");
    const v = venue.replace(/\s+/g, " ").trim().slice(0, 48);
    onStart(
      {
        format,
        venue: v,
        turf: prefill?.turf && v === prefill.venue ? prefill.turf : null,
        day: prefill?.day ?? todayInIndia(),
        overs,
        playersPerSide: players,
        rules,
        pick,
        sides: named,
        firstBat: first,
        plan,
        game: prefill?.game ?? null,
      },
      how,
    );
  };

  const inputCls = "w-full h-12 px-3.5 rounded-xl bg-primary-50 border border-primary-200 text-[16px] font-semibold text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white";

  return (
    <div className="space-y-5">
      {strip && (
        <div className="rounded-2xl bg-accent-50 border border-accent-500/30 px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wide text-accent-800">From your game</p>
          {strip.state === "loading" ? (
            <p role="status" className="mt-0.5 text-[15px] font-semibold text-primary-900">
              Filling in from your game…
            </p>
          ) : strip.state === "failed" ? (
            <p role="alert" className="mt-0.5 text-[15px] font-semibold text-primary-900">
              Couldn&apos;t read the game. Fill in the teams below.
            </p>
          ) : (
            <p className="mt-0.5 text-[15px] font-semibold text-primary-900">{strip.line}</p>
          )}
          <button type="button" onClick={onBlank} className="mt-1 min-h-11 -ml-1 px-1 text-[14px] font-bold text-accent-800 underline underline-offset-2">
            Start blank instead
          </button>
        </div>
      )}

      {sameTeams && !prefill && (
        <button type="button" onClick={() => fillSame(sameTeams)} className="press-tight inline-flex items-center gap-2 h-11 px-4 rounded-full border-2 border-primary-200 text-[14px] font-bold text-primary-800 hover:border-accent-500">
          Same teams again: {sameTeams.a.name} v {sameTeams.b.name}
        </button>
      )}

      <div>
        <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Format</p>
        <Segmented
          tall
          value={format}
          onChange={pickFormat}
          ariaLabel="Format"
          options={[
            { value: "box", label: FORMATS.box.label },
            { value: "cricket", label: FORMATS.cricket.label },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Team 1" htmlFor="ts-a">
          <input id="ts-a" value={a} onChange={(e) => { setErr(null); setA(e.target.value.slice(0, 30)); }} onFocus={(e) => e.currentTarget.select()} maxLength={30} autoComplete="off" className={inputCls} />
        </Field>
        <Field label="Team 2" htmlFor="ts-b">
          <input id="ts-b" value={b} onChange={(e) => { setErr(null); setB(e.target.value.slice(0, 30)); }} onFocus={(e) => e.currentTarget.select()} maxLength={30} autoComplete="off" className={inputCls} />
        </Field>
      </div>

      <NumberChips
        key={`o-${format}`}
        label="Overs a match"
        value={overs}
        onChange={(v) => {
          setOvers(v);
          setTouched((t) => ({ ...t, overs: true }));
        }}
        presets={f.oversChips}
        max={50}
        id="ts-overs"
        unit="overs"
        cols="grid-cols-3 sm:grid-cols-6"
      />
      <NumberChips
        key={`p-${format}`}
        label="Players a side"
        value={players}
        onChange={(v) => {
          setPlayers(Math.max(2, v));
          setTouched((t) => ({ ...t, players: true }));
        }}
        presets={f.playersChips}
        max={30}
        id="ts-players"
        unit="players"
        cols={PLAYER_COLS(f.playersChips.length)}
      />

      <div>
        <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Batting first in match 1</p>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Segmented
              tall
              value={first}
              onChange={(v) => {
                setFirst(v);
                setToss("");
              }}
              ariaLabel="Batting first in match 1"
              options={[
                { value: "a", label: nameA },
                { value: "b", label: nameB },
              ]}
            />
          </div>
          <button type="button" onClick={doToss} className="press-tight shrink-0 inline-flex items-center gap-1.5 h-12 px-4 rounded-xl border-2 border-primary-200 text-[14px] font-bold text-primary-800 hover:border-accent-500">
            <Coins className="w-4 h-4" aria-hidden /> Toss
          </button>
        </div>
        <p className="mt-1 min-h-5 text-[14px] font-semibold text-primary-800" aria-live="polite">
          {toss}
        </p>
      </div>

      <div className="rounded-2xl border border-primary-200">
        <button type="button" onClick={() => setShowPlayers((v) => !v)} aria-expanded={showPlayers} className="w-full min-h-14 px-4 py-2 flex items-center justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-primary-900">Players (optional)</span>
            <span className="block text-[12px] text-primary-600">{prefill && allNames.length ? `${allNames.length === 1 ? "1 player from the game is in" : `${allNames.length} players from the game are in`}. Add the rest, or skip.` : count ? `${count} named` : "Add names to see the top run scorers and wicket takers. Skip it to just tap the runs."}</span>
          </span>
          <ChevronDown className={`w-5 h-5 shrink-0 text-primary-500 motion-safe:transition-transform ${showPlayers ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {showPlayers && (
          <div className="px-4 pb-4 space-y-3">
            <Field label="Names, one per line or commas" htmlFor="ts-names">
              <textarea id="ts-names" value={text} onChange={(e) => onText(e.target.value.slice(0, 1200))} rows={4} placeholder={"Rohan, Amit, Sahil\nVikas, Sameer, Arjun"} className="w-full px-3.5 py-2.5 rounded-xl bg-primary-50 border border-primary-200 text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white" />
            </Field>
            <button type="button" onClick={split} disabled={readNames(text).length < 2} className="press-tight w-full h-12 rounded-full bg-primary-900 text-white text-[15px] font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40">
              <Shuffle className="w-4 h-4" aria-hidden /> {count && (sides.a.players.length || sides.b.players.length) ? "Shuffle again" : "Split into 2 teams"}
            </button>
            {count > 0 && <SidesEditor sides={named} onChange={setSides} />}
            {count > 0 && <p className="text-[12px] text-primary-600">Tap a name to move it to the other team.</p>}
            <button type="button" role="switch" aria-checked={pick} onClick={() => setPickChoice(!pick)} className="w-full min-h-14 py-2 flex items-center justify-between gap-3 text-left">
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-primary-900">Ask who bats and bowls</span>
                <span className="block text-[12px] text-primary-600">{PICK_HINT}</span>
              </span>
              <SwitchKnob on={pick} />
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-primary-200">
        <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="w-full min-h-14 px-4 py-2 flex items-center justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-primary-900">House rules, venue and matches</span>
            <span className="block text-[12px] text-primary-600 truncate">
              {[ruleSummary(rules), venue.trim(), plan ? `${plan} matches` : ""].filter(Boolean).join(" · ")}
            </span>
          </span>
          <ChevronDown className={`w-5 h-5 shrink-0 text-primary-500 motion-safe:transition-transform ${showMore ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {showMore && (
          <div className="px-4 pb-4 space-y-4">
            <HouseRules rules={rules} onChange={setRules} />
            <Field label="Venue" htmlFor="ts-venue">
              <TextInput id="ts-venue" value={venue} onChange={setVenue} placeholder="Turf name, area" maxLength={48} />
            </Field>
            <div>
              <p id="ts-plan-l" className="text-[13px] font-semibold text-primary-800 mb-1.5">
                Matches planned
              </p>
              <div role="radiogroup" aria-labelledby="ts-plan-l" className="grid grid-cols-3 gap-2">
                {[...planChips(plan).map((n) => ({ v: n as number | null, l: String(n) })), { v: null, l: "Not sure" }].map((o) => (
                  <button key={o.l} type="button" role="radio" aria-checked={plan === o.v} onClick={() => setPlan(o.v)} className={`press-tight h-12 px-2 rounded-xl border-2 text-[16px] font-bold tabular-nums ${plan === o.v ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800 hover:border-primary-400"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
              {prefill && pickedPlan === undefined && <p className="mt-1.5 text-[12px] text-primary-600">A guess from your {slotWords(prefill.slot)} slot at {overs} overs a match. Play as many as you like.</p>}
            </div>
          </div>
        )}
      </div>

      {err && (
        <p role="alert" className="text-[14px] font-semibold text-red-700">
          {err}
        </p>
      )}
      <PrimaryButton onClick={() => go("balls")} className="w-full h-14 text-[17px]">
        <Play className="w-5 h-5" aria-hidden /> Start match 1
      </PrimaryButton>
      <button type="button" onClick={() => go("final")} className="-mt-2 w-full min-h-12 text-[15px] font-bold text-accent-700 underline underline-offset-2">
        Just type final scores
      </button>
      <p className="-mt-3 text-[12px] text-primary-600 text-center">Saved on this phone after every ball. No sign-up needed.</p>
    </div>
  );
}
