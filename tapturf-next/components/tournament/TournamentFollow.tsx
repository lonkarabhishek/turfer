"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, Crown, MapPin, Pencil, Plus, Radio, Settings2, Share2, ShieldCheck, Trash2, Trophy, Users } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { trackTool } from "@/lib/analytics/tools";
import { CONTACT_EMAIL } from "@/lib/contact";
import { formatNrr, formatOvers } from "@/lib/cricket/overs";
import { viewsLabel } from "@/lib/live/views";
import { turfPath } from "@/lib/utils/turfPath";
import { dayLabel, fixtureTitle, groupFixtures, rangeLabel, timeLabel } from "@/lib/tournament/format";
import { formatLabel, resolve, type Resolution, type Resolved } from "@/lib/tournament/standings";
import { loadStore, newSecret, saveEntry, saveHandoff } from "@/lib/tournament/store";
import { TOURNAMENT_LIVE_POLL_MS, TOURNAMENT_POLL_MS, TOURNAMENT_POLL_TIMEOUT_MS, tournamentUrl, type Op, type Team, type TournamentGetResponse } from "@/lib/tournament/types";
import { changeTournament, claimTournament, errorText, readTournament } from "./api";
import { FixtureSheet, ManageRow, ResultSheet, SettingsSheet, TeamSheet } from "./OrganiserSheets";
import { ShareSheet } from "./ShareSheet";
import { useTournamentViews } from "./useTournamentViews";

const TOOL = "live_tournament";
type Tab = "table" | "matches" | "playoffs" | "manage";
type Open = { kind: "share" } | { kind: "result"; r: Resolved } | { kind: "fixture"; r: Resolved | null } | { kind: "settings" } | { kind: "team"; team: Team } | null;

// A colour per team, so a team is found at a glance in the table and the fixtures.
const MARKS = ["bg-accent-500 text-white", "bg-primary-900 text-white", "bg-amber-400 text-amber-950", "bg-sky-500 text-white", "bg-rose-500 text-white", "bg-violet-500 text-white", "bg-teal-600 text-white", "bg-orange-500 text-white"];

function TeamMark({ team, size = "md" }: { team: Team | null; size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-6 h-6 text-[9px]" : "w-8 h-8 text-[11px]";
  if (!team) return <span className={`${s} shrink-0 rounded-full border-2 border-dashed border-primary-300`} aria-hidden />;
  const text = team.short ?? team.name.replace(/[^A-Za-z0-9 ]/g, "").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className={`${s} shrink-0 inline-flex items-center justify-center rounded-full font-extrabold tracking-tight ${MARKS[(team.id - 1) % MARKS.length]}`} aria-hidden>
      {text || "?"}
    </span>
  );
}

function LivePill() {
  return (
    <span className="shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
      LIVE
    </span>
  );
}

/** A side's score on a fixture card: done from its result, live from the scorecard. */
function scoreOf(r: Resolved, side: "a" | "b"): { score: string; overs: string } | null {
  if (r.state === "live" && r.live) return r.live[side];
  if (r.state !== "done" || !r.match || r.outcome === "nr") return null;
  const inn = r.match[side];
  return { score: `${inn.runs}/${inn.wickets}`, overs: formatOvers(inn.balls) };
}

/**
 * A live tournament's page, /tournament/<code>: the table, the fixtures and
 * results by round or day, the playoffs, and the matches being scored live
 * with their score, kept up to date by polling GET /api/tournament/<code>
 * while the page is on screen (every TOURNAMENT_LIVE_POLL_MS with a match
 * live, else TOURNAMENT_POLL_MS; never while hidden). Followers need no
 * sign-in. In the organiser's browser (it holds the secret) it is also
 * where they run it: results, live scoring, fixtures, teams and settings.
 * On a phone the parts are tabs; on a wide screen the table and the
 * fixtures sit side by side.
 */
