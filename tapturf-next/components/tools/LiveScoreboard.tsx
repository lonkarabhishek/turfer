"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, Play, Plus, Trash2 } from "lucide-react";
import { boardShape, deriveBoard } from "@/lib/board";
import type { Board, BoardSport, BoardView } from "@/lib/board/types";
import { trackTool } from "@/lib/analytics/tools";
import { sportIcon } from "@/components/board/shared";
import { useWatchers } from "@/components/live/useWatchers";
import { useAuth } from "@/components/auth/AuthProvider";
import { askLiveLogin, liveReturn, takeLiveAsk } from "./scorer/liveLogin";
import { ToolCta } from "./ToolCta";
import { SecondaryButton } from "./inputs";
import { Setup, type SetupLive } from "./board/Setup";
import { BoardScreen, TOOL } from "./board/BoardScreen";
import { deleteBoard, loadBoard, loadIndex, metaOf, saveBoard, savePrefs, setCurrent, type BoardIndex, type BoardMeta, type BoardPrefs } from "./board/storage";
import type { ShareLive } from "./scorer/ShareSheet";
import { canKeepLink, linkUrl, readReminder, shortUrl, useLiveSync, type LiveInfo } from "./scorer/live";

/** A live board touched within this long is reopened straight into scoring on reload. */
const RESUME_MS = 12 * 60 * 60 * 1000;
const HISTORY_FLAG = "tapturfBoard";

