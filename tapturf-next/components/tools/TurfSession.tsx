"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { apply, derive, newMatch, toScorecard, type Match, type MatchView } from "@/lib/cricket/scoring";
import { trackTool } from "@/lib/analytics/tools";
import { tournamentUrl } from "@/lib/tournament/types";
import { getGameById, getGameParticipants } from "@/lib/queries/games";
import { formatGameDay, formatTimeRange, gameVenue } from "@/lib/utils/game";
import { sportLabel } from "@/lib/utils/sport";
import { prefillFromGame, type GameAsk, type Prefill } from "@/lib/turfSession/names";
import { addScored, applyChanges, battingFirstFor, current, endSession, nextSetup, recordFinal, recordScored, removeMatch, reopen, replaceCurrent, newSession, type Changes, type FinalInput, type NewSession } from "@/lib/turfSession/session";
import { tally } from "@/lib/turfSession/tally";
import { dayLabel } from "@/lib/turfSession/plan";
import { canStore, clearAsk, forget, keep, loadAsk, loadSessions, saveSessions, sessionForGame, STORE_KEY, type SessionStore } from "@/lib/turfSession/store";
import type { Session, SessionMatch, Side, SideKey } from "@/lib/turfSession/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { ScoringScreen } from "./scorer/ScoringScreen";
import { ConfirmSheet } from "./scorer/ShareSheet";
import { Sheet } from "./scorer/ui";
import { autoPicks, stamp } from "./scorer/logic";
import { deleteMatch, loadIndex, loadMatch, metaOf, saveMatch, setCurrent } from "./scorer/storage";
import { writeHandoff } from "./scorer/handoff";
import { SessionSetup, type GameStrip } from "./session/SessionSetup";
import { SessionHub } from "./session/SessionHub";
import { SessionSummary, SESSION_TOOL } from "./session/SessionSummary";
import { FinalScoreSheet } from "./session/FinalScoreSheet";
import { TeamsSheet } from "./session/TeamsSheet";
import { useSessionSync } from "./session/useSessionSync";
import { useWakeLock } from "./session/useWakeLock";

/** A session touched within this long reopens straight into the match being played. */
const RESUME_MS = 12 * 60 * 60 * 1000;
const HISTORY_FLAG = "tapturfSession";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY: SessionStore = { v: 1, current: null, list: [] };

type Screen = "setup" | "hub" | "summary";
type SheetState =
  | null
  | { k: "final"; n: number; edit: SessionMatch | null; battedFirst: SideKey }
  | { k: "teams" }
  | { k: "end"; n: number; line: string }
  | { k: "replace"; line: string }
  | { k: "delete"; s: Session };

const other = (k: SideKey): SideKey => (k === "a" ? "b" : "a");
const shortTally = (s: Session) => {
  const t = tally(s);
  return `${s.sides.a.name} ${t.a}-${t.b} ${s.sides.b.name}`;
};

/** The scorer's copy of a match, saved without making it the Live Cricket Scorer's current match. */
function saveScorer(m: Match, v: MatchView) {
  const prev = loadIndex().current;
  saveMatch(m, metaOf(m, v, Date.now()));
  setCurrent(prev);
}

/** A new scorer match for match n; in quick mode its openers and bowler are in already, so it opens on the pad. */
function makeMatch(s: Session, n: number, battingFirst: SideKey): Match {
  let m = newMatch(nextSetup(s, { n, battingFirst }));
  if (!s.pick) {
    const at = Date.now();
    for (const e of stamp(autoPicks(m), at)) m = apply(m, e);
  }
  return m;
}

/** The game, where it is and who joined, as the game page would hand it over. */
async function readGame(id: string): Promise<GameAsk | null> {
  const [{ data: game }, { data: people }] = await Promise.all([getGameById(id), getGameParticipants(id)]);
  if (!game) return null;
  const where = gameVenue(game);
  return {
    game: { id: game.id, sport: game.sport, date: game.date, start: game.start_time, end: game.end_time, spots: game.max_players },
    venue: { name: where?.name ?? "", turf: where?.listed && where.id ? { id: where.id, slug: where.slug, name: where.name, area: where.area } : null },
    names: people.map((p) => p.name ?? "").filter(Boolean),
  };
}

