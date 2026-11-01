"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown, Loader2, Plus, Radio, Trash2, Trophy } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { trackTool } from "@/lib/analytics/tools";
import { fixtureCount, makeFixtures } from "@/lib/tournament/fixtures";
import { rangeLabel } from "@/lib/tournament/format";
import { readCreate, readShort, teamRange } from "@/lib/tournament/payload";
import { newSecret, saveEntry } from "@/lib/tournament/store";
import { DEFAULT_TOURNAMENT_POINTS, MAX_TEAMS, type Playoffs, type Points, type Settings, type Venue } from "@/lib/tournament/types";
import { Field, NumberInput, PrimaryButton, Segmented, TextInput } from "@/components/tools/inputs";
import { VenuePicker } from "./VenuePicker";
import { createTournament, errorText, tournamentsReady } from "./api";

const TOOL = "live_tournament";

/** What the organiser picks; League + playoffs is a league with semis or a final. */
type Kind = "league" | "playoffs" | "bilateral" | "tri";
const KINDS: { value: Kind; label: string; blurb: string }[] = [
  { value: "league", label: "League", blurb: "Everyone plays everyone; top of the table wins." },
  { value: "playoffs", label: "League + playoffs", blurb: "Then semi-finals or a final." },
  { value: "bilateral", label: "Bilateral series", blurb: "Two teams, a few matches." },
  { value: "tri", label: "Tri-series", blurb: "Three teams, a table, maybe a final." },
];
const OVERS = [5, 6, 8, 10, 20];
const SERIES = [1, 3, 5, 7];
const PLACEHOLDERS = ["Titans", "Strikers", "Royals", "Kings", "Blasters", "Warriors", "Chargers", "Mavericks"];

type TeamRow = { name: string; short: string };

function teamsFor(kind: Kind, prev: TeamRow[]): TeamRow[] {
  const [lo, hi] = teamRange(kind === "playoffs" ? "league" : kind);
  const want = kind === "playoffs" ? Math.max(4, Math.min(hi, prev.length)) : Math.max(lo, Math.min(hi, prev.length));
  const next = prev.slice(0, want);
  while (next.length < want) next.push({ name: "", short: "" });
  return next;
}

/**
 * Setting up a live tournament (/tournament/new): name, format, teams,
 * overs and, folded away, the points, the venue and the dates. The
 * fixtures are made here from the format (lib/tournament/fixtures.ts) and
 * can all be changed later. No sign-up: this browser keeps the secret that
 * lets it manage the tournament; signed in, the tournament is kept with
 * the account too. Until the server can take tournaments (the database
 * migration), it says they are coming soon.
 */
