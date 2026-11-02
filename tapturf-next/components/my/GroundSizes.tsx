"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Ruler, X } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { SideView, SuitChips, TopView } from "@/components/turf/GroundDiagrams";
import { MID_TURF, sizeWord, sportsFor, suitability } from "@/lib/turfSize/benchmark";
import {
  FT_PER_M,
  GROUND_SPORTS,
  MAX_GROUNDS,
  NAME_MAX,
  SPORT_LABEL,
  fromFeet,
  normaliseGrounds,
  problemText,
  readNumber,
  shown,
  toFeet,
  type Dim,
  type Ground,
  type GroundSizes as Sizes,
  type GroundSport,
  type InputProblem,
  type Unit,
} from "@/lib/turfSize/sizes";
import type { GroundSizesState } from "@/lib/turfSize/api";
import { getGroundSizesCall, isGroundError, saveGroundSizesCall } from "@/lib/turfSize/client";

/** What the turf's dashboard shows about ground sizes: none set (the nudge), set, or nothing to say (loading, not on yet, not the owner's). */
export type GroundSizeState = "none" | "set" | null;

/**
 * One ground's boxes. exact: the size in feet behind a box's text when the text was made from it
 * (a saved size, or a unit switch), so a box left as it is saves exactly that: 160 ft shows as
 * 48.8 m, and 48.8 m alone would be 160.1 ft.
 */
type Row = { name: string; sport: GroundSport | null; length: string; width: string; height: string; exact?: Partial<Record<Dim, { text: string; ft: number }>> };
const EMPTY: Row = { name: "", sport: null, length: "", width: "", height: "" };
const INPUT = "w-full h-11 pl-3 pr-8 rounded-xl border bg-white text-[15px] text-primary-900 tabular-nums focus:outline-none focus:border-primary-400";
const DIMS: [Dim, string][] = [
  ["length", "Length"],
  ["width", "Width"],
  ["height", "Height"],
];

function rowOf(g: Ground, unit: Unit): Row {
  const row: Row = { name: g.name ?? "", sport: g.sport, length: "", width: "", height: "", exact: {} };
  for (const [dim, ft] of [["length", g.length_ft], ["width", g.width_ft], ["height", g.height_ft]] as const) {
    if (ft == null) continue;
    row[dim] = shown(fromFeet(ft, unit));
    row.exact![dim] = { text: row[dim], ft };
  }
  return row;
}

/** The size in feet behind a box: the exact one while its text is unchanged, else what is typed (null: empty or not a number). */
function feetOf(row: Row, dim: Dim, unit: Unit): number | null {
  const e = row.exact?.[dim];
  if (e && e.text === row[dim]) return e.ft;
  const n = readNumber(row[dim]);
  return n == null || Number.isNaN(n) || n <= 0 ? null : toFeet(n, unit);
}

/** The row in the other unit, the same sizes (text that isn't a number stays as typed). */
function convertRow(row: Row, from: Unit, to: Unit): Row {
  const next: Row = { ...row, exact: {} };
  for (const dim of ["length", "width", "height"] as const) {
    const ft = feetOf(row, dim, from);
    if (ft == null) continue;
    next[dim] = shown(fromFeet(ft, to));
    next.exact![dim] = { text: next[dim], ft };
  }
  return next;
}

/** What a box sends: its exact size in the owner's unit while unchanged (the route makes it feet again), else the text. */
function sent(row: Row, dim: Dim, unit: Unit): string | number {
  const e = row.exact?.[dim];
  return e && e.text === row[dim] ? (unit === "m" ? e.ft / FT_PER_M : e.ft) : row[dim];
}

/**
 * "Ground size" on a turf's dashboard (/my/turf/<id>): each ground's length,
 * width and net height, in feet or metres, with the turf page's drawing and
 * words as a live preview, saved through /api/my/ground-sizes. Before the
 * database has ground sizes it says they are coming; for someone who
 * doesn't run the turf it says nothing.
 */
