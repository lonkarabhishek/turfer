"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, Loader2, LogIn, Share2 } from "lucide-react";
import { derive, toScorecard, type MatchView } from "@/lib/cricket/scoring";
import { clockMs, deriveBoard } from "@/lib/board";
import type { BoardSport } from "@/lib/board/types";
import { trackTool } from "@/lib/analytics/tools";
import { useAuth } from "@/components/auth/AuthProvider";
import { CONTACT_EMAIL } from "@/lib/contact";
import { sportBySlug, venueWord } from "@/lib/sports";
import { isLiveBoard, sanitizeLive, type LiveMatch } from "@/lib/live/match";
import { liveUrl, type LiveGetResponse } from "@/lib/live/types";
import { MatchTabs, ScoreHeader } from "@/components/tools/scorer/MatchHeader";
import { writeHandoff } from "@/components/tools/scorer/handoff";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardTabs } from "@/components/board/BoardTabs";
import { accessOf, ago, boardNow, boardPause, clockNow, followLoginHref, freshness, joinClock, liveBadgeOn, pauseOf, pauseText, pollsFor, resultCardHref, setClock, startPolling, type FollowStatus } from "./follow";
import { useWatchers } from "./useWatchers";
import { WatchCount } from "./WatchCount";

const TOOL = "live_follow";
/** Past this, a Supabase session still unresolved (a dead network) counts as logged out. */
const AUTH_WAIT_MS = 8_000;

/** The answer on screen, its match already checked. updatedAt and seenAt (when it came in) are ms by the server's clock. */
type Shown = { status: FollowStatus; rev: number; match: LiveMatch | null; updatedAt: number | null; seenAt: number };

function toShown(r: LiveGetResponse, seenAt: number): Shown | null {
  // Checked again here: the page trusts nothing it did not rebuild itself. A board is rebuilt as a board.
  const match = r.match == null ? null : sanitizeLive(r.match);
  if ((r.status === "live" || r.status === "done") && !match) return null;
  return { status: r.status, rev: r.rev, match, updatedAt: r.updatedAt ? Date.parse(r.updatedAt) : null, seenAt };
}

/**
 * Server time, counted up on this phone every `every` ms and again when
 * a new update lands. Starts at the page's render time, so the server
 * and the first client render agree.
 */
function useServerNow(serverNow: number, every: number, since: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(clockNow());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, every);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [every, since]);
  return now;
}

/** At a server time: the planned gap in words (freshness), or null. */
type PauseAt = (serverNow: number) => string | null;

/**
 * The red LIVE pill by the team names, only while updates keep coming,
 * or while a running clock is why none do. frozenAt: for a follower who
 * gets no updates, as it was when the score came in.
 */
function LiveBadge({ updatedAt, serverNow, pause, frozenAt }: { updatedAt: number; serverNow: number; pause: PauseAt; frozenAt: number | null }) {
  const ticking = useServerNow(serverNow, 15_000, updatedAt);
  const now = frozenAt ?? ticking;
  if (!liveBadgeOn(now - updatedAt, pause(now) === "Clock running.")) return null;
  return (
    <span className="shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-red-600 text-[10px] font-extrabold tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
      LIVE
    </span>
  );
}

/**
 * How old the score is. Ticks on its own, so the rest of the page does not
 * re-render every few seconds. frozenAt: for a follower who gets no
 * updates, as of when the score came in; it never says the score updates
 * (the login card does) or that it is final (a draw can still go to
 * penalties).
 */
function Freshness({ status, updatedAt, pause, serverNow, frozenAt }: { status: "live" | "done"; updatedAt: number; pause: PauseAt; serverNow: number; frozenAt: number | null }) {
  const ticking = useServerNow(serverNow, 5_000, updatedAt);
  const now = frozenAt ?? ticking;
  const age = Math.max(0, now - updatedAt);
  const f = freshness(status, age, pause(now));
  if (frozenAt !== null && f.tone === "live") return null;
  if (frozenAt !== null && f.tone === "done") return <p className="text-[13px] text-primary-500">Last update {ago(age)}.</p>;
  if (f.tone === "quiet" || f.tone === "stopped") {
    return <p className={`rounded-2xl border px-3 py-2 text-[14px] ${f.tone === "quiet" ? "bg-amber-50 border-amber-300 text-amber-900" : "bg-primary-50 border-primary-200 text-primary-700"}`}>{f.text}</p>;
  }
  return (
    <p className="text-[13px] text-primary-500">
      {f.text}
      {f.tone === "live" && <span className="text-primary-400"> · updates by itself</span>}
    </p>
  );
}

