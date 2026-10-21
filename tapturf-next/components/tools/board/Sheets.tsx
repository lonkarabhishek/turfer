"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { checkBoard, clockMs } from "@/lib/board";
import type { AnyRules, Board, BoardEvent, BoardView, Side } from "@/lib/board/types";
import { NameInput, Pick, Sheet, SheetLabel } from "../scorer/ui";
import { RulesEditor } from "./Rules";
import { END_REASONS, clockParts, endEvent, endPreview, reasonAllowed, rulesDiff, setTimeMs, type EndReason } from "./logic";

/** Commit one or more events as one tap (same `at`). False when refused; the screen shows why. */
type Commit = (events: BoardEvent[]) => boolean;

const BIG = "press-tight mt-5 w-full h-14 rounded-full text-white text-[17px] font-bold";

/* ------------------------------------------------------------------ */
/* More                                                                */
/* ------------------------------------------------------------------ */

export type MoreAction = "names" | "rules" | "share" | "swap" | "server" | "number" | "players" | "details" | "end" | "matches";

export function MoreSheet({
  view,
  extras,
  onAction,
  onClose,
}: {
  view: BoardView;
  /** What this sport and board offer beyond the usual: the serve fixes, Swap sides, the basketball names switch, Details on phones. */
  extras: { server?: string; number?: string; swap?: boolean; swapped?: boolean; players?: boolean; details?: boolean };
  onAction: (a: MoreAction) => void;
  onClose: () => void;
}) {
  const live = view.status === "live";
  return (
    <Sheet title="More" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Pick onClick={() => onAction("names")} label="Team names" detail="Fix a name or spelling" />
        <Pick onClick={() => onAction("rules")} label="Change rules" detail="From the next point on" disabled={!live} />
        {extras.swap && <Pick onClick={() => onAction("swap")} label="Swap sides" detail={extras.swapped ? "Back to the start" : "When the players change ends"} />}
        {extras.server && <Pick onClick={() => onAction("server")} label="Change server" detail={extras.server} disabled={!live} />}
        {extras.number && <Pick onClick={() => onAction("number")} label="Fix server number" detail={extras.number} disabled={!live} />}
        {extras.players !== undefined && <Pick onClick={() => onAction("players")} label={extras.players ? "Stop asking names" : "Track player points"} detail={extras.players ? "One tap a basket" : "Add who scored after a tap"} />}
        {extras.details && <Pick onClick={() => onAction("details")} label="Timeline and stats" detail="Every point, sets, stats" />}
        <Pick onClick={() => onAction("share")} label={live ? "Share live score" : "Share result"} detail="WhatsApp ready text" />
        <Pick onClick={() => onAction("matches")} label="All matches" detail="Start or open another" />
      </div>
      <button type="button" onClick={() => onAction("end")} disabled={!live} className="press-tight mt-4 w-full min-h-14 rounded-2xl border-2 border-red-200 bg-red-50 px-3 py-2 text-left disabled:opacity-40">
        <span className="block text-[16px] font-bold text-red-700">End match</span>
        <span className="block text-[12px] text-red-700/80">Time up, retired, walkover, conceded or abandoned</span>
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Names                                                               */
/* ------------------------------------------------------------------ */

export function NamesSheet({ view, onCommit, onClose }: { view: BoardView; onCommit: Commit; onClose: () => void }) {
  const [a, setA] = useState(view.teams.a.name);
  const [b, setB] = useState(view.teams.b.name);
  const [err, setErr] = useState<string | null>(null);
  const save = () => {
    const clean = (x: string) => x.replace(/\s+/g, " ").trim().slice(0, 32);
    const next: Record<Side, string> = { a: clean(a), b: clean(b) };
    if (!next.a || !next.b) return setErr("Give both a name.");
    if (next.a.toLowerCase() === next.b.toLowerCase()) return setErr("Use two different names.");
    const events: BoardEvent[] = (["a", "b"] as const).filter((s) => next[s] !== view.teams[s].name).map((s) => ({ type: "rename", side: s, name: next[s] }));
    if (!events.length) return onClose();
    if (!onCommit(events)) setErr("Could not rename. Try a shorter name.");
  };
  return (
    <Sheet title="Team names" subtitle="Changes the name everywhere, the live link too." onClose={onClose}>
      {(["a", "b"] as const).map((s) => (
        <div key={s} className="mt-1">
          <SheetLabel>{s === "a" ? "Team 1" : "Team 2"}</SheetLabel>
          <NameInput id={`bd-name-${s}`} value={s === "a" ? a : b} onChange={s === "a" ? setA : setB} label={s === "a" ? "Team 1 name" : "Team 2 name"} onEnter={save} />
        </div>
      ))}
      {err && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-red-600">
          {err}
        </p>
      )}
      <button type="button" onClick={save} className={`${BIG} bg-primary-900`}>
        Save
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/** Change the rules from here on: a rules event, so games already played stay as they were played. */
export function RulesSheet({ board, view, onCommit, onClose }: { board: Board; view: BoardView; onCommit: Commit; onClose: () => void }) {
  const current = view.setup.rules;
  const [rules, setRules] = useState<AnyRules>(current);
  const [err, setErr] = useState<string | null>(null);
  const diff = rulesDiff(current, rules);
  const changed = Object.keys(diff).length > 0;
  const save = () => {
    if (!changed) return onClose();
    const e: BoardEvent = { type: "rules", rules: diff };
    const why = checkBoard(board, e);
    if (why) return setErr(why);
    if (!onCommit([e])) setErr("Could not change the rules now.");
  };
  return (
    <Sheet title="Change rules" subtitle="From the next point on. What is played stays as played." onClose={onClose} wide>
      <RulesEditor
        sport={board.sport}
        rules={rules}
        onChange={(r) => {
          setErr(null);
          setRules(r);
        }}
        idPrefix="bd-rules"
      />
      {err && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-red-600">
          {err}
        </p>
      )}
      <button type="button" onClick={save} className={`${BIG} bg-primary-900`}>
        {changed ? "Save rules" : "Close"}
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* End match                                                           */
/* ------------------------------------------------------------------ */

/** How the match ends, who stopped when one side did, and what the result will say before it is committed. */
export function EndSheet({ board, view, now, onCommit, onClose }: { board: Board; view: BoardView; now: number; onCommit: Commit; onClose: () => void }) {
  const choices = END_REASONS.filter((r) => reasonAllowed(board, r.reason, now));
  const [reason, setReason] = useState<EndReason>(choices[0]?.reason ?? "abandoned");
  const [side, setSide] = useState<Side | null>(null);
  const needsSide = reason === "retired" || reason === "conceded" || reason === "walkover";
  const e = endEvent(reason, needsSide ? side : null);
  const preview = e ? endPreview(board, e, now) : null;
  const who = reason === "walkover" ? "Who did not turn up?" : reason === "retired" ? "Who retired?" : "Who conceded?";
  return (
    <Sheet title="End match" subtitle="Undo brings the match back." onClose={onClose}>
      <SheetLabel>How it ended</SheetLabel>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((r) => (
          <Pick
            key={r.reason}
            onClick={() => {
              setReason(r.reason);
              setSide(null);
            }}
            selected={reason === r.reason}
            label={r.label}
            detail={r.detail}
            className={r.reason === "abandoned" && choices.length % 2 === 1 ? "col-span-2" : ""}
          />
        ))}
      </div>
      {needsSide && (
        <>
          <SheetLabel>{who}</SheetLabel>
          <div className="grid grid-cols-2 gap-2">
            {(["a", "b"] as const).map((s) => (
              <Pick key={s} onClick={() => setSide(s)} selected={side === s} label={view.teams[s].name} />
            ))}
          </div>
        </>
      )}
      {preview && (
        <p role={"error" in preview ? "alert" : "status"} className={`mt-4 rounded-2xl px-3 py-2.5 text-[15px] font-semibold ${"error" in preview ? "bg-red-50 text-red-700" : "bg-primary-50 text-primary-900"}`}>
          {"error" in preview ? preview.error : preview.result}
        </p>
      )}
      <button type="button" disabled={!preview || "error" in preview} onClick={() => e && onCommit([e])} className={`${BIG} ${reason === "abandoned" ? "bg-red-600 hover:bg-red-700" : "bg-primary-900"} disabled:opacity-40`}>
        <Check className="inline w-5 h-5 mr-1 -mt-0.5" aria-hidden /> End match
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Set time                                                            */
/* ------------------------------------------------------------------ */

/** Set the clock to what the referee or the scoreboard says. Keeps it running or stopped as it is. */
export function SetTimeSheet({ view, now, onCommit, onClose }: { view: BoardView; now: number; onCommit: Commit; onClose: () => void }) {
  const start = clockParts(view, clockMs(view, now) ?? 0);
  const [min, setMin] = useState(String(start.minutes));
  const [sec, setSec] = useState(String(start.seconds).padStart(2, "0"));
  const [err, setErr] = useState<string | null>(null);
  const down = !!view.clock?.down;
  const save = () => {
    const r = setTimeMs(view, Number(min || 0), Number(sec || 0));
    if ("error" in r) return setErr(r.error);
    if (!onCommit([{ type: "clock", run: !!view.clock?.running, at: 0, ms: r.ms }])) setErr("Could not set the clock now.");
  };
  const box = "w-full h-16 px-3 rounded-2xl bg-primary-50 border-2 border-primary-200 text-center text-[32px] font-bold tabular-nums text-primary-900 focus:outline-none focus:border-accent-500 focus:bg-white";
  return (
    <Sheet title="Set time" subtitle={down ? `Time left in ${view.period?.label ?? "this period"}.` : "The match clock, as the referee has it."} onClose={onClose}>
      <div className="flex items-end gap-2 max-w-[280px] mx-auto">
        <label className="flex-1">
          <span className="block text-[12px] font-bold uppercase tracking-wide text-primary-500 mb-1 text-center">Minutes</span>
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, "").slice(0, 3))} onFocus={(e) => e.currentTarget.select()} className={box} />
        </label>
        <span className="pb-3 text-[32px] font-bold text-primary-400" aria-hidden>
          :
        </span>
        <label className="flex-1">
          <span className="block text-[12px] font-bold uppercase tracking-wide text-primary-500 mb-1 text-center">Seconds</span>
          <input type="text" inputMode="numeric" pattern="[0-9]*" value={sec} onChange={(e) => setSec(e.target.value.replace(/\D/g, "").slice(0, 2))} onFocus={(e) => e.currentTarget.select()} className={box} />
        </label>
      </div>
      {err && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-red-600 text-center">
          {err}
        </p>
      )}
      <button type="button" onClick={save} className={`${BIG} bg-primary-900`}>
        Set clock
      </button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Player name                                                         */
/* ------------------------------------------------------------------ */

/** Who scored (or got the card) for the tap that already went in. Chips of names typed before for the team. */
export function PlayerSheet({ title, team, known, onSave, onClose }: { title: string; team: string; known: string[]; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const clean = name.replace(/\s+/g, " ").trim();
  return (
    <Sheet title={title} subtitle={team} onClose={onClose}>
      {known.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {known.map((n) => (
            <button key={n} type="button" onClick={() => onSave(n)} className="press-tight h-12 px-4 rounded-full border-2 border-primary-200 bg-white text-[15px] font-semibold text-primary-800 hover:border-primary-400">
              {n}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <NameInput id="bd-player" value={name} onChange={setName} placeholder={known.length ? "Or type a name" : "Type a name"} label="Player name" onEnter={() => clean && onSave(clean)} />
        <button type="button" onClick={() => clean && onSave(clean)} disabled={!clean} className="press-tight h-12 px-5 shrink-0 rounded-xl bg-primary-900 text-white text-[15px] font-bold disabled:opacity-40">
          Save
        </button>
      </div>
      <p className="mt-2 text-[12px] text-primary-500">The score already counts. This only adds the name.</p>
    </Sheet>
  );
}
