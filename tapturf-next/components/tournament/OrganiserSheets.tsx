"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Loader2, Trash2, Unlink } from "lucide-react";
import { Sheet } from "@/components/tools/scorer/ui";
import { Field, NumberInput, OversInput, PrimaryButton, Segmented, SecondaryButton, TextInput } from "@/components/tools/inputs";
import { emptyScoreDraft, readScoreDraft, scoreDraftOf, type ScoreDraft } from "@/lib/cricket/resultForm";
import type { ResultChoice } from "@/lib/cricket/nrr";
import { readShort } from "@/lib/tournament/payload";
import type { Resolved } from "@/lib/tournament/standings";
import { DEFAULT_TOURNAMENT_POINTS, type Op, type Points, type Settings, type Team, type Tournament, type Venue } from "@/lib/tournament/types";
import { VenuePicker } from "./VenuePicker";

/** A change sent; resolves to an error to show, or null when it went through. */
export type Send = (op: Op) => Promise<string | null>;

const SELECT = "w-full h-12 px-3 rounded-xl bg-white border border-primary-200 text-[16px] text-primary-900 focus:outline-none focus:ring-2 focus:ring-accent-500/40";

function useSend(send: Send, onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (op: Op) => {
    setBusy(true);
    setError(null);
    const e = await send(op);
    setBusy(false);
    if (e) setError(e);
    else onDone();
  };
  return { busy, error, setError, run };
}

const Spinner = () => <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden />;
const ErrorLine = ({ error }: { error: string | null }) =>
  error ? (
    <p role="alert" className="text-[13px] font-medium text-red-700">
      {error}
    </p>
  ) : null;

/**
 * A result by hand: for a match not scored live, or to correct or
 * override one that was (a DLS call, a super over, a washout). The form is
 * the Cricket Tournament Manager's (lib/cricket/resultForm.ts). A hand
 * result always wins; clearing it brings the live scorecard's back.
 */