export function TournamentCreate() {
  const router = useRouter();
  const { user } = useAuth();
  const [ready, setReady] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("playoffs");
  const [legs, setLegs] = useState<1 | 2>(1);
  const [playoffs, setPlayoffs] = useState<Exclude<Playoffs, "none">>("semis");
  const [triFinal, setTriFinal] = useState(true);
  const [series, setSeries] = useState(3);
  const [teams, setTeams] = useState<TeamRow[]>(() => teamsFor("playoffs", Array.from({ length: 5 }, () => ({ name: "", short: "" }))));
  const [overs, setOvers] = useState(6);
  const [points, setPoints] = useState<Points>(DEFAULT_TOURNAMENT_POINTS);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackTool("tool_opened", TOOL, { from: "new" });
    let on = true;
    void tournamentsReady().then((r) => on && setReady(r));
    return () => {
      on = false;
    };
  }, []);

  const pick = (k: Kind) => {
    setKind(k);
    setTeams((prev) => teamsFor(k, prev));
    if (k === "playoffs" && teams.length < 4) setPlayoffs("semis");
  };

  const settings: Settings = useMemo(
    () => ({
      format: kind === "playoffs" ? "league" : kind,
      legs: kind === "bilateral" ? 1 : legs,
      matches: kind === "bilateral" ? series : 0,
      playoffs: kind === "playoffs" ? (teams.length < 4 ? "final" : playoffs) : kind === "tri" && triFinal ? "final" : "none",
      overs,
      points,
      venue,
      starts: starts || null,
      ends: ends && (!starts || ends >= starts) ? ends : null,
    }),
    [kind, legs, series, playoffs, triFinal, overs, points, venue, starts, ends, teams.length],
  );
  const counts = fixtureCount(settings, teams.length);
  const [, maxTeams] = teamRange(settings.format);
  const fixed = kind === "bilateral" || kind === "tri";

  const submit = async () => {
    setError(null);
    const secret = newSecret();
    const ids = teams.map((_, i) => i + 1);
    const body = {
      secret,
      name: name.trim(),
      settings,
      teams: teams.map((t) => ({ name: t.name.trim(), short: readShort(t.short) })),
      fixtures: makeFixtures(settings, ids),
    };
    const checked = readCreate(body);
    if ("error" in checked) return setError(errorText("bad", checked.field));
    setBusy(true);
    const res = await createTournament(body);
    setBusy(false);
    if (!("code" in res.body)) return setError(errorText(res.body.error, "field" in res.body ? (res.body as { field?: string }).field : undefined));
    const { code } = res.body;
    saveEntry(code, { secret, name: checked.ok.name, at: Date.now(), ...((res.body as { kept?: boolean }).kept && user ? { acct: user.id } : {}) });
    trackTool("tool_used", TOOL, { action: "created", format: kind, teams: teams.length, matches: counts.league + counts.playoffs });
    router.push(`/tournament/${code}?new=1`);
  };

  if (ready === null) return <div className="rounded-3xl border border-primary-200 bg-white p-6 shadow-soft min-h-[420px]" aria-busy="true" />;
  if (!ready) {
    return (
      <div className="rounded-3xl border border-primary-200 bg-white p-6 shadow-soft">
        <p className="text-[12px] font-bold uppercase tracking-wide text-accent-700">Coming soon</p>
        <h2 className="mt-1 text-[22px] font-bold text-primary-900 leading-tight">Live tournaments are almost here</h2>
        <p className="mt-2 text-[15px] text-primary-600">Soon you can share one link for your whole tournament: the table, the fixtures and every match scored live. Until then, run it on this phone.</p>
        <Link href="/tools/cricket-tournament-scorer" className="press-tight mt-4 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-primary-900 text-white text-[15px] font-semibold hover:bg-accent-600">
          <Trophy className="w-4 h-4" aria-hidden /> Open the Tournament Manager
        </Link>
      </div>
    );
  }

  const num = (k: keyof Points) => (v: string) => setPoints({ ...points, [k]: v === "" ? 0 : Math.max(0, Math.min(99, Number(v))) });

  return (
    <form
      className="rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field label="Tournament name" htmlFor="tc-name">
        <TextInput id="tc-name" value={name} onChange={setName} placeholder="Sunday Box League" maxLength={60} />
      </Field>

      <div>
        <p className="text-[13px] font-semibold text-primary-800 mb-2">Format</p>
        <div role="radiogroup" aria-label="Format" className="grid grid-cols-2 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              onClick={() => pick(k.value)}
              className={`press-tight text-left rounded-2xl border-2 p-3 transition-colors min-h-[84px] ${kind === k.value ? "border-accent-500 bg-accent-50" : "border-primary-200 bg-white hover:border-accent-400"}`}
            >
              <span className="block font-semibold text-primary-900 text-[15px] leading-tight">{k.label}</span>
              <span className="block text-[12px] text-primary-500 mt-1 leading-snug">{k.blurb}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-3">
          {kind !== "bilateral" && (
            <Segmented
              value={String(legs) as "1" | "2"}
              onChange={(v) => setLegs(v === "2" ? 2 : 1)}
              ariaLabel="How many times teams meet"
              options={[
                { value: "1", label: "Play once" },
                { value: "2", label: "Home and away" },
              ]}
            />
          )}
          {kind === "playoffs" && (
            <Segmented
              value={teams.length < 4 ? "final" : playoffs}
              onChange={(v) => setPlayoffs(v)}
              ariaLabel="Playoffs"
              options={teams.length < 4 ? [{ value: "final", label: "Top 2 final" }] : [
                { value: "semis", label: "Top 4 semis + final" },
                { value: "final", label: "Top 2 final" },
              ]}
            />
          )}
          {kind === "tri" && (
            <label className="flex items-center gap-3 min-h-[44px] text-[14px] text-primary-800">
              <input type="checkbox" checked={triFinal} onChange={(e) => setTriFinal(e.target.checked)} className="w-5 h-5 accent-accent-500" />
              A final between the top two
            </label>
          )}
          {kind === "bilateral" && (
            <div>
              <p id="tc-series" className="text-[13px] font-semibold text-primary-800 mb-1.5">
                Matches in the series
              </p>
              <div role="radiogroup" aria-labelledby="tc-series" className="grid grid-cols-4 gap-2">
                {SERIES.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={series === n} onClick={() => setSeries(n)} className={`press-tight h-12 rounded-xl border-2 text-[17px] font-bold tabular-nums ${series === n ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-[13px] font-semibold text-primary-800">Teams</p>
          <p className="text-[12px] text-primary-400 tabular-nums">
            {teams.length}
            {fixed ? "" : ` of ${maxTeams}`}
          </p>
        </div>
        <ol className="space-y-2">
          {teams.map((t, i) => (
            <li key={i} className="flex gap-2 items-center">
              <span className="w-6 shrink-0 text-right text-[13px] font-bold text-primary-400 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <TextInput value={t.name} onChange={(s) => setTeams(teams.map((x, j) => (j === i ? { ...x, name: s } : x)))} placeholder={PLACEHOLDERS[i] ?? `Team ${i + 1}`} maxLength={30} ariaLabel={`Team ${i + 1} name`} />
              </div>
              <input
                value={t.short}
                onChange={(e) => setTeams(teams.map((x, j) => (j === i ? { ...x, short: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) } : x)))}
                placeholder="Code"
                aria-label={`Team ${i + 1} short code, optional`}
                autoComplete="off"
                className="w-[4.5rem] shrink-0 h-12 px-2.5 rounded-xl bg-primary-50 border border-primary-200 text-[16px] font-semibold uppercase text-primary-900 placeholder:text-primary-300 placeholder:normal-case placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white"
              />
              {!fixed && teams.length > 3 && (
                <button type="button" onClick={() => setTeams(teams.filter((_, j) => j !== i))} aria-label={`Remove team ${i + 1}`} className="w-10 h-12 shrink-0 inline-flex items-center justify-center rounded-xl text-primary-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ol>
        {!fixed && teams.length < Math.min(MAX_TEAMS, maxTeams) && (
          <button type="button" onClick={() => setTeams([...teams, { name: "", short: "" }])} className="mt-2 inline-flex items-center gap-1.5 min-h-[44px] text-[14px] font-semibold text-accent-700 hover:underline">
            <Plus className="w-4 h-4" aria-hidden /> Add a team
          </button>
        )}
      </div>

      <div>
        <p id="tc-overs" className="text-[13px] font-semibold text-primary-800 mb-1.5">
          Overs a side
        </p>
        <div role="radiogroup" aria-labelledby="tc-overs" className="grid grid-cols-5 gap-2">
          {OVERS.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={overs === n} aria-label={`${n} overs`} onClick={() => setOvers(n)} className={`press-tight h-12 rounded-xl border-2 text-[17px] font-bold tabular-nums ${overs === n ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800"}`}>
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-primary-400">The live scorer starts with these; a side bowled out counts the full overs for NRR.</p>
      </div>

      <div className="rounded-2xl bg-primary-50">
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="w-full flex items-center justify-between gap-3 px-4 min-h-[52px] text-left">
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold text-primary-900">Venue, dates and points</span>
            <span className="block text-[12px] text-primary-500 truncate">
              {[venue?.name, rangeLabel(starts || null, ends && (!starts || ends >= starts) ? ends : null), `win ${points.win}, tie ${points.tie}, no result ${points.nr}`].filter(Boolean).join(" · ")}
            </span>
          </span>
          <ChevronDown className={`w-5 h-5 text-primary-500 shrink-0 transition-transform ${more ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {more && (
          <div className="px-4 pb-4 space-y-4">
            <div>
              <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Venue</p>
              <VenuePicker value={venue} onChange={setVenue} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Starts" htmlFor="tc-starts">
                <input id="tc-starts" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className="w-full h-12 px-3 rounded-xl bg-white border border-primary-200 text-[16px] text-primary-900" />
              </Field>
              <Field label="Ends" htmlFor="tc-ends">
                <input id="tc-ends" type="date" value={ends} min={starts || undefined} onChange={(e) => setEnds(e.target.value)} className="w-full h-12 px-3 rounded-xl bg-white border border-primary-200 text-[16px] text-primary-900" />
              </Field>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["win", "tie", "nr", "loss"] as const).map((k) => (
                <Field key={k} label={k === "nr" ? "No result" : k[0].toUpperCase() + k.slice(1)} htmlFor={`tc-p-${k}`}>
                  <NumberInput id={`tc-p-${k}`} value={String(points[k])} onChange={num(k)} max={99} />
                </Field>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-primary-200 p-3.5 flex items-start gap-3">
        <CalendarDays className="w-5 h-5 text-accent-600 shrink-0 mt-0.5" aria-hidden />
        <p className="text-[14px] text-primary-700">
          <span className="font-semibold text-primary-900">
            {counts.league} {kind === "bilateral" ? "match" : "league match"}
            {counts.league === 1 ? "" : "es"}
            {counts.playoffs ? ` + ${counts.playoffs} playoff${counts.playoffs === 1 ? "" : "s"}` : ""}
          </span>{" "}
          made for you. Change, move or add any of them later.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[14px] text-red-700 font-medium">
          {error}
        </p>
      )}
      <div>
        <PrimaryButton type="submit" disabled={busy} className="w-full h-14 text-[17px]">
          {busy ? <Loader2 className="w-5 h-5 motion-safe:animate-spin" aria-hidden /> : <Radio className="w-5 h-5" aria-hidden />} Create and get the link
        </PrimaryButton>
        <p className="mt-2 text-[12px] text-primary-500 text-center">
          No sign-up needed: this phone keeps the key to manage it.{" "}
          {user ? "It is kept with your account too, so you can manage it from any phone." : "Sign in to manage it from any phone."}
        </p>
      </div>
    </form>
  );
}
