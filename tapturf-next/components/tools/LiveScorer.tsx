"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ImageIcon, Link2, Play, Plus, Trash2 } from "lucide-react";
import { derive, toScorecard, type Match, type MatchView } from "@/lib/cricket/scoring";
import { trackTool } from "@/lib/analytics/tools";
import { ToolCta } from "./ToolCta";
import { SecondaryButton } from "./inputs";
import { Setup, type SetupLive } from "./scorer/Setup";
import { ScoringScreen, TOOL } from "./scorer/ScoringScreen";
import type { ShareLive } from "./scorer/Sheets";
import { deleteMatch, loadIndex, loadMatch, metaOf, saveMatch, setCurrent, type MatchMeta, type ScorerIndex } from "./scorer/storage";
import { writeHandoff } from "./scorer/handoff";
import { canKeepLink, linkUrl, shortUrl, useLiveSync, type LiveInfo } from "./scorer/live";

/** A live match touched within this long is reopened straight into scoring on reload. */
const RESUME_MS = 12 * 60 * 60 * 1000;
const HISTORY_FLAG = "tapturfScorer";

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
 * Ball-by-ball scorer. The page shows the setup (or the match to carry
 * on) and the saved matches; scoring itself opens full screen, so the
 * pad sits under the thumb with nothing else to scroll. Back closes it.
 * Every tap is saved to this browser, and sent to the match's live link
 * when one is on (liveLinks: the site has them; without, none of it shows).
 */
