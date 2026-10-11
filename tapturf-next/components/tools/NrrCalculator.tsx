"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { parseOvers, formatRate, formatNrr } from "@/lib/cricket/overs";
import { calcNrr } from "@/lib/cricket/nrr";
import { trackTool } from "@/lib/analytics/tools";
import { ToolCta } from "./ToolCta";
import { Field, NumberInput, OversInput } from "./inputs";

const TOOL = "nrr_calculator";

/** Runs and overs for both sides in, run rates and NRR out. */
export function NrrCalculator({ cta }: { cta: { label: string; href: string } }) {
  const [runsFor, setRunsFor] = useState("");
  const [oversFor, setOversFor] = useState("");
  const [runsAgainst, setRunsAgainst] = useState("");
  const [oversAgainst, setOversAgainst] = useState("");
  const used = useRef(false);
  const reported = useRef(false);

  useEffect(() => {
    trackTool("tool_opened", TOOL);
  }, []);

  const touch = () => {
    if (!used.current) {
      used.current = true;
      trackTool("tool_used", TOOL);
    }
  };

  const pf = parseOvers(oversFor);
  const pa = parseOvers(oversAgainst);
  const rf = runsFor === "" ? null : Number(runsFor);
  const ra = runsAgainst === "" ? null : Number(runsAgainst);
  const runsOk = (v: number | null) => v != null && Number.isInteger(v) && v >= 0 && v <= 2000;

  const result = useMemo(() => {
    if (!pf.ok || !pa.ok || !runsOk(rf) || !runsOk(ra)) return null;
    return calcNrr(rf!, pf.balls, ra!, pa.balls);
  }, [pf, pa, rf, ra]);

  useEffect(() => {
    if (result && result.nrr != null && !reported.current) {
      reported.current = true;
      trackTool("tool_result_generated", TOOL);
    }
  }, [result]);

  const oversError = (v: string, p: ReturnType<typeof parseOvers>) => (v !== "" && !p.ok ? p.error : null);

  return (
    <div className="rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      <div className="grid sm:grid-cols-2 gap-5">
        <fieldset className="space-y-3">
          <legend className="text-[12px] font-bold uppercase tracking-wide text-accent-700 mb-1">Your team</legend>
          <Field label="Runs scored" htmlFor="nrr-runs-for">
            <NumberInput id="nrr-runs-for" value={runsFor} onChange={(v) => (touch(), setRunsFor(v))} placeholder="63" />
          </Field>
          <Field label="Overs faced" htmlFor="nrr-overs-for" hint="Like 6 or 5.3" error={oversError(oversFor, pf)}>
            <OversInput id="nrr-overs-for" value={oversFor} onChange={(v) => (touch(), setOversFor(v))} placeholder="6" invalid={!!oversError(oversFor, pf)} />
          </Field>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-[12px] font-bold uppercase tracking-wide text-primary-500 mb-1">Opponent</legend>
          <Field label="Runs scored" htmlFor="nrr-runs-against">
            <NumberInput id="nrr-runs-against" value={runsAgainst} onChange={(v) => (touch(), setRunsAgainst(v))} placeholder="54" />
          </Field>
          <Field label="Overs faced" htmlFor="nrr-overs-against" hint="The overs you bowled" error={oversError(oversAgainst, pa)}>
            <OversInput id="nrr-overs-against" value={oversAgainst} onChange={(v) => (touch(), setOversAgainst(v))} placeholder="6" invalid={!!oversError(oversAgainst, pa)} />
          </Field>
        </fieldset>
      </div>

      <div className="mt-5 rounded-2xl bg-primary-900 text-white p-4 sm:p-5" aria-live="polite">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-primary-300">Run rate</p>
            <p className="font-display text-2xl sm:text-3xl tabular mt-1">{result ? formatRate(result.rrFor) : "0.00"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-primary-300">Opponent</p>
            <p className="font-display text-2xl sm:text-3xl tabular mt-1">{result ? formatRate(result.rrAgainst) : "0.00"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-accent-300">Net run rate</p>
            <p className={`font-display text-2xl sm:text-3xl tabular mt-1 ${result?.nrr != null && result.nrr < 0 ? "text-red-300" : "text-accent-300"}`}>{result ? formatNrr(result.nrr) : "0.000"}</p>
          </div>
        </div>
        <p className="mt-3 text-[12px] text-primary-300 text-center">
          {result
            ? `${runsFor} off ${oversFor} overs against ${runsAgainst} off ${oversAgainst}.`
            : "Fill in all four boxes. Overs use cricket notation: 5.3 is five overs and three balls."}
        </p>
      </div>

      <ToolCta tool={TOOL} label={cta.label} href={cta.href} />
    </div>
  );
}