export function ResultSheet({ t, r, title, send, onClose }: { t: Tournament; r: Resolved; title: string; send: Send; onClose: () => void }) {
  const home = r.homeName ?? "Home";
  const away = r.awayName ?? "Away";
  const start = r.fixture.result ? scoreDraftOf(r.fixture.result) : r.match ? scoreDraftOf(r.match) : emptyScoreDraft();
  const [d, setD] = useState<ScoreDraft>(start);
  const { busy, error, setError, run } = useSend(send, onClose);
  const quota = t.settings.overs;
  const pin = r.filled ? { home: r.home, away: r.away } : {};
  const save = () => {
    const read = readScoreDraft(d, { a: home, b: away });
    if ("error" in read) return setError(read.error);
    void run({ op: "result", id: r.fixture.id, result: read.ok, ...pin });
  };
  return (
    <Sheet title={r.fixture.result ? "Edit the result" : "Enter the result"} subtitle={`${title}: ${home} v ${away}`} onClose={onClose}>
      <div className="px-4 pt-3 space-y-3">
        {r.source === "live" && !r.fixture.result && <p className="rounded-xl bg-accent-50 px-3 py-2 text-[13px] text-accent-800">Filled in from the live scorecard. Change anything that is wrong; your result then counts instead.</p>}
        {(["a", "b"] as const).map((side) => {
          const name = side === "a" ? home : away;
          const k = (x: "Runs" | "Wkts" | "Overs" | "AllOut") => `${side}${x}` as keyof ScoreDraft;
          return (
            <div key={side} className="rounded-xl bg-primary-50 p-3">
              <p className="text-[14px] font-semibold text-primary-900 mb-2 truncate">{name}</p>
              <div className="grid grid-cols-3 gap-2">
                <NumberInput value={String(d[k("Runs")])} onChange={(v) => setD({ ...d, [k("Runs")]: v })} placeholder="Runs" ariaLabel={`${name} runs`} />
                <NumberInput value={String(d[k("Wkts")])} onChange={(v) => setD({ ...d, [k("Wkts")]: v })} placeholder="Wkts" max={10} ariaLabel={`${name} wickets`} />
                <OversInput value={String(d[k("Overs")])} onChange={(v) => setD({ ...d, [k("Overs")]: v })} placeholder="Overs" ariaLabel={`${name} overs`} />
              </div>
              {quota ? (
                <label className="mt-2 flex items-center gap-2 min-h-[36px] text-[13px] text-primary-700">
                  <input type="checkbox" checked={!!d[k("AllOut")]} onChange={(e) => setD({ ...d, [k("AllOut")]: e.target.checked })} className="w-4 h-4 accent-accent-500" />
                  All out (counts the full {quota} overs for NRR)
                </label>
              ) : null}
            </div>
          );
        })}
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Batted first</p>
          <Segmented value={d.battedFirst} onChange={(v) => setD({ ...d, battedFirst: v })} ariaLabel="Who batted first" options={[{ value: "a", label: home }, { value: "b", label: away }]} />
        </div>
        <Field label="Result" htmlFor="rs-result" hint="For a DLS result or a super over, pick the winner.">
          <select id="rs-result" value={d.result} onChange={(e) => setD({ ...d, result: e.target.value as ResultChoice })} className={SELECT}>
            <option value="auto">From the scores</option>
            <option value="a">{home} won</option>
            <option value="b">{away} won</option>
            <option value="tie">Tie</option>
            <option value="nr">No result</option>
          </select>
        </Field>
        <ErrorLine error={error} />
        <PrimaryButton onClick={save} disabled={busy} className="w-full">
          {busy && <Spinner />} Save result
        </PrimaryButton>
        {r.fixture.result && (
          <SecondaryButton onClick={() => void run({ op: "result", id: r.fixture.id, result: null })} disabled={busy} className="w-full">
            {r.fixture.live ? "Use the live scorecard's result" : "Clear the result"}
          </SecondaryButton>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Change a fixture (its teams, round, day and time), move it up or down
 * the list, unlink its live scorecard, or take it out (it stays out of the
 * table and the list; the database only marks it). With no fixture, a new
 * league match at the end.
 */
export function FixtureSheet({ t, r, order, title, send, onClose }: { t: Tournament; r: Resolved | null; order: number[]; title: string; send: Send; onClose: () => void }) {
  const f = r?.fixture ?? null;
  const playoff = !!f && f.stage !== "league";
  const lastRound = t.fixtures.filter((x) => x.stage === "league").reduce((m, x) => Math.max(m, x.round), 1);
  const [home, setHome] = useState<string>(f?.home != null ? String(f.home) : playoff ? "" : String(t.teams[0]?.id ?? ""));
  const [away, setAway] = useState<string>(f?.away != null ? String(f.away) : playoff ? "" : String(t.teams[1]?.id ?? ""));
  const [round, setRound] = useState(String(f?.round ?? lastRound));
  const [day, setDay] = useState(f?.day ?? "");
  const [time, setTime] = useState(f?.time ?? "");
  const { busy, error, setError, run } = useSend(send, onClose);
  const id = (s: string) => (s ? Number(s) : null);

  const save = () => {
    const h = id(home);
    const a = id(away);
    if (!playoff && (h === null || a === null)) return setError("Pick both teams.");
    if (h !== null && h === a) return setError("Pick two different teams.");
    const n = Number(round);
    if (!Number.isInteger(n) || n < 1 || n > 99) return setError("The round is a number from 1 to 99.");
    if (f && f.result && (h !== f.home || a !== f.away)) {
      if (!window.confirm("This match has a result. Change its teams anyway? The result stays with the new teams.")) return;
    }
    const when = { day: day || null, time: time || null };
    void run(f ? { op: "fixture_edit", id: f.id, round: n, home: h, away: a, ...when } : { op: "fixture_add", stage: "league", slot: null, round: n, home: h, away: a, ...when });
  };
  const move = (dir: -1 | 1) => {
    if (!f) return;
    const i = order.indexOf(f.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    void run({ op: "fixture_order", ids: next });
  };
  const teamOptions = (none: string) => (
    <>
      {playoff && <option value="">{none}</option>}
      {t.teams.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </>
  );
  const at = f ? order.indexOf(f.id) : -1;
  return (
    <Sheet title={f ? `Edit ${title}` : "Add a match"} subtitle={r && f ? `${r.homeLabel} v ${r.awayLabel}` : "A league match, at the end of the list."} onClose={onClose}>
      <div className="px-4 pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={playoff ? "First" : "Team A"} htmlFor="fs-home">
            <select id="fs-home" value={home} onChange={(e) => setHome(e.target.value)} className={SELECT}>
              {teamOptions(r?.homeLabel && !f?.home ? `${r.homeLabel} (from the table)` : "From the table")}
            </select>
          </Field>
          <Field label={playoff ? "Second" : "Team B"} htmlFor="fs-away">
            <select id="fs-away" value={away} onChange={(e) => setAway(e.target.value)} className={SELECT}>
              {teamOptions(r?.awayLabel && !f?.away ? `${r.awayLabel} (from the table)` : "From the table")}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-[5.5rem_1fr_1fr] gap-2">
          <Field label="Round" htmlFor="fs-round">
            <NumberInput id="fs-round" value={round} onChange={setRound} max={99} />
          </Field>
          <Field label="Day" htmlFor="fs-day">
            <input id="fs-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`${SELECT} px-2`} />
          </Field>
          <Field label="Time" htmlFor="fs-time">
            <input id="fs-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${SELECT} px-2`} />
          </Field>
        </div>
        <ErrorLine error={error} />
        <PrimaryButton onClick={save} disabled={busy} className="w-full">
          {busy && <Spinner />} {f ? "Save" : "Add the match"}
        </PrimaryButton>
        {f && (
          <div className="pt-2 border-t border-primary-100 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton onClick={() => move(-1)} disabled={busy || at <= 0}>
                <ArrowUp className="w-4 h-4" aria-hidden /> Move up
              </SecondaryButton>
              <SecondaryButton onClick={() => move(1)} disabled={busy || at < 0 || at >= order.length - 1}>
                <ArrowDown className="w-4 h-4" aria-hidden /> Move down
              </SecondaryButton>
            </div>
            {f.live && (
              <SecondaryButton onClick={() => window.confirm("Unlink the live scorecard from this match? Its score stops showing here.") && void run({ op: "live_unlink", id: f.id })} disabled={busy} className="w-full">
                <Unlink className="w-4 h-4" aria-hidden /> Unlink the live scorecard
              </SecondaryButton>
            )}
            <button
              type="button"
              onClick={() => window.confirm(`Take ${title} out of the tournament?${f.result || f.liveResult ? " Its result stops counting." : ""}`) && void run({ op: "fixture_remove", id: f.id })}
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-[14px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" aria-hidden /> Take this match out
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** The tournament's name, overs, points, venue and dates. The format and teams stay as made (teams can be renamed). */
export function SettingsSheet({ t, send, onClose }: { t: Tournament; send: Send; onClose: () => void }) {
  const [name, setName] = useState(t.name);
  const [overs, setOvers] = useState(t.settings.overs == null ? "" : String(t.settings.overs));
  const [points, setPoints] = useState<Points>(t.settings.points ?? DEFAULT_TOURNAMENT_POINTS);
  const [venue, setVenue] = useState<Venue | null>(t.settings.venue);
  const [starts, setStarts] = useState(t.settings.starts ?? "");
  const [ends, setEnds] = useState(t.settings.ends ?? "");
  const { busy, error, setError, run } = useSend(send, onClose);
  const save = () => {
    if (!name.trim()) return setError("Give the tournament a name.");
    const o = overs === "" ? null : Math.max(1, Math.min(50, Number(overs)));
    const settings: Settings = { ...t.settings, overs: o, points, venue, starts: starts || null, ends: ends && (!starts || ends >= starts) ? ends : null };
    void run({ op: "settings", name: name.trim(), settings });
  };
  const num = (k: keyof Points) => (v: string) => setPoints({ ...points, [k]: v === "" ? 0 : Math.max(0, Math.min(99, Number(v))) });
  return (
    <Sheet title="Tournament settings" onClose={onClose}>
      <div className="px-4 pt-3 space-y-3">
        <Field label="Name" htmlFor="ss-name">
          <TextInput id="ss-name" value={name} onChange={setName} maxLength={60} />
        </Field>
        <Field label="Overs a side" htmlFor="ss-overs" hint="Blank: NRR uses the overs faced, even when a side is bowled out.">
          <NumberInput id="ss-overs" value={overs} onChange={setOvers} max={50} />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          {(["win", "tie", "nr", "loss"] as const).map((k) => (
            <Field key={k} label={k === "nr" ? "No result" : k[0].toUpperCase() + k.slice(1)} htmlFor={`ss-p-${k}`}>
              <NumberInput id={`ss-p-${k}`} value={String(points[k])} onChange={num(k)} max={99} />
            </Field>
          ))}
        </div>
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Venue</p>
          <VenuePicker value={venue} onChange={setVenue} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Starts" htmlFor="ss-starts">
            <input id="ss-starts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className={SELECT} />
          </Field>
          <Field label="Ends" htmlFor="ss-ends">
            <input id="ss-ends" type="date" value={ends} min={starts || undefined} onChange={(e) => setEnds(e.target.value)} className={SELECT} />
          </Field>
        </div>
        <ErrorLine error={error} />
        <PrimaryButton onClick={save} disabled={busy} className="w-full">
          {busy && <Spinner />} Save settings
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/** Rename a team, or give it a short code. Its results stay with it. */
export function TeamSheet({ team, send, onClose }: { team: Team; send: Send; onClose: () => void }) {
  const [name, setName] = useState(team.name);
  const [short, setShort] = useState(team.short ?? "");
  const { busy, error, setError, run } = useSend(send, onClose);
  return (
    <Sheet title={`Rename ${team.name}`} subtitle="Its results and place in the table stay with it." onClose={onClose}>
      <div className="px-4 pt-3 space-y-3">
        <div className="grid grid-cols-[1fr_5.5rem] gap-2">
          <Field label="Name" htmlFor="ts-name">
            <TextInput id="ts-name" value={name} onChange={setName} maxLength={30} />
          </Field>
          <Field label="Code" htmlFor="ts-short">
            <TextInput id="ts-short" value={short} onChange={(v) => setShort(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))} maxLength={4} />
          </Field>
        </div>
        <ErrorLine error={error} />
        <PrimaryButton onClick={() => (name.trim() ? void run({ op: "team", id: team.id, name: name.trim(), short: readShort(short) }) : setError("A team needs a name."))} disabled={busy} className="w-full">
          {busy && <Spinner />} Save
        </PrimaryButton>
      </div>
    </Sheet>
  );
}

/** A row in the organiser's panel: icon, words, and what tapping it does. */
export function ManageRow({ icon, title, sub, onClick, tone = "default" }: { icon: ReactNode; title: string; sub?: string; onClick: () => void; tone?: "default" | "danger" }) {
  return (
    <button type="button" onClick={onClick} className="press-tight w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left hover:bg-primary-50">
      <span className={`grid place-items-center w-10 h-10 shrink-0 rounded-xl ${tone === "danger" ? "bg-red-50 text-red-600" : "bg-accent-50 text-accent-700"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-semibold ${tone === "danger" ? "text-red-700" : "text-primary-900"}`}>{title}</span>
        {sub && <span className="block text-[13px] text-primary-500 truncate">{sub}</span>}
      </span>
    </button>
  );
}