export function GroundSizes({ turfId, turfSports, onState }: { turfId: string; turfSports: string[]; onState?: (s: GroundSizeState) => void }) {
  const { user, getToken } = useAuth();
  const [state, setState] = useState<"loading" | "soon" | "hidden" | "failed" | "ready">("loading");
  const [saved, setSaved] = useState<Sizes | null>(null);
  const [legacy, setLegacy] = useState<Ground | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>("ft");
  const [rows, setRows] = useState<Row[]>([EMPTY]);
  const [fromResearch, setFromResearch] = useState(false);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [problem, setProblem] = useState<InputProblem | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const start = useCallback((s: Sizes | null, research: Ground | null) => {
    setSaved(s);
    setLegacy(research);
    if (s) {
      setUnit(s.unit);
      setRows(s.grounds.map((g) => rowOf(g, s.unit)));
      setFromResearch(false);
    } else if (research) {
      setUnit("ft");
      setRows([rowOf(research, "ft")]);
      setFromResearch(true);
    } else {
      setRows([EMPTY]);
      setFromResearch(false);
    }
  }, []);

  const load = useCallback(async () => {
    const a = await getGroundSizesCall(getToken, turfId);
    if (a.status === 200 && !isGroundError(a.body)) {
      const b = a.body as GroundSizesState;
      if (!b.ready) return setState("soon");
      start(b.sizes, b.legacy);
      setLeft(b.saves_left);
      setState("ready");
      return;
    }
    // Not this account's turf (the site owner looking at any turf), or not signed in: nothing to show.
    setState(a.status === 403 || a.status === 401 || a.status === 404 ? "hidden" : "failed");
  }, [getToken, turfId, start]);

  // Once per sign-in: a refreshed profile (a new user object) must not reload the form under the owner's typing.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [signedIn, load]);

  useEffect(() => {
    onState?.(state === "ready" ? (saved ? "set" : "none") : null);
  }, [state, saved, onState]);

  const parsed = useMemo(() => normaliseGrounds(unit, rows), [unit, rows]);
  const base = useMemo(() => (saved ? saved.grounds.map((g) => rowOf(g, saved.unit)) : [EMPTY]), [saved]);
  const dirty = fromResearch || unit !== (saved?.unit ?? "ft") || JSON.stringify(rows) !== JSON.stringify(base);

  const edit = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setSaving("idle");
    setProblem(null);
  };
  const switchUnit = (to: Unit) => {
    if (to === unit) return;
    setRows((rs) => rs.map((r) => convertRow(r, unit, to)));
    setUnit(to);
    setSaving("idle");
    setProblem(null);
  };

  const save = async () => {
    if ("problem" in parsed) {
      setProblem(parsed.problem);
      setSaving("error");
      setMsg(problemText(parsed.problem, unit));
      return;
    }
    setSaving("saving");
    setProblem(null);
    const a = await saveGroundSizesCall(getToken, { turf_id: turfId, unit, grounds: rows.map((r) => ({ name: r.name, sport: r.sport, length: sent(r, "length", unit), width: sent(r, "width", unit), height: sent(r, "height", unit) })) });
    if (a.status === 200 && !isGroundError(a.body)) {
      const b = a.body as { sizes: Sizes | null; saves_left: number };
      start(b.sizes, legacy);
      setLeft(b.saves_left);
      setSaving("saved");
      return;
    }
    const e = isGroundError(a.body) ? a.body : { error: "unavailable" };
    setSaving("error");
    if (e.problem) {
      setProblem(e.problem);
      setMsg(problemText(e.problem, unit));
    } else {
      setMsg(
        e.reason === "limit"
          ? "That's 20 saves today. Try again tomorrow."
          : e.reason === "not_owner"
            ? "Only the turf's owners can change its size."
            : e.reason === "not_ready"
              ? "Ground sizes aren't on yet. Try again soon."
              : a.status === 401
                ? "Sign in again to save."
                : "Couldn't save. Check your connection and try again.",
      );
    }
  };

  if (state === "hidden" || state === "loading") return null;
  if (state === "soon")
    return (
      <Shell>
        <p className="mt-2 rounded-2xl bg-primary-50 px-4 py-3 text-[14px] text-primary-600">Coming soon: tell players how long, wide and high your ground is.</p>
      </Shell>
    );
  if (state === "failed")
    return (
      <Shell>
        <p className="mt-2 text-[14px] text-red-700">
          Couldn&rsquo;t load your ground size.{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline cursor-pointer">
            Try again
          </button>
        </p>
      </Shell>
    );

  const okGrounds = "ok" in parsed ? parsed.ok : null;
  return (
    <Shell>
      <p className="mt-1 text-[14px] text-primary-500">Measure the playing area inside the nets; height is the net or roof height. Leave height empty for an open ground.</p>

      {/* Feet or metres: what's typed is converted, so the sizes stay the same. */}
      <div className="mt-4 inline-flex rounded-full bg-primary-100 p-1" role="radiogroup" aria-label="Unit">
        {(["ft", "m"] as const).map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={unit === u}
            onClick={() => switchUnit(u)}
            className={`h-8 px-4 rounded-full text-[13px] font-semibold cursor-pointer transition-colors ${unit === u ? "bg-white text-primary-900 shadow-soft" : "text-primary-600"}`}
          >
            {u === "ft" ? "Feet" : "Metres"}
          </button>
        ))}
      </div>

      {fromResearch && (
        <p className="mt-3 rounded-xl bg-amber-50 border border-amber-200/70 px-3 py-2 text-[13px] text-amber-900">
          TapTurf&rsquo;s research found this size. Check it, fix what&rsquo;s wrong and save: only then does it show as yours.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <GroundForm
            key={i}
            i={i}
            row={r}
            unit={unit}
            count={rows.length}
            problem={problem && problem.ground === i ? problem : null}
            preview={okGrounds?.[i] ?? normaliseOne(unit, r)}
            turfSports={turfSports}
            onChange={(p) => edit(i, p)}
            onRemove={() => {
              setRows((rs) => rs.filter((_, j) => j !== i));
              setSaving("idle");
              setProblem(null);
            }}
          />
        ))}
        {rows.length === 0 && <p className="rounded-2xl border border-dashed border-primary-200 px-4 py-5 text-center text-[14px] text-primary-500">No grounds. Save to take the sizes off your page, or add one.</p>}
      </div>

      {rows.length < MAX_GROUNDS && (
        <button
          type="button"
          onClick={() => {
            setRows((rs) => [...rs, EMPTY]);
            setSaving("idle");
          }}
          className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-primary-200 bg-white text-[14px] font-semibold text-primary-800 hover:bg-primary-50 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden /> Add another ground
        </button>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving === "saving"}
          className="h-11 px-6 rounded-full bg-primary-900 text-white text-[14px] font-semibold cursor-pointer disabled:opacity-40"
        >
          {saving === "saving" ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Saving" /> : "Save ground size"}
        </button>
        <p className="min-w-0 flex-1 text-[13px]" role={saving === "error" ? "alert" : "status"}>
          {saving === "saved" ? (
            <span className="inline-flex items-center gap-1 font-semibold text-accent-700">
              <Check className="w-4 h-4" aria-hidden /> Saved. Live on your page within a minute.
            </span>
          ) : saving === "error" ? (
            <span className="text-red-600">{msg}</span>
          ) : left != null && left < 5 ? (
            <span className="text-primary-500">{left} save{left === 1 ? "" : "s"} left today</span>
          ) : null}
        </p>
      </div>
    </Shell>
  );
}

