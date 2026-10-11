"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { parseOvers, formatOvers, formatNrr } from "@/lib/cricket/overs";
import { computeStandings, decideResult, describeResult, seriesStatus, DEFAULT_POINTS, type MatchInput, type PointsConfig, type ResultChoice } from "@/lib/cricket/nrr";
import { trackTool } from "@/lib/analytics/tools";
import { ToolCta } from "./ToolCta";
import { Field, NumberInput, OversInput, PrimaryButton, SecondaryButton, Segmented, TextInput } from "./inputs";

const TOOL = "tournament_scorer";
const STORE = "tapturf_tournament_v1";

type Format = "bilateral" | "tri" | "roundrobin";
type Tournament = {
  v: 1;
  format: Format;
  name: string;
  teams: string[];
  points: PointsConfig;
  matches: (MatchInput & { battedFirst: "a" | "b"; at: number })[];
  startedAt: number;
};

const FORMATS: { value: Format; label: string; teams: number; blurb: string }[] = [
  { value: "bilateral", label: "Bilateral series", teams: 2, blurb: "Two teams, best of a few matches." },
  { value: "tri", label: "Tri-series", teams: 3, blurb: "Three teams, points table with NRR." },
  { value: "roundrobin", label: "Round robin", teams: 4, blurb: "Up to ten teams, everyone plays everyone." },
];

type Draft = {
  teamA: string;
  teamB: string;
  aRuns: string;
  aWkts: string;
  aOvers: string;
  aAllOut: boolean;
  bRuns: string;
  bWkts: string;
  bOvers: string;
  bAllOut: boolean;
  result: ResultChoice;
  battedFirst: "a" | "b";
};
const emptyDraft = (teams: string[]): Draft => ({ teamA: teams[0] ?? "", teamB: teams[1] ?? "", aRuns: "", aWkts: "", aOvers: "", aAllOut: false, bRuns: "", bWkts: "", bOvers: "", bAllOut: false, result: "auto", battedFirst: "a" });

function load(): Tournament | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const t = JSON.parse(raw) as Tournament;
    return t && t.v === 1 && Array.isArray(t.teams) && Array.isArray(t.matches) ? t : null;
  } catch {
    return null;
  }
}
function save(t: Tournament | null) {
  try {
    if (t) localStorage.setItem(STORE, JSON.stringify(t));
    else localStorage.removeItem(STORE);
  } catch {
    /* storage blocked: the session still works, it just will not persist */
  }
}