export function LiveScorer({ cta, liveLinks = false }: { cta: { label: string; href: string }; liveLinks?: boolean }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [index, setIndex] = useState<ScorerIndex>({ v: 1, current: null, list: [] });
  const [match, setMatch] = useState<Match | null>(null);
  const [open, setOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [now, setNow] = useState(0);
  /** From a game reminder (?venue, ?from=game): start a new match there rather than resume. */
  const [prefill, setPrefill] = useState({ venue: "", live: false });
  const [copied, setCopied] = useState(false);
  const live = useLiveSync(liveLinks);
  const pushed = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const openScorer = () => {
    setOpen(true);
    try {
      const st = (window.history.state ?? {}) as Record<string, unknown>;
      if (!st[HISTORY_FLAG]) {
        window.history.pushState({ ...st, [HISTORY_FLAG]: true }, "");
        pushed.current = true;
      }
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
    const q = new URLSearchParams(window.location.search);
    const venue = (q.get("venue") ?? "").trim().slice(0, 48);
    const fromGame = q.get("from") === "game";
    trackTool("tool_opened", TOOL, fromGame ? { from: "game" } : {});
    // Restore after mount so the server and first client render agree.
    const t = setTimeout(() => {
      const ix = loadIndex();
      const t0 = Date.now();
      setNow(t0);
      setIndex(ix);
      if (venue || fromGame) {
        setPrefill({ venue, live: fromGame });
        setNewOpen(true);
      }
      const m = ix.current ? loadMatch(ix.current) : null;
      if (m) {
        setMatch(m);
        const meta = ix.list.find((x) => x.id === m.id);
        if (!venue && !fromGame && meta && meta.status === "live" && t0 - meta.updatedAt < RESUME_MS) openScorer();
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

  // Another tab scored on the same match: take its copy, so the next tap here does not wipe those balls.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && !e.key.startsWith("tapturf_scorer")) return;
      setIndex(loadIndex());
      setMatch((cur) => (cur ? (loadMatch(cur.id) ?? cur) : cur));
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

  const persist = (m: Match, v?: MatchView) => {
    const view = v ?? derive(m);
    setIndex(saveMatch(m, metaOf(m, view, Date.now())));
    // After the save: a live send reads the match from storage.
    live.changed(m.id, view);
  };

  const startLink = async (id: string) => {
    const fault = await live.start(id);
    trackTool("tool_action", TOOL, fault ? { action: "live_link_failed", reason: fault } : { action: "live_link_on" });
  };

  const stopLink = async (id: string) => {
    if (await live.stop(id)) trackTool("tool_action", TOOL, { action: "live_link_off" });
  };

  const liveFor = (id: string): ShareLive => {
    const info = live.info(id);
    return { info, url: urlOf(info), onStart: () => void startLink(id), onStop: () => void stopLink(id) };
  };

  const onChange = (m: Match) => {
    setMatch(m);
    persist(m);
  };

  const start = (m: Match, opts: SetupLive) => {
    const prev = match;
    setMatch(m);
    persist(m);
    setNewOpen(false);
    trackTool("tool_used", TOOL, { action: "match_started", overs: m.setup.overs, players: m.setup.playersPerSide, named: m.setup.players.a.length + m.setup.players.b.length > 0, live: liveLinks && opts.on });
    if (liveLinks && opts.on) {
      if (opts.keep && prev && live.move(prev.id, m.id)) trackTool("tool_action", TOOL, { action: "live_link_kept" });
      else void startLink(m.id);
    }
    openScorer();
  };

  const resume = (id: string) => {
    const m = id === match?.id ? match : loadMatch(id);
    if (!m) {
      setIndex(deleteMatch(id));
      return;
    }
    setMatch(m);
    setIndex(setCurrent(id));
    openScorer();
  };

  const remove = (meta: MatchMeta) => {
    const stopsLink = liveLinks && meta.status === "live" && live.info(meta.id).on;
    if (!window.confirm(`Delete ${meta.teamA} vs ${meta.teamB}? This cannot be undone.${stopsLink ? " Its live link turns off too." : ""}`)) return;
    // While the match is still in storage: a finished one's last ball may still need sending.
    live.remove(meta.id, meta.status === "live");
    setIndex(deleteMatch(meta.id));
    if (match?.id === meta.id) setMatch(null);
  };

  const resultCard = (v: MatchView) => {
    // A client side navigation fires no pagehide: send the last ball now.
    if (match) live.flush(match.id);
    writeHandoff(toScorecard(v), Date.now());
    trackTool("tool_cta_clicked", TOOL, { href: "/tools/cricket-scorecard-maker", status: v.status });
    // Swap out the scorer's own history entry, so Back from the card lands on this page once.
    const flagged = !!(window.history.state as Record<string, unknown> | null)?.[HISTORY_FLAG];
    setOpen(false);
    const url = "/tools/cricket-scorecard-maker?from=live-scorer";
    if (flagged) router.replace(url);
    else router.push(url);
  };

  const newMatch = () => {
    setNewOpen(true);
    closeScorer();
  };

  if (!hydrated) {
    return <div className="rounded-3xl border border-primary-200 bg-white p-6 shadow-soft min-h-[420px]" aria-busy="true" />;
  }

  const view = match ? derive(match) : null;
  const inPlay = view?.status === "live";
  // The match in progress has its own card above; finished ones stay listed so they can be deleted.
  const others = index.list.filter((m) => !(inPlay && m.id === match?.id));
  const cardLink = liveLinks && match ? live.info(match.id) : null;
  const cardUrl = cardLink ? urlOf(cardLink) : null;
  const keepFrom = view && canKeepLink(cardLink?.link, now) ? `${view.setup.teamA} vs ${view.setup.teamB}` : null;

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      trackTool("tool_cta_clicked", TOOL, { href: "share", how: "live_copy", status: view?.status ?? "none" });
    } catch {
      setCopied(false);
    }
  };

  return (
    <div ref={rootRef} className="scroll-mt-24 rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      {match && view && (
        <div className="mb-5 rounded-2xl bg-primary-900 text-white p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">{inPlay ? "Match in progress" : "Last match"}</p>
          <p className="mt-1 text-[15px] text-white/80 truncate">
            {view.setup.teamA} vs {view.setup.teamB}
          </p>
          <p className="text-[22px] font-bold leading-tight">{view.headline}</p>
          {inPlay && view.innings.length > 1 && <p className="text-[14px] text-white/70">{view.innings[0].summary}</p>}
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
            <button type="button" onClick={() => resume(match.id)} className="press-tight inline-flex items-center justify-center gap-2 h-14 px-6 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
              <Play className="w-5 h-5" aria-hidden /> {inPlay ? "Continue scoring" : "Open scorecard"}
            </button>
            {!inPlay && (
              <button type="button" onClick={() => resultCard(view)} className="press-tight inline-flex items-center justify-center gap-2 h-12 px-5 rounded-full bg-white/10 text-white text-[15px] font-bold hover:bg-white/20">
                <ImageIcon className="w-4 h-4" aria-hidden /> Make the result card
              </button>
            )}
          </div>
        </div>
      )}

      {match && inPlay && !newOpen ? (
        <SecondaryButton onClick={() => setNewOpen(true)} className="w-full">
          <Plus className="w-4 h-4" aria-hidden /> Start a new match instead
        </SecondaryButton>
      ) : (
        <div>
          {match && <h2 className="text-[18px] font-bold text-primary-900 mb-3">New match</h2>}
          <Setup onStart={start} initialVenue={prefill.venue} live={liveLinks ? { on: prefill.live, keepFrom } : undefined} />
        </div>
      )}

      {others.length > 0 && (
        <section className="mt-8" aria-labelledby="ls-matches">
          <h2 id="ls-matches" className="text-[16px] font-bold text-primary-900 mb-2">
            Saved matches
          </h2>
          <ul className="divide-y divide-primary-100 rounded-2xl border border-primary-200">
            {others.map((m) => (
              <li key={m.id} className="flex items-center gap-2 pl-4 pr-2 py-2">
                <button type="button" onClick={() => resume(m.id)} className="flex-1 min-w-0 text-left py-1">
                  <span className="block text-[15px] font-semibold text-primary-900 truncate">
                    {m.teamA} vs {m.teamB}
                  </span>
                  <span className="block text-[13px] text-primary-500 truncate">
                    {m.status === "live" ? "In progress: " : ""}
                    {m.headline} · {when(m.updatedAt, now)}
                  </span>
                </button>
                <button type="button" onClick={() => resume(m.id)} className="shrink-0 h-11 px-3 rounded-full text-[14px] font-bold text-accent-700 hover:bg-accent-50">
                  {m.status === "live" ? "Resume" : "View"}
                </button>
                <button type="button" onClick={() => remove(m)} aria-label={`Delete ${m.teamA} vs ${m.teamB}`} className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full text-primary-400 hover:text-red-600 hover:bg-red-50">
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-primary-500">{liveLinks ? "Kept in this browser only, unless you turn on a live link. Clearing site data removes them." : "Kept in this browser only. Clearing site data removes them."}</p>
        </section>
      )}

      <ToolCta tool={TOOL} label={cta.label} href={cta.href} />

      {open && match && <ScoringScreen key={match.id} match={match} onChange={onChange} onExit={closeScorer} onNewMatch={newMatch} onResultCard={resultCard} live={liveLinks ? liveFor(match.id) : undefined} />}
    </div>
  );
}