/** Take ?game and ?local out of the address once used, so a reload carries on with the session. */
function dropQuery() {
  try {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("game") && !q.has("local")) return;
    q.delete("game");
    q.delete("local");
    const rest = q.toString();
    window.history.replaceState(window.history.state, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
  } catch {
    /* ignore */
  }
}

const stripLine = (ask: GameAsk) => [sportLabel(ask.game.sport), [formatGameDay(ask.game.date).plain, formatTimeRange(ask.game.start, ask.game.end)].filter(Boolean).join(", "), ask.venue.name].filter(Boolean).join(" · ");

/**
 * The Turf Session Scorer: several short matches in one turf slot between
 * the same two sides, and the running result. Setup, then each match on
 * the Live Cricket Scorer's own scoring screen (ball by ball, or just its
 * final score typed in), the session's hub between matches, and the
 * summary to share at the end. Everything is kept on this phone first
 * (lib/turfSession/store.ts); a live link is a live tournament
 * (session/useSessionSync.ts). ?game=<id> fills the setup in from a game
 * (the game page's hand-off, else a read of the game); &local=1 keeps the
 * session off the game page.
 */
export function TurfSession({ cta, liveLinks = false }: { cta: { label: string; href: string }; liveLinks?: boolean }) {
  const router = useRouter();
  const auth = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [store, setStore] = useState<SessionStore>(EMPTY);
  const storeRef = useRef<SessionStore>(EMPTY);
  const [screen, setScreen] = useState<Screen>("setup");
  const [match, setMatch] = useState<Match | null>(null);
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [strip, setStrip] = useState<GameStrip>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [flipNext, setFlipNext] = useState(false);
  const [sameTeams, setSameTeams] = useState<{ a: Side; b: Side } | null>(null);
  const [origin, setOrigin] = useState("https://www.tapturf.in");
  const [setupKey, setSetupKey] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const session = store.current ? (store.list.find((s) => s.id === store.current) ?? null) : null;

  const commitStore = useCallback((next: SessionStore) => {
    storeRef.current = next;
    setStore(next);
    setStorageOk(saveSessions(next) && canStore());
  }, []);

  /** Change one session (by id: an answer from the live link may come after the screen moved on) and keep it. */
  const mutate = useCallback(
    (id: string, fn: (s: Session) => Session) => {
      const prev = storeRef.current;
      const s = prev.list.find((x) => x.id === id);
      if (!s) return;
      const next = fn(s);
      if (next === s) return;
      commitStore(keep(prev, next, prev.current === id));
    },
    [commitStore],
  );

  const sync = useSessionSync(liveLinks ? session : null, mutate, auth.user?.id ?? null);
  const liveUrl = session?.live.code ? tournamentUrl(origin, session.live.code) : null;

  const openScorer = useCallback(() => {
    setOpen(true);
    try {
      const st = (window.history.state ?? {}) as Record<string, unknown>;
      if (!st[HISTORY_FLAG]) window.history.pushState({ ...st, [HISTORY_FLAG]: true }, "");
    } catch {
      /* no history: Back just leaves the page, the match is saved anyway */
    }
  }, []);
  const closeScorer = () => {
    const st = (typeof window !== "undefined" ? window.history.state : null) as Record<string, unknown> | null;
    if (st?.[HISTORY_FLAG]) window.history.back();
    else setOpen(false);
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const gameId = q.get("game");
    const local = q.get("local") === "1";
    const fromGame = !!gameId && UUID.test(gameId);
    trackTool("tool_opened", SESSION_TOOL, { from: fromGame ? "game" : "none" });
    let alive = true;
    const t = setTimeout(() => {
      const st = loadSessions();
      storeRef.current = st;
      setStore(st);
      setStorageOk(canStore());
      setOrigin(window.location.origin);
      const now = Date.now();
      const cur = st.current ? st.list.find((s) => s.id === st.current) ?? null : null;
      // Straight back into the match only where the scorer was open (a reload, or a tab the phone killed and
      // restored, keeps that history entry), or when asked (Continue scoring on the game page). Coming back to
      // the page itself (Back from the scorer can mount it again) lands on the hub.
      const wasScoring = !!((window.history.state ?? {}) as Record<string, unknown>)[HISTORY_FLAG];
      const resume = (s: Session, open = wasScoring) => {
        if (s.ended) return setScreen("summary");
        setScreen("hub");
        const c = current(s);
        const m = c?.matchId ? loadMatch(c.matchId) : null;
        if (open && c && m && now - s.updatedAt < RESUME_MS) {
          setMatch(m);
          openScorer();
        }
      };
      if (fromGame) {
        const id = gameId!.toLowerCase();
        const mine = local ? null : sessionForGame(st, id);
        if (mine) {
          const next = keep(st, mine, true);
          storeRef.current = next;
          setStore(next);
          dropQuery();
          resume(mine, true);
          setHydrated(true);
          return;
        }
        const fill = (ask: GameAsk) => {
          if (!alive) return;
          const p = prefillFromGame(ask, Date.now());
          setPrefill(local ? { ...p, game: null } : p);
          setStrip({ state: "ok", line: stripLine(ask) });
          setSetupKey((k) => k + 1);
        };
        const ask = loadAsk(id, now);
        if (ask) fill(ask);
        else {
          setStrip({ state: "loading", line: "" });
          void readGame(id)
            .then((g) => (g ? fill(g) : alive && setStrip({ state: "failed", line: "" })))
            .catch(() => alive && setStrip({ state: "failed", line: "" }));
        }
        if (cur && !cur.ended && cur.matches.length) {
          setScreen("hub");
          setSheet({ k: "replace", line: shortTally(cur) });
        } else setScreen("setup");
        // An ended session stays in Past sessions; one never played goes.
        if (cur && (cur.ended || !cur.matches.length)) {
          const next = cur.matches.length ? { ...st, current: null } : forget(st, cur.id);
          storeRef.current = next;
          setStore(next);
        }
        setHydrated(true);
        return;
      }
      if (cur) resume(cur);
      else setScreen("setup");
      setHydrated(true);
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [openScorer]);

  // Back closes the scorer instead of leaving the page.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setOpen(!!((e.state ?? {}) as Record<string, unknown>)[HISTORY_FLAG]);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Another tab changed the session or scored on the match: take its copy, so the next tap here keeps its balls.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== STORE_KEY && !e.key.startsWith("tapturf_scorer")) return;
      const st = loadSessions();
      storeRef.current = { ...st, current: storeRef.current.current };
      setStore(storeRef.current);
      setMatch((m) => (m ? (loadMatch(m.id) ?? m) : m));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // No page scroll behind the full-screen scorer; back on the page, land on the tool.
  useEffect(() => {
    if (!open) {
      if (wasOpen.current) rootRef.current?.scrollIntoView({ block: "start" });
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, [open]);

  const view = useMemo(() => (match ? derive(match) : null), [match]);
  useWakeLock(open && view?.status === "live");

  /* ---------------------------------------------------------------- */
  /* Moves                                                            */
  /* ---------------------------------------------------------------- */

  const latest = () => (storeRef.current.current ? (storeRef.current.list.find((s) => s.id === storeRef.current.current) ?? null) : null);
  const nextFirstOf = (s: Session) => {
    const c = current(s);
    if (c) return c.battedFirst;
    const base = battingFirstFor(s);
    return flipNext ? other(base) : base;
  };

  const startMatch = (s: Session, action: "match_started" | "next_match") => {
    const n = s.matches.length + 1;
    const bf = nextFirstOf(s);
    const m = makeMatch(s, n, bf);
    saveScorer(m, derive(m));
    mutate(s.id, (x) => addScored(x, m.id, bf, Date.now()));
    setFlipNext(false);
    setMatch(m);
    setScreen("hub");
    trackTool("tool_action", SESSION_TOOL, { action, n });
    openScorer();
  };

  const begin = (x: NewSession, how: "balls" | "final") => {
    const s = newSession(x, Date.now());
    commitStore(keep(storeRef.current, s, true));
    dropQuery();
    clearAsk();
    trackTool("tool_used", SESSION_TOOL, { action: "session_started", format: x.format, overs: x.overs, named: x.sides.a.players.length + x.sides.b.players.length > 0, from: x.game ? "game" : "none" });
    setPrefill(null);
    setStrip(null);
    if (how === "balls") startMatch(s, "match_started");
    else {
      setScreen("hub");
      setSheet({ k: "final", n: 1, edit: null, battedFirst: s.firstBat });
    }
  };

  const onScored = (m: Match) => {
    setMatch(m);
    const v = derive(m);
    saveScorer(m, v);
    const s = latest();
    if (!s) return;
    mutate(s.id, (x) => {
      const sm = x.matches.find((y) => y.matchId === m.id);
      return sm ? recordScored(x, sm.n, v, Date.now()) : x;
    });
  };

  const openMatch = (sm: SessionMatch) => {
    if (!sm.matchId) return;
    const m = loadMatch(sm.matchId);
    if (!m) return;
    setMatch(m);
    openScorer();
  };

  const swapNext = () => {
    const s = latest();
    if (!s) return;
    const c = current(s);
    if (c && c.balls === 0) {
      const bf = other(c.battedFirst);
      const m = makeMatch(s, c.n, bf);
      saveScorer(m, derive(m));
      const r = replaceCurrent(s, m.id, bf, Date.now());
      if (r.dropped) deleteMatch(r.dropped);
      mutate(s.id, () => r.session);
      if (match?.id === r.dropped) setMatch(m);
      return;
    }
    if (!c) setFlipNext((f) => !f);
  };

  const saveFinal = (x: FinalInput) => {
    const s = latest();
    if (!s) return;
    const r = recordFinal(s, x, Date.now());
    if (r.dropped) deleteMatch(r.dropped);
    mutate(s.id, () => r.session);
    setFlipNext(false);
    setSheet(null);
    trackTool("tool_action", SESSION_TOOL, { action: "match_typed", n: r.n });
  };

  const saveTeams = (ch: Changes) => {
    const s = latest();
    if (!s) return;
    let s2 = applyChanges(s, ch, Date.now());
    const c = current(s2);
    if (c && c.balls === 0) {
      const m = makeMatch(s2, c.n, c.battedFirst);
      saveScorer(m, derive(m));
      const r = replaceCurrent(s2, m.id, c.battedFirst, Date.now());
      if (r.dropped) deleteMatch(r.dropped);
      s2 = r.session;
    }
    mutate(s.id, () => s2);
    setSheet(null);
  };

  const remove = (sm: SessionMatch) => {
    const s = latest();
    if (!s) return;
    const r = removeMatch(s, sm.n, Date.now());
    if (r.removed?.kind === "balls" && r.removed.balls === 0 && r.removed.matchId) deleteMatch(r.removed.matchId);
    mutate(s.id, () => r.session);
  };

  const finish = () => {
    const s = latest();
    if (!s) return;
    const r = endSession(s, Date.now());
    for (const d of r.dropped) if (d.kind === "balls" && d.balls === 0 && d.matchId) deleteMatch(d.matchId);
    mutate(s.id, () => r.session);
    setSheet(null);
    setScreen("summary");
    trackTool("tool_action", SESSION_TOOL, { action: "session_ended", matches: r.session.matches.length });
  };

  const askEnd = () => {
    const s = latest();
    if (!s) return;
    const c = current(s);
    const m = c?.matchId ? (match?.id === c.matchId ? match : loadMatch(c.matchId)) : null;
    if (c && c.balls > 0 && m) {
      const inn = derive(m).current;
      setSheet({ k: "end", n: c.n, line: `${inn.battingName} ${inn.score} after ${inn.overs} overs.` });
      return;
    }
    finish();
  };

  const newOne = () => {
    const s = latest();
    setSameTeams(s ? { a: { ...s.sides.a }, b: { ...s.sides.b } } : null);
    commitStore({ ...storeRef.current, current: null });
    setPrefill(null);
    setStrip(null);
    setSetupKey((k) => k + 1);
    setScreen("setup");
  };

  const resultCard = (v: MatchView) => {
    writeHandoff(toScorecard(v), Date.now());
    trackTool("tool_cta_clicked", SESSION_TOOL, { href: "/tools/cricket-scorecard-maker", status: v.status });
    const flagged = !!(window.history.state as Record<string, unknown> | null)?.[HISTORY_FLAG];
    setOpen(false);
    const url = "/tools/cricket-scorecard-maker?from=live-scorer";
    if (flagged) router.replace(url);
    else router.push(url);
  };

  if (!hydrated) return <div className="rounded-3xl border border-primary-200 bg-white p-6 shadow-soft min-h-[420px]" aria-busy="true" />;

  const kept = new Set(loadIndex().list.map((x) => x.id));
  const scoreKept = (m: SessionMatch) => !!m.matchId && kept.has(m.matchId);
  const cur = session ? current(session) : null;
  const progress = (() => {
    if (!cur?.matchId || !cur.balls) return null;
    const m = match?.id === cur.matchId ? match : loadMatch(cur.matchId);
    return m ? derive(m).current.summary : null;
  })();
  const past = store.list.filter((s) => s.id !== session?.id);
  const scoringSm = session && match ? session.matches.find((x) => x.matchId === match.id) : null;
  const isLast = !!scoringSm && !!session && scoringSm.n === session.matches.length && !session.ended;
  const nextAction = isLast && view?.status === "done" ? { label: "Next match", onClick: () => startMatch(latest()!, "next_match") } : undefined;

  return (
    <div ref={rootRef} className="scroll-mt-24 rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      {screen === "setup" || !session ? (
        <SessionSetup
          key={setupKey}
          prefill={prefill}
          strip={strip}
          sameTeams={sameTeams}
          onBlank={() => {
            dropQuery();
            setPrefill(null);
            setStrip(null);
            setSetupKey((k) => k + 1);
          }}
          onStart={begin}
        />
      ) : screen === "summary" ? (
        <SessionSummary
          session={session}
          liveUrl={liveUrl}
          cta={cta}
          onNew={newOne}
          onReopen={() => {
            mutate(session.id, (s) => reopen(s, Date.now()));
            setScreen("hub");
          }}
          onOpenMatch={openMatch}
          scoreKept={scoreKept}
        />
      ) : (
        <SessionHub
          session={session}
          progress={progress}
          nextFirst={nextFirstOf(session)}
          storageOk={storageOk}
          live={{
            phase: sync.phase,
            waiting: sync.waiting,
            ready: liveLinks && sync.ready,
            url: liveUrl,
            onStart: () => {
              trackTool("tool_action", SESSION_TOOL, { action: "live_link" });
              sync.start();
            },
            onRetry: sync.retry,
            onLogin: auth.login,
          }}
          onContinue={() => cur?.matchId && openMatch(cur)}
          onStartNext={() => startMatch(session, "next_match")}
          onSwap={swapNext}
          onTypeFinal={() => {
            const n = cur && cur.balls === 0 ? cur.n : session.matches.length + 1;
            setSheet({ k: "final", n, edit: null, battedFirst: nextFirstOf(session) });
          }}
          onTeams={() => setSheet({ k: "teams" })}
          onOpenMatch={openMatch}
          onEditFinal={(m) => setSheet({ k: "final", n: m.n, edit: m, battedFirst: m.battedFirst })}
          onRemove={remove}
          onEnd={askEnd}
          scoreKept={scoreKept}
        />
      )}

      {screen === "setup" && past.length > 0 && (
        <section className="mt-8" aria-labelledby="ts-past">
          <h2 id="ts-past" className="text-[16px] font-bold text-primary-900 mb-2">
            Past sessions
          </h2>
          <ul className="divide-y divide-primary-100 rounded-2xl border border-primary-200">
            {past.map((s) => (
              <li key={s.id} className="flex items-center gap-2 pl-4 pr-2 py-2">
                <button
                  type="button"
                  onClick={() => {
                    commitStore(keep(storeRef.current, s, true));
                    setScreen(s.ended ? "summary" : "hub");
                  }}
                  className="flex-1 min-w-0 text-left py-1"
                >
                  <span className="block text-[15px] font-semibold text-primary-900 truncate">
                    {dayLabel(s.day)} · {shortTally(s)}
                  </span>
                  <span className="block text-[13px] text-primary-600 truncate">{s.ended ? `${s.matches.length} match${s.matches.length === 1 ? "" : "es"}` : "Not ended"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitStore(keep(storeRef.current, s, true));
                    setScreen(s.ended ? "summary" : "hub");
                  }}
                  className="shrink-0 h-11 px-3 rounded-full text-[14px] font-bold text-accent-700 hover:bg-accent-50"
                >
                  View
                </button>
                <button type="button" onClick={() => setSheet({ k: "delete", s })} aria-label={`Delete the session of ${dayLabel(s.day)}`} className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full text-primary-500 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-primary-600">Kept on this phone. Clearing your browser&apos;s site data removes them.</p>
        </section>
      )}

      {sheet?.k === "final" && session && <FinalScoreSheet session={session} n={sheet.n} edit={sheet.edit} battedFirst={sheet.battedFirst} onSave={saveFinal} onClose={() => setSheet(null)} />}
      {sheet?.k === "teams" && session && <TeamsSheet session={session} emptyNow={!!cur && cur.balls === 0} n={cur?.n ?? session.matches.length + 1} onSave={saveTeams} onClose={() => setSheet(null)} />}
      {sheet?.k === "end" && (
        <Sheet title={`Match ${sheet.n} isn't finished`} onClose={() => setSheet(null)}>
          <p className="text-[15px] text-primary-800 leading-relaxed">{sheet.line}</p>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                if (cur?.matchId) openMatch(cur);
              }}
              className="press-tight h-14 rounded-full bg-accent-500 text-white text-[16px] font-bold hover:bg-accent-600"
            >
              Keep playing
            </button>
            <button type="button" onClick={finish} className="press-tight h-12 rounded-full border-2 border-primary-200 text-[15px] font-bold text-primary-800">
              End without match {sheet.n}
            </button>
          </div>
        </Sheet>
      )}
      {sheet?.k === "replace" && (
        <ConfirmSheet
          title={`End the session with ${sheet.line} first?`}
          body="It stays in Past sessions with its summary."
          confirm="End it and start new"
          onConfirm={() => {
            const s = latest();
            if (s) {
              const r = endSession(s, Date.now());
              for (const d of r.dropped) if (d.kind === "balls" && d.balls === 0 && d.matchId) deleteMatch(d.matchId);
              commitStore({ ...keep(storeRef.current, r.session, false), current: null });
            }
            setSheet(null);
            setScreen("setup");
          }}
          onClose={() => {
            dropQuery();
            setPrefill(null);
            setStrip(null);
            setSheet(null);
          }}
        />
      )}
      {sheet?.k === "delete" && (
        <ConfirmSheet
          title={`Delete this session and its ${sheet.s.matches.length} match${sheet.s.matches.length === 1 ? "" : "es"}?`}
          body="This can't be undone."
          confirm="Delete"
          danger
          onConfirm={() => {
            commitStore(forget(storeRef.current, sheet.s.id));
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {open && match && (
        <ScoringScreen
          key={match.id}
          match={match}
          onChange={onScored}
          onExit={closeScorer}
          onNewMatch={() => (isLast ? startMatch(latest()!, "next_match") : closeScorer())}
          onResultCard={resultCard}
          next={nextAction}
          autoPick={!session?.pick}
        />
      )}
    </div>
  );
}