export function TournamentScorer({ cta }: { cta: { label: string; href: string } }) {
  const [t, setT] = useState<Tournament | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const used = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackTool("tool_opened", TOOL);
    // Restore after mount so server and client markup match first.
    const timer = setTimeout(() => {
      const saved = load();
      if (saved) {
        setT(saved);
        setRestored(true);
      }
      setHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (hydrated) save(t);
  }, [t, hydrated]);

  const update = (next: Tournament | null) => {
    if (!used.current) {
      used.current = true;
      trackTool("tool_used", TOOL);
    }
    setT(next);
  };

  const standings = useMemo(() => (t ? computeStandings(t.teams, t.matches, t.points) : []), [t]);
  const series = useMemo(() => (t && t.format === "bilateral" ? seriesStatus(t.teams[0], t.teams[1], t.matches) : null), [t]);

  if (!hydrated) {
    return <div className="rounded-3xl border border-primary-200 bg-white p-6 shadow-soft min-h-[200px]" aria-busy="true" />;
  }

  if (!t) return <Setup onStart={(nt) => update(nt)} />;

  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft(t.teams));
    setFormError(null);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const openEdit = (m: Tournament["matches"][number]) => {
    setEditing(m.id);
    setDraft({
      teamA: m.teamA,
      teamB: m.teamB,
      aRuns: String(m.a.runs),
      aWkts: String(m.a.wickets),
      aOvers: formatOvers(m.a.balls),
      aAllOut: !!m.a.allOut,
      bRuns: String(m.b.runs),
      bWkts: String(m.b.wickets),
      bOvers: formatOvers(m.b.balls),
      bAllOut: !!m.b.allOut,
      result: m.result,
      battedFirst: m.battedFirst,
    });
    setFormError(null);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const remove = (id: string) => {
    if (!window.confirm("Delete this match?")) return;
    update({ ...t, matches: t.matches.filter((m) => m.id !== id) });
    if (editing === id) {
      setEditing(null);
      setDraft(null);
    }
  };
  const reset = () => {
    if (!window.confirm("Reset the whole tournament? This clears every match.")) return;
    update(null);
    setDraft(null);
    setEditing(null);
    setRestored(false);
  };

  const submit = () => {
    if (!draft) return;
    const pa = parseOvers(draft.aOvers);
    const pb = parseOvers(draft.bOvers);
    if (draft.teamA === draft.teamB) return setFormError("Pick two different teams.");
    if (draft.result !== "nr") {
      if (draft.aRuns === "" || draft.bRuns === "") return setFormError("Enter runs for both teams.");
      if (!pa.ok) return setFormError(`${draft.teamA} overs: ${pa.error}`);
      if (!pb.ok) return setFormError(`${draft.teamB} overs: ${pb.error}`);
      if (pa.balls === 0 || pb.balls === 0) return setFormError("Overs must be more than 0 for a completed match. Use No result if the match was not played out.");
    }
    const m: Tournament["matches"][number] = {
      id: editing ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      teamA: draft.teamA,
      teamB: draft.teamB,
      a: { runs: Number(draft.aRuns || 0), wickets: Number(draft.aWkts || 0), balls: pa.ok ? pa.balls : 0, allOut: draft.aAllOut },
      b: { runs: Number(draft.bRuns || 0), wickets: Number(draft.bWkts || 0), balls: pb.ok ? pb.balls : 0, allOut: draft.bAllOut },
      result: draft.result,
      battedFirst: draft.battedFirst,
      at: Date.now(),
    };
    const matches = editing ? t.matches.map((x) => (x.id === editing ? { ...m, at: x.at } : x)) : [...t.matches, m];
    update({ ...t, matches });
    trackTool("tool_result_generated", TOOL, { matches: matches.length, format: t.format });
    setDraft(null);
    setEditing(null);
    setFormError(null);
  };

  const quota = t.points.oversPerSide;

  return (
    <div className="rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-accent-700">{FORMATS.find((f) => f.value === t.format)?.label}</p>
          <h2 className="font-display text-2xl text-primary-900 truncate">{t.name || "Untitled tournament"}</h2>
          <p className="text-[12px] text-primary-400 mt-0.5">
            {t.matches.length} match{t.matches.length === 1 ? "" : "es"} · win {t.points.win}, tie {t.points.tie}, no result {t.points.nr}
            {quota ? ` · ${quota} overs a side` : ""}
            {restored ? " · restored from this browser" : ""}
          </p>
        </div>
        <button type="button" onClick={reset} className="shrink-0 text-[13px] font-semibold text-primary-500 hover:text-red-600 h-9 px-2">
          Reset
        </button>
      </div>

      {/* Series status or standings */}
      {series ? (
        <div className="mt-4 rounded-2xl bg-primary-900 text-white p-4 text-center" aria-live="polite">
          <p className="text-[11px] uppercase tracking-wide text-primary-300">Series</p>
          <p className="font-display text-2xl sm:text-3xl mt-1">{series.line}</p>
          <p className="text-[13px] text-primary-300 mt-1">{series.leader ? `${series.leader} lead${series.leader.endsWith("s") ? "" : "s"}` : t.matches.length ? "All square" : "No matches yet"}</p>
        </div>
      ) : (
        <div className="mt-4 -mx-4 sm:mx-0 overflow-x-auto scrollbar-hide" aria-live="polite">
          <table className="min-w-full text-[13px] sm:text-[14px]">
            <thead>
              <tr className="text-left text-primary-500 border-b border-primary-200">
                <th className="sticky left-0 bg-white pl-4 sm:pl-3 pr-3 py-2 font-semibold">Team</th>
                {["P", "W", "L", "T", "NR", "Pts", "NRR"].map((h) => (
                  <th key={h} className={`px-2 py-2 font-semibold text-right ${h === "Pts" ? "text-primary-900" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr key={s.team} className="border-b border-primary-100 last:border-0">
                  <td className="sticky left-0 bg-white pl-4 sm:pl-3 pr-3 py-2.5 font-semibold text-primary-900 whitespace-nowrap max-w-[150px] truncate">
                    <span className="text-primary-400 tabular mr-1.5">{i + 1}</span>
                    {s.team}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular">{s.played}</td>
                  <td className="px-2 py-2.5 text-right tabular">{s.won}</td>
                  <td className="px-2 py-2.5 text-right tabular">{s.lost}</td>
                  <td className="px-2 py-2.5 text-right tabular">{s.tied}</td>
                  <td className="px-2 py-2.5 text-right tabular">{s.nr}</td>
                  <td className="px-2 py-2.5 text-right tabular font-bold text-primary-900">{s.points}</td>
                  <td className={`px-2 py-2.5 pr-4 sm:pr-3 text-right tabular ${s.nrr != null && s.nrr < 0 ? "text-red-600" : "text-accent-700"}`}>{formatNrr(s.nrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {series && standings.length === 2 && (
        <p className="mt-2 text-[12px] text-primary-500 text-center">
          NRR: {standings.map((s) => `${s.team} ${formatNrr(s.nrr)}`).join(" · ")}
        </p>
      )}

      {/* Add / edit match */}
      <div ref={formRef} className="mt-5 scroll-mt-20">
        {draft ? (
          <div className="rounded-2xl bg-primary-50 p-3 sm:p-4 space-y-3">
            <p className="font-semibold text-primary-900">{editing ? "Edit match" : `Match ${t.matches.length + 1}`}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["teamA", "teamB"] as const).map((k) => (
                <Field key={k} label={k === "teamA" ? "Team A" : "Team B"} htmlFor={`ts-${k}`}>
                  <select id={`ts-${k}`} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="w-full h-12 px-3 rounded-xl bg-white border border-primary-200 text-[16px] text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40">
                    {t.teams.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            {(["a", "b"] as const).map((side) => {
              const name = side === "a" ? draft.teamA : draft.teamB;
              const runsK = side === "a" ? "aRuns" : "bRuns";
              const wktsK = side === "a" ? "aWkts" : "bWkts";
              const oversK = side === "a" ? "aOvers" : "bOvers";
              const allOutK = side === "a" ? "aAllOut" : "bAllOut";
              return (
                <div key={side} className="rounded-xl bg-white border border-primary-200 p-3">
                  <p className="text-[13px] font-semibold text-primary-800 mb-2 truncate">{name || `Team ${side.toUpperCase()}`}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <NumberInput value={draft[runsK]} onChange={(v) => setDraft({ ...draft, [runsK]: v })} placeholder="Runs" ariaLabel={`${name} runs`} />
                    <NumberInput value={draft[wktsK]} onChange={(v) => setDraft({ ...draft, [wktsK]: v })} placeholder="Wkts" max={10} ariaLabel={`${name} wickets`} />
                    <OversInput value={draft[oversK]} onChange={(v) => setDraft({ ...draft, [oversK]: v })} placeholder="Overs" ariaLabel={`${name} overs`} />
                  </div>
                  {quota ? (
                    <label className="mt-2 inline-flex items-center gap-2 text-[13px] text-primary-700">
                      <input type="checkbox" checked={draft[allOutK]} onChange={(e) => setDraft({ ...draft, [allOutK]: e.target.checked })} className="w-4 h-4 accent-accent-500" />
                      All out (counts the full {quota} overs for NRR)
                    </label>
                  ) : null}
                </div>
              );
            })}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Batted first</p>
                <Segmented
                  value={draft.battedFirst}
                  onChange={(v) => setDraft({ ...draft, battedFirst: v })}
                  ariaLabel="Who batted first"
                  options={[
                    { value: "a", label: draft.teamA || "A" },
                    { value: "b", label: draft.teamB || "B" },
                  ]}
                />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Result</p>
                <select value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value as ResultChoice })} className="w-full h-12 px-3 rounded-xl bg-white border border-primary-200 text-[16px] text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40" aria-label="Result">
                  <option value="auto">From the scores</option>
                  <option value="a">{draft.teamA || "Team A"} won</option>
                  <option value="b">{draft.teamB || "Team B"} won</option>
                  <option value="tie">Tie</option>
                  <option value="nr">No result</option>
                </select>
              </div>
            </div>
            {formError && <p className="text-[13px] text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <PrimaryButton onClick={submit} className="flex-1">
                {editing ? "Save changes" : "Add match"}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setDraft(null);
                  setEditing(null);
                }}
              >
                Cancel
              </SecondaryButton>
            </div>
          </div>
        ) : (
          <PrimaryButton onClick={openAdd} className="w-full">
            <Plus className="w-4 h-4" aria-hidden /> Add match
          </PrimaryButton>
        )}
      </div>

      {/* Match list */}
      {t.matches.length > 0 && (
        <ul className="mt-5 divide-y divide-primary-100 rounded-2xl border border-primary-200 overflow-hidden">
          {t.matches.map((m, i) => {
            const out = decideResult(m);
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-primary-900 truncate">
                    <span className="text-primary-400 tabular mr-1.5">{i + 1}.</span>
                    <span className={out === "a" ? "font-semibold" : ""}>{m.teamA}</span> {m.result === "nr" ? "" : `${m.a.runs}/${m.a.wickets} (${formatOvers(m.a.balls)})`}
                    <span className="text-primary-400"> v </span>
                    <span className={out === "b" ? "font-semibold" : ""}>{m.teamB}</span> {m.result === "nr" ? "" : `${m.b.runs}/${m.b.wickets} (${formatOvers(m.b.balls)})`}
                  </p>
                  <p className="text-[12px] text-primary-500 truncate">{describeResult(m, m.battedFirst)}</p>
                </div>
                <button type="button" onClick={() => openEdit(m)} aria-label={`Edit match ${i + 1}`} className="w-10 h-10 inline-flex items-center justify-center rounded-full text-primary-500 hover:text-primary-900 hover:bg-primary-100">
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => remove(m.id)} aria-label={`Delete match ${i + 1}`} className="w-10 h-10 inline-flex items-center justify-center rounded-full text-primary-500 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ToolCta tool={TOOL} label={cta.label} href={cta.href} />
    </div>
  );
}

/** First screen: format, name, teams, points. */
function Setup({ onStart }: { onStart: (t: Tournament) => void }) {
  const [format, setFormat] = useState<Format>("tri");
  const [name, setName] = useState("");
  const [teams, setTeams] = useState<string[]>(["", "", ""]);
  const [points, setPoints] = useState<PointsConfig>(DEFAULT_POINTS);
  const [showPoints, setShowPoints] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFormat = (f: Format) => {
    setFormat(f);
    const n = FORMATS.find((x) => x.value === f)!.teams;
    setTeams((prev) => {
      const next = prev.slice(0, f === "roundrobin" ? Math.max(n, prev.length) : n);
      while (next.length < n) next.push("");
      return next;
    });
  };

  const start = () => {
    const clean = teams.map((s) => s.trim()).filter(Boolean);
    const min = FORMATS.find((x) => x.value === format)!.teams;
    if (clean.length < (format === "roundrobin" ? 3 : min)) return setError(`Enter at least ${format === "roundrobin" ? 3 : min} team names.`);
    if (new Set(clean.map((s) => s.toLowerCase())).size !== clean.length) return setError("Team names must be different.");
    onStart({ v: 1, format, name: name.trim(), teams: clean.slice(0, 10), points, matches: [], startedAt: Date.now() });
  };

  const num = (k: keyof PointsConfig) => (v: string) => setPoints({ ...points, [k]: v === "" ? (k === "oversPerSide" ? null : 0) : Math.max(0, Math.min(99, Number(v))) });

  return (
    <div className="rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      <p className="text-[13px] font-semibold text-primary-800 mb-2">What are you running?</p>
      <div role="radiogroup" aria-label="Format" className="grid sm:grid-cols-3 gap-2">
        {FORMATS.map((f) => (
          <button key={f.value} type="button" role="radio" aria-checked={format === f.value} onClick={() => pickFormat(f.value)} className={`press-tight text-left rounded-2xl border-2 p-3 transition-colors ${format === f.value ? "border-accent-500 bg-accent-50" : "border-primary-200 bg-white hover:border-accent-400"}`}>
            <span className="block font-semibold text-primary-900 text-[15px]">{f.label}</span>
            <span className="block text-[12px] text-primary-500 mt-0.5">{f.blurb}</span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Field label="Tournament or series name" htmlFor="ts-name">
          <TextInput id="ts-name" value={name} onChange={setName} placeholder="Sunday Box League" maxLength={48} />
        </Field>
      </div>

      <div className="mt-4">
        <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Teams</p>
        <div className="space-y-2">
          {teams.map((v, i) => (
            <div key={i} className="flex gap-2">
              <TextInput value={v} onChange={(s) => setTeams(teams.map((x, j) => (j === i ? s : x)))} placeholder={`Team ${i + 1}`} maxLength={24} ariaLabel={`Team ${i + 1} name`} />
              {format === "roundrobin" && teams.length > 3 && (
                <button type="button" onClick={() => setTeams(teams.filter((_, j) => j !== i))} aria-label={`Remove team ${i + 1}`} className="w-12 h-12 shrink-0 inline-flex items-center justify-center rounded-xl text-primary-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {format === "roundrobin" && teams.length < 10 && (
          <button type="button" onClick={() => setTeams([...teams, ""])} className="mt-2 text-[14px] font-semibold text-accent-700 hover:underline">
            + Add a team
          </button>
        )}
      </div>

      <button type="button" onClick={() => setShowPoints((v) => !v)} className="mt-4 text-[14px] font-semibold text-accent-700 hover:underline">
        {showPoints ? "Hide points settings" : "Points and overs settings"}
      </button>
      {showPoints && (
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="Win" htmlFor="ts-pw">
            <NumberInput id="ts-pw" value={String(points.win)} onChange={num("win")} max={99} />
          </Field>
          <Field label="Tie" htmlFor="ts-pt">
            <NumberInput id="ts-pt" value={String(points.tie)} onChange={num("tie")} max={99} />
          </Field>
          <Field label="No result" htmlFor="ts-pn">
            <NumberInput id="ts-pn" value={String(points.nr)} onChange={num("nr")} max={99} />
          </Field>
          <Field label="Overs a side" htmlFor="ts-ov" hint="For the all-out rule">
            <NumberInput id="ts-ov" value={points.oversPerSide == null ? "" : String(points.oversPerSide)} onChange={num("oversPerSide")} placeholder="6" max={50} />
          </Field>
        </div>
      )}

      {error && <p className="mt-3 text-[13px] text-red-600">{error}</p>}
      <PrimaryButton onClick={start} className="mt-4 w-full">
        <Trophy className="w-4 h-4" aria-hidden /> Start scoring
      </PrimaryButton>
      <p className="mt-2 text-[12px] text-primary-400 text-center">Saved in this browser only. No account needed.</p>
    </div>
  );
}
