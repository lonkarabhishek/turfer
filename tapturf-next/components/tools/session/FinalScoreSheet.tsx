"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { wicketLimit } from "@/lib/cricket/scoring";
import { formatOvers } from "@/lib/cricket/overs";
import { readScoreDraft, type ScoreDraft } from "@/lib/cricket/resultForm";
import { outcomeOf, typedText } from "@/lib/turfSession/tally";
import type { FinalInput } from "@/lib/turfSession/session";
import type { Session, SessionMatch, SideKey } from "@/lib/turfSession/types";
import { Sheet } from "../scorer/ui";
import { OversInput, Segmented } from "../inputs";

/**
 * A match's final score, typed in seconds when nobody scored it ball by
 * ball: who batted first, each side's runs in a big box and its wickets
 * with − and +, the overs a side unless changed, or no result. The check
 * and its words are the Cricket Tournament Manager's (readScoreDraft).
 */
export function FinalScoreSheet({ session, n, edit, battedFirst, onSave, onClose }: { session: Session; n: number; edit: SessionMatch | null; battedFirst: SideKey; onSave: (x: FinalInput) => void; onClose: () => void }) {
  const names = { a: session.sides.a.name, b: session.sides.b.name };
  const limit = wicketLimit({ playersPerSide: edit?.playersPerSide ?? session.playersPerSide, rules: { ...session.rules, lastManStands: edit?.lastManStands ?? session.rules.lastManStands } });
  const full = formatOvers((edit?.overs ?? session.overs) * 6).replace(/\.0$/, "");
  const r = edit?.result;
  const [first, setFirst] = useState<SideKey>(edit?.battedFirst ?? battedFirst);
  const [runs, setRuns] = useState<Record<SideKey, string>>({ a: r ? String(r.a.runs) : "", b: r ? String(r.b.runs) : "" });
  const [wkts, setWkts] = useState<Record<SideKey, number>>({ a: r?.a.wickets ?? 0, b: r?.b.wickets ?? 0 });
  const startOvers = (k: SideKey) => (r ? formatOvers(r[k].balls).replace(/\.0$/, "") : full);
  const [overs, setOvers] = useState<Record<SideKey, string>>({ a: startOvers("a"), b: startOvers("b") });
  const [showOvers, setShowOvers] = useState(!!r && (overs.a !== full || overs.b !== full));
  const [noResult, setNoResult] = useState(r?.outcome === "nr");
  const [err, setErr] = useState<string | null>(null);
  const second: SideKey = first === "a" ? "b" : "a";

  const draft = (): ScoreDraft => ({
    aRuns: runs.a,
    aWkts: String(wkts.a),
    aOvers: overs.a,
    aAllOut: wkts.a >= limit,
    bRuns: runs.b,
    bWkts: String(wkts.b),
    bOvers: overs.b,
    bAllOut: wkts.b >= limit,
    result: noResult ? "nr" : "auto",
    battedFirst: first,
  });
  const read = readScoreDraft(draft(), names);
  const preview = "ok" in read ? typedText({ a: read.ok.a, b: read.ok.b, outcome: outcomeOf(read.ok.a, read.ok.b, noResult) }, first, names, limit) : noResult ? "No result" : null;

  /** A match scored ball by ball, corrected (or given up on) with a typed score where it is. */
  const scored = edit?.kind === "balls";
  const save = () => {
    const x = readScoreDraft(draft(), names);
    if ("error" in x) return setErr(x.error);
    onSave({ n: edit ? n : null, battedFirst: first, a: x.ok.a, b: x.ok.b, noResult, ...(scored ? { replaceScored: true } : {}) });
  };

  const row = (k: SideKey) => (
    <div key={k} className="rounded-2xl bg-primary-50 border border-primary-200 p-3">
      <p className="text-[15px] font-bold text-primary-900 truncate">
        {names[k]} <span className="font-semibold text-primary-500">{k === first ? "· batted first" : "· chased"}</span>
      </p>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-end">
        <label className="block min-w-0">
          <span className="block text-[12px] font-bold uppercase tracking-wide text-primary-600 mb-1">Runs</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={runs[k]}
            onChange={(e) => {
              setErr(null);
              setRuns((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "").slice(0, 3) }));
            }}
            placeholder="0"
            aria-label={`${names[k]} runs`}
            className="w-full h-14 px-3 rounded-xl bg-white border-2 border-primary-300 text-[28px] font-extrabold tabular-nums text-primary-900 placeholder:text-primary-300 focus:outline-none focus:border-accent-500"
          />
        </label>
        <div>
          <span className="block text-[12px] font-bold uppercase tracking-wide text-primary-600 mb-1">Wickets</span>
          <div className="flex items-center gap-1" role="group" aria-label={`${names[k]} wickets`}>
            <button type="button" onClick={() => setWkts((x) => ({ ...x, [k]: Math.max(0, x[k] - 1) }))} disabled={wkts[k] <= 0} aria-label={`One wicket fewer for ${names[k]}`} className="press-tight w-12 h-14 rounded-xl border-2 border-primary-300 bg-white text-primary-900 inline-flex items-center justify-center disabled:opacity-30">
              <Minus className="w-5 h-5" aria-hidden />
            </button>
            <span className="w-10 text-center text-[26px] font-extrabold tabular-nums text-primary-900" aria-live="polite">
              {wkts[k]}
            </span>
            <button type="button" onClick={() => setWkts((x) => ({ ...x, [k]: Math.min(limit, x[k] + 1) }))} disabled={wkts[k] >= limit} aria-label={`One wicket more for ${names[k]}`} className="press-tight w-12 h-14 rounded-xl border-2 border-primary-300 bg-white text-primary-900 inline-flex items-center justify-center disabled:opacity-30">
              <Plus className="w-5 h-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>
      {wkts[k] >= limit && <p className="mt-1.5 text-[13px] font-semibold text-primary-700">All out</p>}
      {showOvers && (
        <div className="mt-2 max-w-[160px]">
          <span className="block text-[12px] font-bold uppercase tracking-wide text-primary-600 mb-1">Overs</span>
          <OversInput value={overs[k]} onChange={(v) => setOvers((x) => ({ ...x, [k]: v }))} placeholder="5.3" ariaLabel={`${names[k]} overs`} />
        </div>
      )}
    </div>
  );

  return (
    <Sheet title={scored ? `Match ${n}: correct the score` : edit ? `Match ${n}: edit score` : `Match ${n}: final score`} onClose={onClose}>
      {scored && (
        <p className="mb-3 rounded-2xl bg-amber-100 border border-amber-300 px-4 py-3 text-[14px] font-semibold leading-snug text-amber-950">
          Saving makes this a typed score, kept as match {n}. Its batting and bowling lines come off the top scorers; the ball-by-ball copy stays in the Live Cricket Scorer&apos;s saved matches.
        </p>
      )}
      <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Batted first</p>
      <Segmented
        tall
        value={first}
        onChange={(v) => setFirst(v)}
        ariaLabel="Batted first"
        options={[
          { value: "a", label: names.a },
          { value: "b", label: names.b },
        ]}
      />
      <div className="mt-3 space-y-2">{[first, second].map(row)}</div>
      {!showOvers && (
        <p className="mt-2 text-[14px] text-primary-700">
          Overs: {full} a side ·{" "}
          <button type="button" onClick={() => setShowOvers(true)} className="min-h-11 px-1 font-bold text-accent-700 underline underline-offset-2">
            Change
          </button>
        </p>
      )}
      <label className="mt-2 min-h-12 flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={noResult} onChange={(e) => setNoResult(e.target.checked)} className="w-5 h-5 shrink-0 accent-accent-600" />
        <span className="text-[15px] font-semibold text-primary-900">No result</span>
      </label>
      <p role="status" className="mt-1 min-h-7 text-[17px] font-bold text-primary-900">
        {preview ?? ""}
      </p>
      {err && (
        <p role="alert" className="mt-1 text-[14px] font-semibold text-red-700">
          {err}
        </p>
      )}
      <button type="button" onClick={save} className="press-tight mt-3 w-full h-14 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
        Save match {n}
      </button>
    </Sheet>
  );
}