/**
 * The follower page, /live/<code>: the scorer's header and tabs, read
 * only, kept up to date by polling GET /api/live/<code>. Polls are one at
 * a time and served by the CDN, so followers never cost a database read
 * each. The highest rev wins; nothing re-renders when it has not moved,
 * and the picked tab and innings stay put until the link moves on to a
 * new match. A cricket match shows the Live Cricket Scorer's view, a
 * board the Live Scoreboard's, with its clock ticking here. The score
 * is free; logged out, the page stops polling once it has one and asks
 * for a login (Google first, then phone) in the tabs' place.
 */
export function LiveFollow({ code, initial, serverNow }: { code: string; initial: LiveGetResponse | null; serverNow: number }) {
  const router = useRouter();
  const { user, loading: authLoading, settled } = useAuth();
  const [shown, setShown] = useState<Shown | null>(() => (initial ? toShown(initial, serverNow) : null));
  const [trouble, setTrouble] = useState(false);
  const [copied, setCopied] = useState(false);
  const latest = useRef(shown);

  const openedAs = initial?.status ?? "unavailable";
  useEffect(() => {
    trackTool("tool_opened", TOOL, { status: openedAs });
  }, [openedAs]);

  // Mounted: past hydration, so the clock can tick and the login can be read (the server render knows neither).
  const [mounted, setMounted] = useState(false);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    const w = setTimeout(() => setWaited(true), AUTH_WAIT_MS);
    return () => {
      clearTimeout(t);
      clearTimeout(w);
    };
  }, []);
  // Logged out only once auth has really answered (settled), not on its 3 s fallback: a Google login still being
  // checked on a slow network must not get the login card.
  const access = accessOf(mounted, !user && (authLoading || !(settled || waited)), !!user);
  const scored = shown?.status === "live" || shown?.status === "done";
  const polls = pollsFor(access, scored);

  // Set the clock while the page's render time is still close. A page
  // mounted again from the router cache (Back) keeps the clock it has
  // and polls at once, so an old score is never shown as fresh.
  const restored = useRef(false);
  useEffect(() => {
    restored.current = joinClock(serverNow);
  }, [serverNow]);

  useEffect(() => {
    if (!polls) return;
    const poller = startPolling({
      // No query string: every follower must share the one CDN copy.
      get: (signal) => fetch(`/api/live/${code}`, { cache: "no-store", signal }),
      current: () => latest.current,
      show: (r) => {
        const next = toShown(r, clockNow());
        if (!next) return false;
        latest.current = next;
        setShown(next);
        return true;
      },
      trouble: setTrouble,
      clock: setClock,
      serverTime: clockNow,
      hidden: () => document.visibilityState === "hidden",
    });
    const wake = () => poller.wake();
    if (restored.current) wake();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    return () => {
      poller.stop();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, [code, polls]);

  const match = shown?.match ?? null;
  const board = match && isLiveBoard(match) ? match : null;
  const view = useMemo(() => (match && !isLiveBoard(match) ? derive(match) : null), [match]);
  const boardView = useMemo(() => (board ? deriveBoard(board) : null), [board]);
  // Everyone following counts, themselves included. Waiting and turned off links count no one, and nor does
  // a score seen logged out: those viewers get no updates, and each count is a Realtime connection.
  const watchers = useWatchers(scored && match && access === "in" ? code : null, { track: true });
  const walled = scored && access === "out";
  useEffect(() => {
    if (walled) trackTool("tool_action", TOOL, { action: "login_wall" });
  }, [walled]);

  // The board's clock in the scorer's clock domain (boardNow). The first render uses the page's render time, as
  // useServerNow does, so the server render and hydration show the same clock. It ticks logged out too: it is
  // worked out here from the last update, as between any two updates.
  const updatedAt = shown?.updatedAt ?? null;
  // A follower who gets no updates sees the page as of when this score came in.
  const frozenAt = walled && shown ? shown.seenAt : null;
  const boardClock = useCallback(
    (at: number): number | null => (board && boardView ? boardNow(board, boardView, updatedAt ?? serverNow, at) : null),
    [board, boardView, updatedAt, serverNow],
  );
  const headerNow = useCallback(() => boardClock(mounted ? clockNow() : serverNow) ?? 0, [boardClock, mounted, serverNow]);

  const names = view ? `${view.setup.teamA} vs ${view.setup.teamB}` : boardView ? `${boardView.teams.a.name} vs ${boardView.teams.b.name}` : null;

  const share = async () => {
    const link = liveUrl(window.location.origin, code);
    const text = names ? `${names}, live score on TapTurf` : "Live score on TapTurf";
    trackTool("tool_cta_clicked", TOOL, { href: "share", status: shown?.status ?? "unavailable" });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url: link });
        return;
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`, "_blank", "noopener,noreferrer");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(liveUrl(window.location.origin, code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      setCopied(false);
    }
  };

  const resultCard = (v: MatchView) => {
    writeHandoff(toScorecard(v), Date.now());
    trackTool("tool_cta_clicked", TOOL, { href: "/tools/cricket-scorecard-maker", status: v.status });
    router.push(resultCardHref(code));
  };

  const shareBar = (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <button type="button" onClick={share} className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full bg-accent-500 text-white text-[16px] font-bold hover:bg-accent-600">
        <Share2 className="w-4 h-4" aria-hidden /> Share this link
      </button>
      <button type="button" onClick={copy} className="press-tight inline-flex items-center justify-center gap-2 h-12 px-4 rounded-full border-2 border-primary-200 bg-white text-[15px] font-bold text-primary-800">
        {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? "Copied" : "Copy link"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </div>
  );

  if (!shown || !names || !scored) {
    const state = shown && !scored ? (shown.status as Exclude<FollowStatus, "live" | "done">) : "unavailable";
    return (
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <StateCard state={state} />
        <div className="mt-4 space-y-4">
          {(state === "waiting" || state === "unavailable") && shareBar}
          <Ctas code={code} sport={undefined} />
        </div>
      </div>
    );
  }

  const status = shown.status as "live" | "done";
  const pause: PauseAt = boardView
    ? (at) => {
        const t = boardClock(at);
        return boardPause(boardView, t === null ? null : clockMs(boardView, t));
      }
    : () => (view ? pauseText(pauseOf(view)) : null);
  // Logged out and quiet for hours when the score came in: the card stops promising updates.
  const stopped = frozenAt !== null && updatedAt !== null && status === "live" && freshness(status, Math.max(0, frozenAt - updatedAt), pause(frozenAt)).tone === "stopped";
  // By the team names: the LIVE pill while live, and the eye count. Nothing in the slot when neither shows.
  const liveBadge = status === "live" && updatedAt !== null ? <LiveBadge updatedAt={updatedAt} serverNow={serverNow} pause={pause} frozenAt={frozenAt} /> : null;
  const badge =
    liveBadge || watchers?.count ? (
      <>
        {liveBadge}
        <WatchCount watchers={watchers} tone="dark" />
      </>
    ) : undefined;
  const header = boardView ? (
    <BoardHeader view={boardView} board={board ?? undefined} now={headerNow} badge={badge} onShare={share} className="sm:rounded-3xl sm:overflow-hidden" />
  ) : view ? (
    <ScoreHeader view={view} className="sm:rounded-3xl sm:overflow-hidden" venue onShare={share} badge={badge} />
  ) : null;
  const tabsClass = "border-t border-primary-200 sm:border sm:rounded-3xl sm:overflow-hidden lg:col-start-2 lg:row-start-1 lg:row-span-2";
  return (
    <div className="mx-auto max-w-6xl pb-6 sm:px-4 sm:py-5 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-5 lg:items-start">
      <div className="lg:col-start-1 lg:row-start-1">
        <h1 className="sr-only">{names} live score</h1>
        {header}
        <div className="px-3 py-2.5 sm:px-1 space-y-2">
          {updatedAt !== null && <Freshness status={status} updatedAt={updatedAt} pause={pause} serverNow={serverNow} frozenAt={frozenAt} />}
          {trouble && (
            <p role="status" className="text-[13px] font-semibold text-red-700">
              Can&rsquo;t get the latest score. Trying again.
            </p>
          )}
        </div>
      </div>
      {/* Keyed by match id: the same link moved on to the next match starts on Live again. Never keyed by rev. */}
      {access === "checking" ? (
        <div className={`${tabsClass} h-72 flex items-center justify-center bg-white`}>
          <Loader2 className="w-6 h-6 text-primary-300 motion-safe:animate-spin" aria-hidden />
        </div>
      ) : walled ? (
        <LoginCard code={code} done={status === "done"} stopped={stopped} cricket={!boardView} className="mx-3 sm:mx-0 lg:col-start-2 lg:row-start-1 lg:row-span-2" />
      ) : boardView ? (
        // No result card for boards: the scorecard maker is cricket only.
        <BoardTabs key={boardView.id} view={boardView} readOnly className={tabsClass} />
      ) : view ? (
        <MatchTabs key={view.id} view={view} readOnly actions={{ onShare: share, onResultCard: () => resultCard(view) }} className={tabsClass} />
      ) : null}
      <div className="px-3 pt-4 sm:px-0 space-y-4 lg:col-start-1 lg:row-start-2 lg:pt-1">
        {shareBar}
        <Ctas code={code} sport={boardView ? boardView.sport : "cricket"} />
      </div>
    </div>
  );
}

/**
 * In the tabs' place for a follower who is not logged in. The score is
 * free; keeping up with it takes a login. stopped: no update for hours, so
 * nothing promises it will update (the line under the score says it
 * stopped). Beside the score on a wide screen, under it on a phone:
 * nothing here says above.
 */
function LoginCard({ code, done, stopped, cricket, className }: { code: string; done: boolean; stopped: boolean; cricket: boolean; className: string }) {
  const href = followLoginHref(code);
  const more = cricket ? "the full scorecard, overs and commentary" : "the timeline and stats";
  const title = done || stopped ? (cricket ? "Log in to see the full scorecard" : "Log in to see the timeline and stats") : "Log in to follow live";
  const still = "This score does not update while you are logged out.";
  const body = stopped ? `Log in for ${more}.` : done ? `${still} Log in for ${more}.` : `${still} Log in and it updates by itself, with ${more}.`;
  return (
    <section className={`rounded-3xl border-2 border-primary-900 bg-white p-5 ${className}`}>
      <h2 className="text-[19px] font-bold leading-tight text-primary-900">{title}</h2>
      <p className="mt-1.5 text-[15px] leading-snug text-primary-600">{body}</p>
      <Link
        href={href}
        onClick={() => trackTool("tool_cta_clicked", TOOL, { href: "login", status: done ? "done" : "live" })}
        className="press-tight mt-4 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-primary-900 text-white text-[16px] font-bold hover:bg-accent-600"
      >
        <LogIn className="w-5 h-5" aria-hidden /> Log in with Google or phone
      </Link>
      <p className="mt-2 text-center text-[12px] text-primary-500">Free. You come straight back to this score.</p>
    </section>
  );
}

const STATES: Record<"waiting" | "stopped" | "expired" | "unavailable", { title: string; body: string }> = {
  waiting: { title: "Waiting for the scorer's first update", body: "The score shows here as soon as it comes in. No need to refresh." },
  unavailable: { title: "Score will be back in a moment", body: "We could not get the score just now. This page keeps trying by itself." },
  stopped: { title: "The scorer turned this live link off", body: "If the match is still on, ask the scorer for a new link." },
  expired: { title: "This live link has expired", body: "Live links close 30 days after the last update." },
};

function StateCard({ state }: { state: keyof typeof STATES }) {
  const { title, body } = STATES[state];
  const busy = state === "waiting" || state === "unavailable";
  return (
    <section className="rounded-3xl bg-primary-900 text-white p-5 sm:p-6">
      <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">Live score</p>
      <h1 className="mt-1 text-[22px] font-bold leading-tight">{title}</h1>
      <p className="mt-2 text-[15px] text-white/75">{body}</p>
      {busy && <Loader2 className="mt-4 w-6 h-6 text-white/60 motion-safe:animate-spin" aria-hidden />}
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

/** The follower's way to score their own game and find a place to play it, for the sport on screen. */
function ctasFor(sport: BoardSport | "cricket" | undefined): { body: string; tool: { href: string; label: string }; find: { href: string; label: string } } {
  if (sport === "cricket") {
    return {
      body: "Score it ball by ball on your phone and share a live link like this one.",
      tool: { href: "/tools/cricket-live-scorer", label: "Score your own match, free" },
      find: { href: "/sport/box-cricket", label: "Find a box cricket turf" },
    };
  }
  const body = "Score it on your phone and share a live link like this one.";
  // Not known yet (waiting, turned off): the tools page has both scorers.
  if (!sport) return { body, tool: { href: "/tools", label: "Score your own match, free" }, find: { href: "/turfs", label: "Find a turf or court" } };
  const page = sport === "other" ? undefined : sportBySlug(sport);
  return {
    body,
    tool: { href: "/tools/live-scoreboard", label: "Keep score of your own game, free" },
    find: page ? { href: `/sport/${page.slug}`, label: `Find a ${page.name.toLowerCase()} ${venueWord(page, 1)}` } : { href: "/turfs", label: "Find a turf or court" },
  };
}

function Ctas({ code, sport }: { code: string; sport: BoardSport | "cricket" | undefined }) {
  const report = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Report live link ${code}`)}`;
  const c = ctasFor(sport);
  return (
    <>
      <section className="rounded-2xl border border-primary-200 bg-white p-4">
        <h2 className="text-[16px] font-bold text-primary-900">Playing a match yourself?</h2>
        <p className="mt-1 text-[14px] text-primary-600">{c.body}</p>
        <div className="mt-3 flex flex-col gap-2">
          <CtaLink href={c.tool.href} primary>
            {c.tool.label} <ArrowRight className="w-4 h-4" aria-hidden />
          </CtaLink>
          <CtaLink href={c.find.href}>{c.find.label}</CtaLink>
        </div>
      </section>
      <p className="text-center text-[12px] text-primary-500">
        <a href={report} className="underline underline-offset-2 hover:text-primary-800">
          Report this link
        </a>
      </p>
    </>
  );
}