/** One ground on its own, for its preview while another box still has a problem. */
function normaliseOne(unit: Unit, r: Row): Ground | null {
  const n = normaliseGrounds(unit, [r]);
  return "ok" in n ? n.ok[0] : null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h2 className="font-display text-[22px] text-primary-900 inline-flex items-center gap-2">
        <Ruler className="w-5 h-5 text-accent-700" aria-hidden /> Ground size
      </h2>
      {children}
    </>
  );
}

function GroundForm({
  i,
  row,
  unit,
  count,
  problem,
  preview,
  turfSports,
  onChange,
  onRemove,
}: {
  i: number;
  row: Row;
  unit: Unit;
  count: number;
  problem: InputProblem | null;
  preview: Ground | null;
  turfSports: string[];
  onChange: (p: Partial<Row>) => void;
  onRemove: () => void;
}) {
  const id = `ground-${i}`;
  const bad = (f: string) => problem?.field === f;
  return (
    <fieldset className="min-w-0 rounded-2xl border border-primary-200 bg-white p-4" aria-describedby={problem ? `${id}-problem` : undefined}>
      <legend className="sr-only">Ground {i + 1}</legend>
      <div className="flex items-center gap-2">
        <input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          maxLength={NAME_MAX}
          placeholder={count > 1 ? `Box ${i + 1}` : "Name (optional), e.g. Box 1"}
          aria-label={`Ground ${i + 1} name`}
          aria-invalid={bad("name") || undefined}
          className={`min-w-0 flex-1 h-10 px-3 rounded-xl border text-[15px] font-semibold text-primary-900 focus:outline-none focus:border-primary-400 ${bad("name") ? "border-red-400" : "border-primary-200"}`}
        />
        {count > 1 && (
          <button type="button" onClick={onRemove} aria-label={`Remove ground ${i + 1}`} className="shrink-0 w-10 h-10 rounded-full text-primary-500 hover:bg-primary-100 inline-flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Ground ${i + 1} sport (optional)`}>
        {GROUND_SPORTS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={row.sport === s}
            onClick={() => onChange({ sport: row.sport === s ? null : s })}
            className={`h-8 px-3 rounded-full border text-[13px] font-semibold cursor-pointer transition-colors ${row.sport === s ? "bg-accent-50 border-accent-300 text-accent-800" : "bg-white border-primary-200 text-primary-600"}`}
          >
            {SPORT_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 items-end gap-2">
        {DIMS.map(([dim, label]) => (
          <label key={dim} className="min-w-0 text-[12px] font-semibold text-primary-500">
            {label}
            {dim === "height" && <span className="font-normal"> (if any)</span>}
            <span className="relative mt-1 block">
              <input
                inputMode="decimal"
                value={row[dim]}
                onChange={(e) => onChange({ [dim]: e.target.value.replace(/[^\d.,]/g, "").slice(0, 6) })}
                placeholder={dim === "length" ? (unit === "m" ? "36" : "120") : dim === "width" ? (unit === "m" ? "18" : "60") : unit === "m" ? "12" : "40"}
                aria-label={`Ground ${i + 1} ${label.toLowerCase()} in ${unit === "m" ? "metres" : "feet"}`}
                aria-invalid={bad(dim) || undefined}
                className={`${INPUT} ${bad(dim) ? "border-red-400" : "border-primary-200"}`}
              />
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-primary-400">{unit}</span>
            </span>
          </label>
        ))}
      </div>
      {problem && (
        <p id={`${id}-problem`} className="mt-2 text-[13px] text-red-600">
          {problemText(problem, unit)}
        </p>
      )}

      {preview && <Preview ground={preview} turfSports={turfSports} />}
    </fieldset>
  );
}

/** The turf page's drawing and words for this ground, small. */
function Preview({ ground, turfSports }: { ground: Ground; turfSports: string[] }) {
  const which = sportsFor(ground, turfSports);
  const s = suitability(ground, which);
  return (
    <div className="mt-4 rounded-xl bg-primary-50/70 p-3" aria-label="Preview on your page">
      <p className="text-[11px] font-semibold text-primary-500">Preview on your page</p>
      <div className="mt-2 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3 items-end max-w-xs">
        <TopView ground={ground} refSize={MID_TURF} refLabel="a mid-size turf" marks={which.cricket ? "pitch" : which.football ? "football" : "none"} />
        {ground.height_ft != null ? <SideView heightFt={ground.height_ft} /> : <p className="text-[11px] text-primary-500">Open ground</p>}
      </div>
      <p className="mt-2 text-[12px] text-primary-500">
        Length: {sizeWord("length", ground.length_ft)} · Width: {sizeWord("width", ground.width_ft)}
        {ground.height_ft != null ? ` · Nets: ${sizeWord("height", ground.height_ft)}` : ""}
      </p>
      <p className="mt-1 text-[13px] text-primary-800 leading-snug">{s.summary}</p>
      <SuitChips chips={s.chips} className="mt-2" />
    </div>
  );
}