function when(ts: number, now: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const day = new Date(now);
  if (d.toDateString() === day.toDateString()) return `Today, ${time}`;
  day.setDate(day.getDate() - 1);
  if (d.toDateString() === day.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const urlOf = (info: LiveInfo) => (info.on && info.link ? linkUrl(info.link.code) : null);

/**
 * What a live link sends: the board as saved, stamped with when this copy
 * left, so a follower's clock ticks from the send and not from the last
 * event (an undo or a late send would put it behind). Read right before
 * each PUT, retries and keepalive flushes included. Cricket ids ("m...")
 * have no board here, so they are skipped.
 */
const loadForLive = (id: string) => {
  const b = loadBoard(id);
  return b ? { ...b, sentAt: Date.now() } : null;
};

/**
 * Live Scoreboard for football, basketball, the racquet sports,
 * volleyball and any other sport. Like the Live Cricket Scorer: the page
 * shows the setup (or the match to carry on) and the saved matches;
 * scoring opens full screen and Back closes it. Every tap is saved to this
 * browser, and sent to the match's live link when one is on (liveLinks:
 * the site has them; without, none of it shows).
 */
export function LiveScoreboard({ cta, liveLinks = false }: { cta: { label: string; href: string }; liveLinks?: boolean }) {
  const [hydrated, setHydrated] = useState(false);
  const [index, setIndex] = useState<BoardIndex>({ v: 1, current: null, list: [] });
  const [board, setBoard] = useState<Board | null>(null);
  const [open, setOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [now, setNow] = useState(0);
  /** From a game reminder (?sport, &name, &venue, &from=game): start a new match there rather than resume. */
  const [prefill, setPrefill] = useState<{ sport: BoardSport | null; name: string; venue: string; live: boolean }>({ sport: null, name: "", venue: "", live: false });
  /** The link last copied from the page card: one turned on since shows "Copy link" again. */
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const live = useLiveSync(liveLinks, { load: loadForLive });
  const auth = useAuth();
  /** Back from the live link login (?live=1): the board whose link to turn on once auth has settled. */
  const loginAsk = useRef<string | null>(null);
  // The eye count by the LIVE pill: only while scoring a match whose link is on. The scorer listens, never counts in.
  const watchLink = liveLinks && open && board ? live.info(board.id) : null;
  const watchers = useWatchers(watchLink?.on && watchLink.link ? watchLink.link.code : null, { track: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const openScorer = () => {
    setOpen(true);
    try {
      const st = (window.history.state ?? {}) as Record<string, unknown>;
      if (!st[HISTORY_FLAG]) window.history.pushState({ ...st, [HISTORY_FLAG]: true }, "");
    } catch {
      /* history not available: Back just leaves the page, the match is saved anyway */
    }
  };
  const closeScorer = () => {
    const st = (typeof window !== "undefined" ? window.history.state : null) as Record<string, unknown> | null;
    if (st?.[HISTORY_FLAG]) window.history.back();
    else setOpen(false);
  };

  useEffect(() => {
    // Read here, not with useSearchParams: the page is static.
    const { venue, fromGame, sport, name, rest: afterReminder } = readReminder(window.location.search);
    const { returning, rest } = liveReturn(afterReminder);
    trackTool("tool_opened", TOOL, fromGame ? { from: "game", ...(sport ? { sport } : {}) } : {});
    const reminder = !!(venue || fromGame || sport);
    // Restore after mount so the server and first client render agree.
    const t = setTimeout(() => {
      // Take the reminder out of the address, so a reload mid-match resumes it. Here, not above, so Strict Mode's
      // second run still reads it; and before openScorer, whose pushState would carry it on.
      if (reminder || name || returning) {
        try {
          window.history.replaceState(window.history.state, "", window.location.pathname + rest + window.location.hash);
        } catch {
          /* history not available: a reload just offers the new match again */
        }
      }
      const ix = loadIndex();
      const t0 = Date.now();
      setNow(t0);
      setIndex(ix);
      if (reminder) {
        setPrefill({ sport, name, venue, live: fromGame });
        setNewOpen(true);
      }
      const ask = returning ? takeLiveAsk("board", t0) : null;
      loginAsk.current = ask;
      const b = ix.current ? loadBoard(ix.current) : null;
      if (b) {
        setBoard(b);
        const meta = ix.list.find((x) => x.id === b.id);
        // A login return opens its own board below.
        if (!ask && !reminder && meta && meta.status === "live" && t0 - meta.updatedAt < RESUME_MS) openScorer();
      }
      setHydrated(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Back button closes the scorer instead of leaving the page.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state ?? {}) as Record<string, unknown>;
      setOpen(!!st[HISTORY_FLAG]);
      setNow(Date.now());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Another tab scored on the same match: take its copy, so the next tap here does not wipe those points.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && !e.key.startsWith("tapturf_board")) return;
      setIndex(loadIndex());
      setBoard((cur) => (cur ? (loadBoard(cur.id) ?? cur) : cur));
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

  const persist = (b: Board, v?: BoardView) => {
    const view = v ?? deriveBoard(b);
    const saved = saveBoard(b, metaOf(b, view, Date.now()));
    setIndex(saved.index);
    // Old boards dropped to make room can no longer be opened to turn their links off: those go off now.
    for (const id of saved.dropped) live.remove(id);
    // After the save: a live send reads the board from storage.
    live.changed(b.id, boardShape(view));
  };

  const startLink = async (id: string) => {
    // Sharing needs a login (Google first, then phone); scoring does not. The board is saved, so the trip loses nothing.
    if (!auth.user) {
      trackTool("tool_action", TOOL, { action: "live_link_login" });
      askLiveLogin("board", id);
      return;
    }
    const fault = await live.start(id);
    trackTool("tool_action", TOOL, fault ? { action: "live_link_failed", reason: fault } : { action: "live_link_on" });
  };

  const stopLink = async (id: string) => {
    if (await live.stop(id)) trackTool("tool_action", TOOL, { action: "live_link_off" });
  };

  const liveFor = (id: string): ShareLive => {
    const info = live.info(id);
    return { info, url: urlOf(info), onStart: () => void startLink(id), onStop: () => void stopLink(id), loginFirst: !auth.user };
  };

  const onChange = (b: Board) => {
    setBoard(b);
    persist(b);
  };

  const start = (b: Board, opts: SetupLive, prefs: BoardPrefs) => {
    const prev = board;
    setBoard(b);
    persist(b);
    savePrefs(b.id, prefs);
    setNewOpen(false);
    // The start carries the match's live link code for the admin's list of tool users (never sent to GA),
    // so with a new link it is tracked once the link is on, or isn't.
    const used = { action: "match_started", sport: b.sport, live: liveLinks && opts.on };
    const trackStart = () => {
      const code = live.codeNow(b.id);
      trackTool("tool_used", TOOL, code ? { ...used, code } : used);
    };
    if (liveLinks && opts.on) {
      if (opts.keep && prev && live.move(prev.id, b.id)) {
        trackStart();
        trackTool("tool_action", TOOL, { action: "live_link_kept" });
      } else void startLink(b.id).then(trackStart, trackStart);
    } else trackStart();
    openScorer();
  };

  const resume = (id: string) => {
    const b = id === board?.id ? board : loadBoard(id);
    if (!b) {
      setIndex(deleteBoard(id));
      return;
    }
    setBoard(b);
    setIndex(setCurrent(id));
    openScorer();
  };

  // Back from the login: open that board and turn its link on. Logged in or not, the ask is used up.
  const loginDone = useRef<(id: string) => void>(() => {});
  useEffect(() => {
    loginDone.current = (id: string) => {
      if (!auth.user || !loadBoard(id)) return;
      resume(id);
      void startLink(id);
    };
  });
  useEffect(() => {
    const id = loginAsk.current;
    if (!hydrated || !id || auth.loading) return;
    loginAsk.current = null;
    loginDone.current(id);
  }, [hydrated, auth.loading]);

  const remove = (meta: BoardMeta) => {
    // Live or done: once the match is gone nothing here could turn its link off.
    const stopsLink = liveLinks && live.info(meta.id).on;
    if (!window.confirm(`Delete ${meta.teamA} vs ${meta.teamB}? This cannot be undone.${stopsLink ? " Its live link turns off too." : ""}`)) return;
    live.remove(meta.id);
    setIndex(deleteBoard(meta.id));
    if (board?.id === meta.id) setBoard(null);
  };

  const newMatch = () => {
    setNewOpen(true);
    closeScorer();
  };

  if (!hydrated) {
    return <div className="rounded-3xl border border-primary-200 bg-white p-6 shadow-soft min-h-[420px]" aria-busy="true" />;
  }

  const view = board ? deriveBoard(board) : null;
  const inPlay = view?.status === "live";
  // The match in progress has its own card above; finished ones stay listed so they can be deleted.
  const others = index.list.filter((m) => !(inPlay && m.id === board?.id));
  const cardLink = liveLinks && board ? live.info(board.id) : null;
  const cardUrl = cardLink ? urlOf(cardLink) : null;
  const copied = cardUrl !== null && copiedUrl === cardUrl;
  const keepFrom = view && canKeepLink(cardLink?.link, now) ? `${view.teams.a.name} vs ${view.teams.b.name}` : null;
  const initialSport = prefill.sport ?? index.list[0]?.sport ?? "football";

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      trackTool("tool_cta_clicked", TOOL, { href: "share", how: "live_copy", status: view?.status ?? "none" });
    } catch {
      setCopiedUrl(null);
    }
  };

  return (
    <div ref={rootRef} className="scroll-mt-24 rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      {board && view && (
        <div className="mb-5 rounded-2xl bg-primary-900 text-white p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">{inPlay ? "Match in progress" : "Last match"}</p>
          <p className="mt-1 text-[15px] text-white/80 truncate">
            <span aria-hidden>{sportIcon(view.sport)} </span>
            {view.sportName}: {view.teams.a.name} vs {view.teams.b.name}
          </p>
          <p className="text-[22px] font-bold leading-tight">{view.status === "done" && view.result ? view.result.text : view.headline}</p>
          {cardUrl && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white/10 pl-3 pr-1 py-1">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold">Live link on</span>
                <span className="block text-[12px] text-white/70 truncate">{shortUrl(cardUrl)}</span>
              </span>
              <button type="button" onClick={() => copyLink(cardUrl)} className="press-tight shrink-0 inline-flex items-center gap-1.5 h-12 px-4 rounded-full bg-white/15 text-[14px] font-bold hover:bg-white/25">
                {copied ? <Check className="w-4 h-4" aria-hidden /> : <Link2 className="w-4 h-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
              </button>
              <span className="sr-only" aria-live="polite">
                {copied ? "Link copied" : ""}
              </span>
            </div>
          )}
          <div className="mt-3 flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => resume(board.id)} className="press-tight inline-flex items-center justify-center gap-2 h-14 px-6 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
              <Play className="w-5 h-5" aria-hidden /> {inPlay ? "Continue scoring" : "Open the scoreboard"}
            </button>
          </div>
        </div>
      )}

      {board && inPlay && !newOpen ? (
        <SecondaryButton onClick={() => setNewOpen(true)} className="w-full">
          <Plus className="w-4 h-4" aria-hidden /> Start a new match instead
        </SecondaryButton>
      ) : (
        <div>
          {board && <h2 className="text-[18px] font-bold text-primary-900 mb-3">New match</h2>}
          <Setup onStart={start} initial={{ sport: initialSport, name: prefill.name, venue: prefill.venue }} live={liveLinks ? { on: prefill.live, keepFrom, loginFirst: !auth.user } : undefined} />
        </div>
      )}

      {others.length > 0 && (
        <section className="mt-8" aria-labelledby="sb-matches">
          <h2 id="sb-matches" className="text-[16px] font-bold text-primary-900 mb-2">
            Saved matches
          </h2>
          <ul className="divide-y divide-primary-100 rounded-2xl border border-primary-200">
            {others.map((m) => (
              <li key={m.id} className="flex items-center gap-2 pl-3 pr-2 py-2">
                <span className="shrink-0 w-8 text-center text-[20px]" aria-hidden>
                  {sportIcon(m.sport)}
                </span>
                <button type="button" onClick={() => resume(m.id)} className="flex-1 min-w-0 text-left py-1">
                  <span className="block text-[15px] font-semibold text-primary-900 truncate">
                    {m.teamA} vs {m.teamB}
                  </span>
                  <span className="block text-[13px] text-primary-500 truncate">
                    {m.status === "live" ? "In progress: " : ""}
                    {m.headline} · {when(m.updatedAt, now)}
                  </span>
                </button>
                <button type="button" onClick={() => resume(m.id)} className="shrink-0 h-12 px-3 rounded-full text-[14px] font-bold text-accent-700 hover:bg-accent-50">
                  {m.status === "live" ? "Resume" : "View"}
                </button>
                <button type="button" onClick={() => remove(m)} aria-label={`Delete ${m.teamA} vs ${m.teamB}`} className="shrink-0 w-12 h-12 inline-flex items-center justify-center rounded-full text-primary-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-primary-500">{liveLinks ? "Kept in this browser only, unless you turn on a live link. Clearing site data removes them." : "Kept in this browser only. Clearing site data removes them."}</p>
        </section>
      )}

      <ToolCta tool={TOOL} label={cta.label} href={cta.href} />

      {open && board && <BoardScreen key={board.id} board={board} onChange={onChange} onExit={closeScorer} onNewMatch={newMatch} live={liveLinks ? liveFor(board.id) : undefined} watchers={watchers} />}
    </div>
  );
}
