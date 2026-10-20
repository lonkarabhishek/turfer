"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Copy, Loader2, Share2 } from "lucide-react";
import { derive, sanitizeMatch, toScorecard, type Match, type MatchView } from "@/lib/cricket/scoring";
import { trackTool } from "@/lib/analytics/tools";
import { CONTACT_EMAIL } from "@/lib/contact";
import { liveUrl, type LiveGetResponse } from "@/lib/live/types";
import { MatchTabs, ScoreHeader } from "@/components/tools/scorer/MatchHeader";
import { writeHandoff } from "@/components/tools/scorer/handoff";
import { FRESH_MS, clockNow, freshness, joinClock, pauseOf, resultCardHref, setClock, startPolling, type FollowStatus, type Pause } from "./follow";

const TOOL = "live_follow";

/** The answer on screen, its match already checked. updatedAt is ms by the server's clock. */
type Shown = { status: FollowStatus; rev: number; match: Match | null; updatedAt: number | null };

function toShown(r: LiveGetResponse): Shown | null {
  // Checked again here: the page trusts nothing it did not rebuild itself.
  const match = r.match == null ? null : sanitizeMatch(r.match);
  if ((r.status === "live" || r.status === "done") && !match) return null;
  return { status: r.status, rev: r.rev, match, updatedAt: r.updatedAt ? Date.parse(r.updatedAt) : null };
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

/** The red LIVE pill by the team names, only while updates keep coming. */
function LiveBadge({ updatedAt, serverNow }: { updatedAt: number; serverNow: number }) {
  const now = useServerNow(serverNow, 15_000, updatedAt);
  if (now - updatedAt >= FRESH_MS) return null;
  return (
    <span className="shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-red-600 text-[10px] font-extrabold tracking-wide">
      <span className="w-1.5 h-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
      LIVE
    </span>
  );
}

/** How old the score is. Ticks on its own, so the rest of the page does not re-render every few seconds. */
function Freshness({ status, updatedAt, pause, serverNow }: { status: "live" | "done"; updatedAt: number; pause: Pause; serverNow: number }) {
  const now = useServerNow(serverNow, 5_000, updatedAt);
  const f = freshness(status, Math.max(0, now - updatedAt), pause);
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
 * new match.
 */
export function LiveFollow({ code, initial, serverNow }: { code: string; initial: LiveGetResponse | null; serverNow: number }) {
  const router = useRouter();
  const [shown, setShown] = useState<Shown | null>(() => (initial ? toShown(initial) : null));
  const [trouble, setTrouble] = useState(false);
  const [copied, setCopied] = useState(false);
  const latest = useRef(shown);

  const openedAs = initial?.status ?? "unavailable";
  useEffect(() => {
    trackTool("tool_opened", TOOL, { status: openedAs });
  }, [openedAs]);

  useEffect(() => {
    // Set the clock while the page's render time is still close. A page
    // mounted again from the router cache (Back) keeps the clock it has
    // and polls at once, so an old score is never shown as fresh.
    const restored = joinClock(serverNow);
    const poller = startPolling({
      // No query string: every follower must share the one CDN copy.
      get: (signal) => fetch(`/api/live/${code}`, { cache: "no-store", signal }),
      current: () => latest.current,
      show: (r) => {
        const next = toShown(r);
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
    if (restored) wake();
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
  }, [code, serverNow]);

  const match = shown?.match ?? null;
  const view = useMemo(() => (match ? derive(match) : null), [match]);

  const share = async () => {
    const link = liveUrl(window.location.origin, code);
    const text = view ? `${view.setup.teamA} vs ${view.setup.teamB}, live score on TapTurf` : "Live cricket score on TapTurf";
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

  if (!shown || !view || (shown.status !== "live" && shown.status !== "done")) {
    const state = shown && shown.status !== "live" && shown.status !== "done" ? shown.status : "unavailable";
    return (
      <div className="mx-auto max-w-xl px-4 py-6 sm:py-10">
        <StateCard state={state} />
        <div className="mt-4 space-y-4">
          {(state === "waiting" || state === "unavailable") && shareBar}
          <Ctas code={code} />
        </div>
      </div>
    );
  }

  const s = view.setup;
  const { status, updatedAt } = shown;
  return (
    <div className="mx-auto max-w-6xl pb-6 sm:px-4 sm:py-5 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-5 lg:items-start">
      <div className="lg:col-start-1 lg:row-start-1">
        <h1 className="sr-only">
          {s.teamA} vs {s.teamB} live score
        </h1>
        <ScoreHeader
          view={view}
          className="sm:rounded-3xl sm:overflow-hidden"
          venue
          onShare={share}
          badge={status === "live" && updatedAt !== null ? <LiveBadge updatedAt={updatedAt} serverNow={serverNow} /> : undefined}
        />
        <div className="px-3 py-2.5 sm:px-1 space-y-2">
          {updatedAt !== null && <Freshness status={status} updatedAt={updatedAt} pause={pauseOf(view)} serverNow={serverNow} />}
          {trouble && (
            <p role="status" className="text-[13px] font-semibold text-red-700">
              Can&rsquo;t get the latest score. Trying again.
            </p>
          )}
        </div>
      </div>
      {/* Keyed by match id: the same link moved on to the next match starts on Live again. Never keyed by rev. */}
      <MatchTabs key={view.id} view={view} readOnly actions={{ onShare: share, onResultCard: () => resultCard(view) }} className="border-t border-primary-200 sm:border sm:rounded-3xl sm:overflow-hidden lg:col-start-2 lg:row-start-1 lg:row-span-2" />
      <div className="px-3 pt-4 sm:px-0 space-y-4 lg:col-start-1 lg:row-start-2 lg:pt-1">
        {shareBar}
        <Ctas code={code} />
      </div>
    </div>
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

function Ctas({ code }: { code: string }) {
  const report = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Report live link ${code}`)}`;
  return (
    <>
      <section className="rounded-2xl border border-primary-200 bg-white p-4">
        <h2 className="text-[16px] font-bold text-primary-900">Playing a match yourself?</h2>
        <p className="mt-1 text-[14px] text-primary-600">Score it ball by ball on your phone and share a live link like this one.</p>
        <div className="mt-3 flex flex-col gap-2">
          <CtaLink href="/tools/cricket-live-scorer" primary>
            Score your own match, free <ArrowRight className="w-4 h-4" aria-hidden />
          </CtaLink>
          <CtaLink href="/sport/box-cricket">Find a box cricket turf</CtaLink>
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