export function TournamentFollow({ code, initial }: { code: string; initial: TournamentGetResponse }) {
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("table");
  const [secret, setSecret] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [note, setNote] = useState<string | null>(null);
  const [trouble, setTrouble] = useState(false);
  const [fresh, setFresh] = useState(false);
  const latest = useRef(initial);
  const views = useTournamentViews(code);

  const t = data.tournament;
  const res: Resolution = useMemo(() => resolve(t, data.live), [t, data.live]);
  const anyLive = res.fixtures.some((r) => r.state === "live" && !r.live?.closed);
  const live = useRef(anyLive);
  live.current = anyLive;
  const organiser = !!secret;
  const url = tournamentUrl(typeof window === "undefined" ? "https://www.tapturf.in" : window.location.origin, code);

  const take = useCallback((next: TournamentGetResponse) => {
    const cur = latest.current;
    // The highest rev wins; the live scores can move without one.
    if (next.tournament.rev < cur.tournament.rev) return;
    if (next.tournament.rev === cur.tournament.rev && JSON.stringify(next.live) === JSON.stringify(cur.live)) return;
    latest.current = next;
    setData(next);
  }, []);

  // This browser's secret, and the hand-off from the create page (?new=1) or the Me tab (?manage=1).
  useEffect(() => {
    trackTool("tool_opened", TOOL, { from: "follow" });
    const q = new URLSearchParams(window.location.search);
    const isNew = q.get("new") === "1";
    const manage = q.get("manage") === "1";
    const timer = setTimeout(() => {
      setSecret(loadStore().list[code]?.secret ?? null);
      if (isNew) setFresh(true);
      if (manage) sessionStorage.setItem(`tt_manage_${code}`, "1");
    }, 0);
    if (isNew || manage) {
      try {
        window.history.replaceState(window.history.state, "", window.location.pathname);
      } catch {
        /* the address keeps its query: a reload shows the banner again */
      }
    }
    return () => clearTimeout(timer);
  }, [code]);

  // Signed in: the tournament is kept with the account (once), and from the Me tab another phone of that account can manage it.
  useEffect(() => {
    if (!user) return;
    const entry = loadStore().list[code];
    if (entry && entry.acct !== user.id) {
      void claimTournament(code, entry.secret).then((r) => {
        if ("kept" in r.body) saveEntry(code, { ...entry, acct: user.id });
      });
      return;
    }
    let asked = false;
    try {
      asked = sessionStorage.getItem(`tt_manage_${code}`) === "1";
      sessionStorage.removeItem(`tt_manage_${code}`);
    } catch {
      /* no storage */
    }
    if (!entry && asked) {
      const s = newSecret();
      void claimTournament(code, s).then((r) => {
        if ("kept" in r.body) {
          saveEntry(code, { secret: s, name: latest.current.tournament.name, at: Date.now(), acct: user.id });
          setSecret(s);
          setNote("This phone can manage the tournament now.");
        } else setNote(r.body.error === "forbidden" ? "This tournament isn't kept with your account." : errorText(r.body.error));
      });
    }
  }, [user, code]);

  // Polling: one at a time, only while the page is on screen.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    const poll = async () => {
      if (stopped || busy) return;
      if (document.visibilityState === "hidden") return;
      busy = true;
      const ctrl = new AbortController();
      const cut = setTimeout(() => ctrl.abort(), TOURNAMENT_POLL_TIMEOUT_MS);
      try {
        const r = await fetch(`/api/tournament/${code}`, { cache: "no-store", signal: ctrl.signal });
        if (r.ok) {
          take((await r.json()) as TournamentGetResponse);
          setTrouble(false);
        } else setTrouble(r.status >= 500);
      } catch {
        setTrouble(true);
      } finally {
        clearTimeout(cut);
        busy = false;
        schedule();
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (!stopped) timer = setTimeout(poll, live.current ? TOURNAMENT_LIVE_POLL_MS : TOURNAMENT_POLL_MS);
    };
    const wake = () => {
      if (document.visibilityState === "visible") void poll();
    };
    schedule();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [code, take]);

  /** One change by the organiser; the answer carries the tournament as it is now. */
  const send = useCallback(
    async (op: Op): Promise<string | null> => {
      if (!secret) return errorText("forbidden");
      const r = await changeTournament(code, secret, op);
      if (!("ok" in r.body)) return errorText(r.body.error, (r.body as { field?: string }).field);
      trackTool("tool_action", TOOL, { action: op.op });
      if (r.body.view) take(r.body.view);
      else {
        const again = await readTournament(code, r.body.rev);
        if ("tournament" in again.body) take(again.body);
      }
      return null;
    },
    [code, secret, take],
  );

  const scoreLive = (r: Resolved, title: string) => {
    if (r.home === null || r.away === null || !r.homeName || !r.awayName) return;
    saveHandoff({
      code,
      fixture: r.fixture.id,
      title: `${t.name} · ${title}`.slice(0, 60),
      teamA: r.homeName,
      teamB: r.awayName,
      overs: t.settings.overs ?? 6,
      venue: (t.settings.venue?.name ?? "").slice(0, 48),
      home: r.filled ? r.home : null,
      away: r.filled ? r.away : null,
      at: Date.now(),
    });
    trackTool("tool_cta_clicked", TOOL, { href: "/tools/cricket-live-scorer", action: "score_live" });
    router.push(`/tools/cricket-live-scorer?tournament=${code}&fixture=${r.fixture.id}`);
  };

  if (t.status === "removed") {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <section className="rounded-3xl bg-primary-900 text-white p-6">
          <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">Tournament</p>
          <h1 className="mt-1 text-[22px] font-bold leading-tight">This tournament has been taken down</h1>
          <p className="mt-2 text-[15px] text-white/75">The organiser took it off TapTurf. If it is still on, ask them for a new link.</p>
        </section>
        <Ctas venue={null} />
      </div>
    );
  }

  const teamOf = (id: number | null) => t.teams.find((x) => x.id === id) ?? null;
  const titleOf = (r: Resolved) => fixtureTitle(r.fixture, t.fixtures);
  const liveNow = res.fixtures.filter((r) => r.state === "live" && r.live && !r.live.closed);
  const hasPlayoffs = res.fixtures.some((r) => r.fixture.stage !== "league");
  const groups = groupFixtures(res.fixtures, t.teams, t.settings.format === "bilateral");
  const order = res.fixtures.map((r) => r.fixture.id);
  const when = rangeLabel(t.settings.starts, t.settings.ends);
  const champion = res.champion && "id" in res.champion ? teamOf(res.champion.id) : null;
  const tabs: { key: Tab; label: string }[] = [
    { key: "table", label: t.settings.format === "bilateral" ? "Series" : "Table" },
    { key: "matches", label: "Matches" },
    ...(hasPlayoffs ? [{ key: "playoffs" as const, label: "Playoffs" }] : []),
    ...(organiser ? [{ key: "manage" as const, label: "Manage" }] : []),
  ];
  const shown = (k: Tab) => (tab === k ? "" : "hidden lg:block");

  return (
    <div className="mx-auto max-w-3xl lg:max-w-6xl px-4 sm:px-6 pt-3 pb-24 sm:py-6">
      {/* ─── The tournament ─── */}
      <header className="relative overflow-hidden rounded-3xl bg-primary-900 text-white p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full bg-accent-500/25 blur-2xl" />
        <div className="relative flex items-center justify-between gap-2">
          <p className="min-w-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white/10 text-[11px] sm:text-[12px] font-bold text-accent-300 whitespace-nowrap">
            <Trophy className="hidden min-[360px]:block w-3.5 h-3.5 shrink-0" aria-hidden /> <span className="truncate">{formatLabel(t.settings)}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setOpen({ kind: "share" });
              trackTool("tool_cta_clicked", TOOL, { href: "share" });
            }}
            className="press-tight shrink-0 inline-flex items-center gap-1.5 h-10 px-3.5 sm:px-4 rounded-full bg-white text-primary-900 text-[14px] font-bold hover:bg-accent-50"
          >
            <Share2 className="w-4 h-4" aria-hidden /> Share
          </button>
        </div>
        <h1 className="relative mt-3 font-display text-[28px] sm:text-[40px] leading-[1.05] break-words">{t.name}</h1>
        <div className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-white/80">
          {t.settings.venue && (
            <Link href={turfPath({ id: t.settings.venue.id, slug: t.settings.venue.slug })} className="inline-flex items-center gap-1.5 hover:text-white underline-offset-2 hover:underline">
              <MapPin className="w-4 h-4 text-accent-300 shrink-0" aria-hidden />
              {t.settings.venue.name}
              {t.settings.venue.area ? `, ${t.settings.venue.area}` : ""}
            </Link>
          )}
          {when && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-accent-300" aria-hidden /> {when}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-4 h-4 text-accent-300" aria-hidden /> {t.teams.length} teams{t.settings.overs ? ` · ${t.settings.overs} overs a side` : ""}
          </span>
        </div>
        <div className="relative mt-4">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="font-semibold">
              {res.played} of {res.total} played
            </span>
            {views !== null && views > 0 && <span className="text-white/60 tabular-nums">{viewsLabel(views)}</span>}
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/15 overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-accent-400" style={{ width: `${res.total ? Math.round((res.played / res.total) * 100) : 0}%` }} />
          </div>
        </div>
        {(champion || res.champion) && (
          <p className="relative mt-4 inline-flex items-center gap-2 rounded-2xl bg-amber-300 text-amber-950 px-3.5 py-2 text-[15px] font-bold">
            <Crown className="w-5 h-5" aria-hidden /> {champion ? `Champions: ${champion.name}` : "Title shared"}
          </p>
        )}
      </header>

      {trouble && (
        <p role="status" className="mt-3 text-[13px] font-semibold text-red-700">
          Can&rsquo;t get the latest scores. Trying again.
        </p>
      )}
      {note && (
        <p role="status" className="mt-3 rounded-2xl bg-accent-50 border border-accent-500/30 px-3.5 py-2.5 text-[14px] text-accent-800">
          {note}
        </p>
      )}

      {organiser && fresh && (
        <section className="mt-4 rounded-3xl border-2 border-accent-500 bg-accent-50 p-4 sm:p-5">
          <h2 className="text-[18px] font-bold text-primary-900">Your tournament is live</h2>
          <p className="mt-1 text-[14px] text-primary-700">Send the link to your players. They see the table, the fixtures and every match you score live, without signing in.</p>
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => setOpen({ kind: "share" })} className="press-tight inline-flex items-center justify-center gap-2 h-12 px-5 rounded-full bg-accent-500 text-white text-[15px] font-bold hover:bg-accent-600">
              <Share2 className="w-4 h-4" aria-hidden /> Share the link
            </button>
            <button type="button" onClick={() => setFresh(false)} className="h-12 px-4 rounded-full text-[14px] font-semibold text-primary-600 hover:bg-white">
              Later
            </button>
          </div>
          {!user && (
            <p className="mt-3 text-[12px] text-primary-600">
              This phone can manage it.{" "}
              <Link href={`/login?next=${encodeURIComponent(`/tournament/${code}`)}`} className="font-semibold text-accent-700 underline">
                Sign in
              </Link>{" "}
              to manage it from any phone.
            </p>
          )}
        </section>
      )}

      {/* ─── Live now ─── */}
      {liveNow.length > 0 && (
        <section aria-label="Live now" className="mt-4 space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
          {liveNow.map((r) => (
            <Link
              key={r.fixture.id}
              href={`/live/${r.fixture.live}`}
              onClick={() => trackTool("tool_cta_clicked", TOOL, { href: "/live" })}
              className="press-tight block rounded-2xl bg-white border-2 border-red-600/80 p-3.5 hover:bg-red-50/40"
            >
              <div className="flex items-center gap-2 text-[12px] font-semibold text-primary-500">
                <LivePill /> {titleOf(r)}
              </div>
              <div className="mt-2 space-y-1.5">
                {(["a", "b"] as const).map((side) => {
                  const team = teamOf(side === "a" ? r.home : r.away);
                  const s = r.live?.[side];
                  return (
                    <div key={side} className="flex items-center gap-2.5">
                      <TeamMark team={team} size="sm" />
                      <span className={`min-w-0 flex-1 truncate text-[15px] ${r.live?.batting === side ? "font-bold text-primary-900" : "text-primary-700"}`}>{team?.name}</span>
                      {s && (
                        <span className="tabular-nums text-[15px] font-bold text-primary-900">
                          {s.score} <span className="text-[12px] font-medium text-primary-500">({s.overs})</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* The chase's equation; in the first innings the headline is just the score above. */}
              {r.live?.headline && r.live.a && r.live.b && <p className="mt-2 text-[13px] text-primary-600 line-clamp-2">{r.live.headline}</p>}
              <p className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-red-700">
                Ball by ball <ArrowRight className="w-3.5 h-3.5" aria-hidden />
              </p>
            </Link>
          ))}
        </section>
      )}

      {/* ─── Tabs (a phone) ─── */}
      <div role="tablist" aria-label="Tournament" className="lg:hidden sticky top-[60px] z-20 -mx-4 px-4 py-2 mt-3 bg-white/90 backdrop-blur-sm">
        <div className="flex gap-1 p-1 rounded-2xl bg-primary-100">
          {tabs.map((x) => (
            <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} onClick={() => setTab(x.key)} className={`flex-1 h-10 rounded-xl text-[14px] font-bold transition-colors ${tab === x.key ? "bg-white text-primary-900 shadow-soft" : "text-primary-600"}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 lg:mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-6 lg:items-start">
        <div className="space-y-6 min-w-0">
          <section aria-labelledby="t-table" className={shown("table")}>
            <h2 id="t-table" className="hidden lg:block text-[20px] font-bold text-primary-900 mb-3">
              {t.settings.format === "bilateral" ? "Series" : "Points table"}
            </h2>
            {res.series ? <SeriesCard res={res} teams={t.teams} /> : <PointsTable res={res} teams={t.teams} />}
            <p className="mt-2 text-[12px] text-primary-500">
              Win {t.settings.points.win}, tie {t.settings.points.tie}, no result {t.settings.points.nr}
              {t.settings.points.loss ? `, loss ${t.settings.points.loss}` : ""}. Level on points: net run rate, then wins.
              {t.settings.overs ? ` A side bowled out counts the full ${t.settings.overs} overs.` : ""}
            </p>
          </section>

          {hasPlayoffs && (
            <section aria-labelledby="t-playoffs" className={shown("playoffs")}>
              <h2 id="t-playoffs" className="hidden lg:block text-[20px] font-bold text-primary-900 mb-3">
                Playoffs
              </h2>
              <Bracket res={res} teamOf={teamOf} titleOf={titleOf} leagueDone={res.leagueDone} organiser={organiser} onResult={(r) => setOpen({ kind: "result", r })} onScore={scoreLive} onEdit={(r) => setOpen({ kind: "fixture", r })} />
            </section>
          )}

          {organiser && (
            <section aria-labelledby="t-manage" className={shown("manage")}>
              <h2 id="t-manage" className="text-[20px] font-bold text-primary-900 mb-3 hidden lg:block">
                Manage
              </h2>
              <div className="rounded-2xl border border-primary-200 bg-white divide-y divide-primary-100 overflow-hidden">
                <ManageRow icon={<Share2 className="w-5 h-5" />} title="Share the link" sub={url.replace(/^https?:\/\/(www\.)?/, "")} onClick={() => setOpen({ kind: "share" })} />
                <ManageRow icon={<Plus className="w-5 h-5" />} title="Add a match" sub="Any two teams, any round" onClick={() => setOpen({ kind: "fixture", r: null })} />
                <ManageRow icon={<Settings2 className="w-5 h-5" />} title="Settings" sub="Name, overs, points, venue and dates" onClick={() => setOpen({ kind: "settings" })} />
                {t.teams.map((team) => (
                  <ManageRow key={team.id} icon={<TeamMark team={team} size="sm" />} title={team.name} sub="Rename, or set its short code" onClick={() => setOpen({ kind: "team", team })} />
                ))}
                <ManageRow
                  icon={<Trash2 className="w-5 h-5" />}
                  tone="danger"
                  title="Take the tournament down"
                  sub="Its link stops showing it"
                  onClick={() => {
                    if (!window.confirm(`Take ${t.name} down? Everyone with the link sees it was taken down. This can't be undone.`)) return;
                    void send({ op: "remove" }).then((e) => e && setNote(e));
                  }}
                />
              </div>
              <div className="mt-3 rounded-2xl bg-primary-50 px-4 py-3 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-accent-600 shrink-0 mt-0.5" aria-hidden />
                {user ? (
                  <p className="text-[13px] text-primary-700">Kept with your account. Sign in on another phone and open it from the Me tab to manage it there too.</p>
                ) : (
                  <p className="text-[13px] text-primary-700">
                    Only this phone can manage it.{" "}
                    <Link href={`/login?next=${encodeURIComponent(`/tournament/${code}`)}`} className="font-semibold text-accent-700 underline">
                      Sign in
                    </Link>{" "}
                    to keep it with your account and manage it from any phone.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>

        <section aria-labelledby="t-matches" className={`min-w-0 ${shown("matches")}`}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id="t-matches" className="hidden lg:block text-[20px] font-bold text-primary-900">
              Matches
            </h2>
            {organiser && (
              <button type="button" onClick={() => setOpen({ kind: "fixture", r: null })} className="ml-auto inline-flex items-center gap-1.5 h-10 px-3.5 rounded-full border border-primary-200 text-[13px] font-bold text-primary-800 hover:border-accent-500">
                <Plus className="w-4 h-4" aria-hidden /> Add a match
              </button>
            )}
          </div>
          <div className="space-y-5">
            {groups.map((g) => (
              // On a wide screen the playoffs have their own column beside the table: not listed twice.
              <div key={g.key} className={g.key.startsWith("p:") ? "lg:hidden" : undefined}>
                <h3 className="text-[13px] font-bold uppercase tracking-wide text-primary-500 mb-2">{g.title}</h3>
                <div className="space-y-2">
                  {g.items.map((r) => (
                    <FixtureCard key={r.fixture.id} r={r} title={titleOf(r)} teamOf={teamOf} organiser={organiser} onResult={() => setOpen({ kind: "result", r })} onEdit={() => setOpen({ kind: "fixture", r })} onScore={() => scoreLive(r, titleOf(r))} />
                  ))}
                </div>
                {g.byes.length > 0 && <p className="mt-2 text-[12px] text-primary-500">Bye: {g.byes.map((id) => teamOf(id)?.name).join(", ")}</p>}
              </div>
            ))}
            {groups.length === 0 && <p className="text-[14px] text-primary-500">No matches yet.</p>}
          </div>
        </section>
      </div>

      <Ctas venue={t.settings.venue ? { id: t.settings.venue.id, slug: t.settings.venue.slug, name: t.settings.venue.name } : null} code={code} />

      {open?.kind === "share" && <ShareSheet name={t.name} url={url} tool={TOOL} onClose={() => setOpen(null)} />}
      {open?.kind === "result" && <ResultSheet t={t} r={open.r} title={titleOf(open.r)} send={send} onClose={() => setOpen(null)} />}
      {open?.kind === "fixture" && <FixtureSheet t={t} r={open.r} order={order} title={open.r ? titleOf(open.r) : "match"} send={send} onClose={() => setOpen(null)} />}
      {open?.kind === "settings" && <SettingsSheet t={t} send={send} onClose={() => setOpen(null)} />}
      {open?.kind === "team" && <TeamSheet team={open.team} send={send} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** The points table: P W L T NR Pts NRR, the places that go through marked. T and NR fold away on the narrowest phones. */
function PointsTable({ res, teams }: { res: Resolution; teams: Team[] }) {
  const byId = new Map(teams.map((x) => [x.id, x]));
  const thin = "hidden min-[360px]:table-cell";
  // Before the first result every team is level: listed as entered, and nobody is marked as going through yet.
  const started = res.table.some((s) => s.played > 0);
  const rows = started ? res.table : [...res.table].sort((a, b) => a.id - b.id);
  const qualify = started ? res.qualify : 0;
  return (
    <div className="rounded-2xl border border-primary-200 bg-white overflow-hidden">
      <div className="overflow-x-auto scrollbar-hide">
        <table className="min-w-full text-[13px] sm:text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-primary-500 border-b border-primary-200 bg-primary-50">
              <th className="sticky left-0 bg-primary-50 pl-3 pr-2 py-2 font-semibold">Team</th>
              {["P", "W", "L", "T", "NR", "Pts", "NRR"].map((h) => (
                <th key={h} className={`px-1.5 sm:px-2 py-2 font-semibold text-right ${h === "Pts" ? "text-primary-900" : ""} ${h === "T" || h === "NR" ? thin : ""} ${h === "NRR" ? "pr-3" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const q = i < qualify;
              return (
                <tr key={s.id} className={`border-b border-primary-100 last:border-0 ${q ? "bg-accent-50/40" : ""}`}>
                  <td className={`sticky left-0 pl-3 pr-2 py-2.5 ${q ? "bg-[#f6fdf8] shadow-[inset_3px_0_0_var(--color-accent-500)]" : "bg-white"}`}>
                    <span className="flex items-center gap-2 max-w-[150px] sm:max-w-[220px]">
                      <span className="w-4 text-right text-[12px] font-bold text-primary-400 tabular-nums shrink-0">{i + 1}</span>
                      <TeamMark team={byId.get(s.id) ?? null} size="sm" />
                      <span className="truncate font-semibold text-primary-900">{s.team}</span>
                    </span>
                  </td>
                  <td className="px-1.5 sm:px-2 py-2.5 text-right tabular-nums">{s.played}</td>
                  <td className="px-1.5 sm:px-2 py-2.5 text-right tabular-nums">{s.won}</td>
                  <td className="px-1.5 sm:px-2 py-2.5 text-right tabular-nums">{s.lost}</td>
                  <td className={`px-1.5 sm:px-2 py-2.5 text-right tabular-nums ${thin}`}>{s.tied}</td>
                  <td className={`px-1.5 sm:px-2 py-2.5 text-right tabular-nums ${thin}`}>{s.nr}</td>
                  <td className="px-1.5 sm:px-2 py-2.5 text-right tabular-nums font-bold text-primary-900">{s.points}</td>
                  <td className={`pl-1.5 pr-3 py-2.5 text-right tabular-nums ${s.nrr != null && s.nrr < 0 ? "text-red-600" : "text-accent-700"}`}>{formatNrr(s.nrr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {res.qualify > 0 && (
        <p className="px-3 py-2 border-t border-primary-100 text-[12px] text-primary-500 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent-500" aria-hidden /> Top {res.qualify} go to the {res.qualify === 4 ? "semi-finals" : "final"}
        </p>
      )}
    </div>
  );
}

function SeriesCard({ res, teams }: { res: Resolution; teams: Team[] }) {
  const s = res.series!;
  return (
    <div className="rounded-2xl bg-white border border-primary-200 p-4 text-center">
      <p className="text-[12px] font-bold uppercase tracking-wide text-primary-500">Series</p>
      <div className="mt-2 flex items-center justify-center gap-4">
        <span className="flex flex-col items-center gap-1 min-w-0 flex-1">
          <TeamMark team={teams[0] ?? null} />
          <span className="text-[14px] font-semibold text-primary-900 truncate max-w-full">{teams[0]?.name}</span>
        </span>
        <span className="font-display text-[40px] leading-none tabular-nums text-primary-900">
          {s.a}
          <span className="text-primary-300 mx-1">-</span>
          {s.b}
        </span>
        <span className="flex flex-col items-center gap-1 min-w-0 flex-1">
          <TeamMark team={teams[1] ?? null} />
          <span className="text-[14px] font-semibold text-primary-900 truncate max-w-full">{teams[1]?.name}</span>
        </span>
      </div>
      <p className="mt-2 text-[13px] text-primary-500">
        {s.leader ? `${s.leader} lead${s.leader.endsWith("s") ? "" : "s"}` : res.played ? "All square" : "No matches yet"}
        {s.tied || s.nr ? ` · ${[s.tied ? `${s.tied} tied` : "", s.nr ? `${s.nr} no result` : ""].filter(Boolean).join(", ")}` : ""}
      </p>
      {res.table.length === 2 && <p className="mt-1 text-[12px] text-primary-400">NRR: {res.table.map((x) => `${x.team} ${formatNrr(x.nrr)}`).join(" · ")}</p>}
    </div>
  );
}

function FixtureCard({ r, title, teamOf, organiser, onResult, onEdit, onScore }: { r: Resolved; title: string; teamOf: (id: number | null) => Team | null; organiser: boolean; onResult: () => void; onEdit: () => void; onScore: () => void }) {
  const f = r.fixture;
  const when = [f.day ? dayLabel(f.day) : null, f.time ? timeLabel(f.time) : null].filter(Boolean).join(", ");
  const live = r.state === "live" && r.live && !r.live.closed;
  const stalled = r.state === "live" && r.live?.closed;
  const playable = r.home !== null && r.away !== null;
  const canScore = organiser && playable && !f.result && (r.state === "scheduled" || stalled || r.live?.status === "off");
  return (
    <article className={`rounded-2xl border bg-white p-3.5 ${live ? "border-red-600/70" : "border-primary-200"}`}>
      <div className="flex items-center gap-2 text-[12px] text-primary-500">
        <span className="font-semibold text-primary-700">{title}</span>
        {when && <span className="truncate">· {when}</span>}
        <span className="ml-auto shrink-0">
          {live ? <LivePill /> : r.state === "done" ? <span className="font-semibold text-accent-700">Result</span> : stalled ? <span className="font-semibold text-amber-700">Paused</span> : null}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {(["a", "b"] as const).map((side) => {
          const id = side === "a" ? r.home : r.away;
          const team = teamOf(id);
          const s = scoreOf(r, side);
          const won = r.state === "done" && ((side === "a" && r.outcome === "a") || (side === "b" && r.outcome === "b"));
          return (
            <div key={side} className="flex items-center gap-2.5 min-h-[32px]">
              <TeamMark team={team} size="sm" />
              <span className={`min-w-0 flex-1 truncate text-[15px] ${won ? "font-bold text-primary-900" : team ? "text-primary-800" : "text-primary-400 italic"}`}>
                {r.seeds && team && <span className="mr-1.5 text-[11px] not-italic font-bold text-primary-400">{r.seeds[side === "a" ? 0 : 1]}</span>}
                {team ? team.name : side === "a" ? r.homeLabel : r.awayLabel}
              </span>
              {s && (
                <span className={`tabular-nums text-[15px] ${won ? "font-bold text-primary-900" : "text-primary-700"}`}>
                  {s.score} <span className="text-[12px] text-primary-400">({s.overs})</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      {r.state === "done" && r.text && <p className="mt-2 text-[13px] font-semibold text-accent-700">{r.text}</p>}
      {live && r.live?.headline && r.live.a && r.live.b && <p className="mt-2 text-[13px] text-primary-600 line-clamp-2">{r.live.headline}</p>}
      {stalled && <p className="mt-2 text-[13px] text-amber-800">The live scorecard stopped updating.</p>}
      {(f.live && (live || (r.state === "done" && r.source === "live"))) || (organiser && playable) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {f.live && (live || (r.state === "done" && r.source === "live")) && (
            <Link href={`/live/${f.live}`} className={`inline-flex items-center gap-1 h-9 px-3 rounded-full text-[13px] font-bold ${live ? "bg-red-600 text-white" : "bg-primary-100 text-primary-800"}`}>
              {live ? "Watch live" : "Scorecard"} <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          )}
          {canScore && (
            <button type="button" onClick={onScore} className="press-tight inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full bg-accent-500 text-white text-[13px] font-bold hover:bg-accent-600">
              <Radio className="w-4 h-4" aria-hidden /> Score live
            </button>
          )}
          {organiser && live && (
            <Link href="/tools/cricket-live-scorer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-primary-200 text-[13px] font-bold text-primary-800">
              Open the scorer
            </Link>
          )}
          {organiser && playable && (
            <button type="button" onClick={onResult} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-primary-200 text-[13px] font-bold text-primary-800 hover:border-accent-500">
              {f.result ? "Edit result" : r.state === "done" ? "Correct result" : "Enter result"}
            </button>
          )}
          {organiser && (
            <button type="button" onClick={onEdit} aria-label={`Edit ${title}`} className="ml-auto inline-flex items-center justify-center w-9 h-9 rounded-full text-primary-500 hover:bg-primary-100">
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : organiser ? (
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={onEdit} aria-label={`Edit ${title}`} className="inline-flex items-center justify-center w-9 h-9 rounded-full text-primary-500 hover:bg-primary-100">
            <Pencil className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </article>
  );
}

/** The playoffs: semi-finals then the final, each place named until the table or the semis fill it. */
function Bracket({
  res,
  teamOf,
  titleOf,
  leagueDone,
  organiser,
  onResult,
  onScore,
  onEdit,
}: {
  res: Resolution;
  teamOf: (id: number | null) => Team | null;
  titleOf: (r: Resolved) => string;
  leagueDone: boolean;
  organiser: boolean;
  onResult: (r: Resolved) => void;
  onScore: (r: Resolved, title: string) => void;
  onEdit: (r: Resolved) => void;
}) {
  const semis = res.fixtures.filter((r) => r.fixture.stage === "semi");
  const finals = res.fixtures.filter((r) => r.fixture.stage === "final");
  const champion = res.champion && "id" in res.champion ? teamOf(res.champion.id) : null;
  const card = (r: Resolved) => <FixtureCard key={r.fixture.id} r={r} title={titleOf(r)} teamOf={teamOf} organiser={organiser} onResult={() => onResult(r)} onEdit={() => onEdit(r)} onScore={() => onScore(r, titleOf(r))} />;
  return (
    <div className="space-y-3">
      {!leagueDone && <p className="text-[13px] text-primary-500">The places fill in from the table once every league match has a result.</p>}
      <div className={semis.length ? "sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3 space-y-3 sm:space-y-0" : ""}>
        {semis.length > 0 && <div className="space-y-2">{semis.map(card)}</div>}
        {semis.length > 0 && (
          <div className="hidden sm:flex flex-col items-center text-primary-300" aria-hidden>
            <span className="w-6 border-t-2 border-primary-200" />
          </div>
        )}
        <div className="space-y-2">
          {finals.map(card)}
          <div className={`rounded-2xl p-3.5 flex items-center gap-3 ${champion || res.champion ? "bg-amber-300 text-amber-950" : "bg-primary-50 text-primary-500 border border-dashed border-primary-300"}`}>
            <Crown className="w-6 h-6 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[12px] font-bold uppercase tracking-wide">Champions</span>
              <span className="block text-[16px] font-bold truncate">{champion ? champion.name : res.champion ? "Title shared" : "To be decided"}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ctas({ venue, code }: { venue: { id: string; slug: string | null; name: string } | null; code?: string }) {
  return (
    <section className="mt-10 space-y-3">
      <div className="rounded-2xl border border-primary-200 bg-white p-4">
        <h2 className="text-[16px] font-bold text-primary-900">Running a tournament yourself?</h2>
        <p className="mt-1 text-[14px] text-primary-600">Set it up in a minute: fixtures made for you, a points table with NRR, every match scored live. Free, one link for everyone.</p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <CtaLink href="/tournament/new" primary>
            Start a live tournament <ArrowRight className="w-4 h-4" aria-hidden />
          </CtaLink>
          <CtaLink href={venue ? turfPath(venue) : "/sport/box-cricket"}>{venue ? (venue.name.length > 22 ? "See the venue" : `About ${venue.name}`) : "Find a box cricket turf"}</CtaLink>
        </div>
      </div>
      {code && (
        <p className="text-center text-[12px] text-primary-500">
          <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Report tournament ${code}`)}`} className="underline underline-offset-2 hover:text-primary-800">
            Report this tournament
          </a>
        </p>
      )}
    </section>
  );
}

function CtaLink({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      onClick={() => trackTool("tool_cta_clicked", TOOL, { href })}
      className={`press-tight inline-flex items-center justify-center gap-2 h-12 px-5 rounded-full text-[15px] font-semibold transition-colors ${primary ? "bg-primary-900 text-white hover:bg-accent-600" : "border-2 border-primary-200 bg-white text-primary-800 hover:border-primary-400"}`}
    >
      {children}
    </Link>
  );
}

