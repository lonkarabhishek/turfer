"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Redo2, Undo2, X } from "lucide-react";
import { apply, check, derive, shareText, type Extra, type Match, type MatchEvent, type MatchView, type Side } from "@/lib/cricket/scoring";
import { trackTool, type ToolEvent } from "@/lib/analytics/tools";
import { buildBall, chipText, keyHint, plainRuns, runAllowed, smartUndo, stamp, tapClock, vibrate, wallClock, type NbSource } from "./logic";
import { BallChip } from "./ui";
import { BatterSheet, BowlerSheet, ConfirmSheet, MoreSheet, OpenersSheet, PlayerSheet, SettingsSheet, ShareSheet, WicketSheet, type MoreAction, type ShareLive } from "./Sheets";
import type { PanelActions } from "./Tabs";
import { MatchTabs, ScoreHeader, type MatchTab } from "./MatchHeader";
import { pillTone, type LiveInfo } from "./live";
import { WatchCount } from "@/components/live/WatchCount";
import type { Watchers } from "@/components/live/watch";

export const TOOL = "live_scorer";
const SHEET_FLAG = "tapturfSheet";

type SheetState =
  | null
  | { k: "openers" }
  | { k: "batter" }
  | { k: "bowler"; mode: "over" | "change" }
  | { k: "wicket"; extra: Extra; nb: NbSource; preset?: "retire" }
  | { k: "more" }
  | { k: "player"; side: Side; id: string }
  | { k: "settings" }
  | { k: "share" }
  | { k: "confirm"; what: "end" | "abandon" };

type Toast = { text: string; tone: "info" | "warn" | "error"; redo?: boolean };

/** The sheet a fresh state asks for: openers, the next batter, or the next bowler. */
function sheetFor(v: MatchView): SheetState {
  if (v.status !== "live" || !v.needs.length || v.inningsBreak) return null;
  const s = v.needs.includes("striker");
  const n = v.needs.includes("nonStriker");
  if (s && n) return { k: "openers" };
  if (s || n) return { k: "batter" };
  return { k: "bowler", mode: "over" };
}

function scoreLine(v: MatchView): string {
  if (v.result) return v.result.text;
  const c = v.current;
  let s = `${c.battingName} ${c.runs} for ${c.wickets}, ${c.overs} overs`;
  if (v.chase && !v.inningsBreak) s += `. Need ${Math.max(0, v.chase.runsNeeded)} from ${v.chase.ballsLeft}`;
  if (v.freeHit) s += ". Free hit next";
  return s;
}

const SPOKEN_EXTRA: Partial<Record<Extra, string>> = { wide: "Wide", noBall: "No-ball", bye: "Byes", legBye: "Leg byes" };

const PILL_DOT = { green: "bg-green-400", amber: "bg-amber-400", red: "bg-red-500" } as const;

function pillLabel(info: LiveInfo): string {
  if (info.mode === "starting") return "Live link: getting your link";
  if (info.state === "synced") return "Live link on, all balls sent";
  if (info.state === "sending") return "Live link on, sending";
  if (info.state === "offline") return "Live link on, offline";
  return "Live link stopped";
}

/** By the team names while the match has a live link. Tapping it opens the share sheet. */
function LivePill({ info, onClick }: { info: LiveInfo; onClick: () => void }) {
  const tone = pillTone(info);
  if (!tone) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${pillLabel(info)}. Open sharing.`}
      className="relative shrink-0 inline-flex items-center gap-1 h-5 px-1.5 rounded-full bg-white/15 text-[10px] font-extrabold tracking-wide hover:bg-white/25 after:absolute after:-inset-x-1.5 after:-inset-y-3 after:content-['']"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${PILL_DOT[tone]}`} aria-hidden />
      LIVE
    </button>
  );
}

export function ScoringScreen({
  match,
  onChange,
  onExit,
  onNewMatch,
  onResultCard,
  live,
  watchers = null,
}: {
  match: Match;
  onChange: (m: Match) => void;
  onExit: () => void;
  onNewMatch: () => void;
  onResultCard: (v: MatchView) => void;
  /** Left out when the site has no live links. */
  live?: ShareLive;
  /** How many followers have the live link open (useWatchers), shown by the LIVE pill. */
  watchers?: Watchers | null;
}) {
  const view = useMemo(() => derive(match), [match]);
  const [tab, setTab] = useState<MatchTab>("live");
  const [armed, setArmed] = useState<Extra | null>(null);
  const [nb, setNb] = useState<NbSource>("bat");
  const [sheet, setSheet] = useState<SheetState>(() => sheetFor(view));
  const [toast, setToast] = useState<Toast | null>(null);
  const [redo, setRedo] = useState<Match[]>([]);
  const [said, setSaid] = useState("");
  const lastTap = useRef(0);
  const fired = useRef(new Set<string>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const rootRef = useRef<HTMLDivElement>(null);
  /** Token of the history entry pushed for the open sheet, so phone Back closes the sheet, not the scorer. Undefined until read. */
  const sheetEntry = useRef<number | null | undefined>(undefined);
  const exitAfterPop = useRef(false);
  const exitRef = useRef(onExit);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  // Focus into the dialog before any sheet opens, so a sheet hands focus back here, not to the page behind.
  useLayoutEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    exitRef.current = onExit;
  });

  // Phone Back closes an open sheet first. One history entry per open sheet, however many sheets follow in a row.
  const sheetOpen = sheet !== null;
  useEffect(() => {
    try {
      const h = window.history;
      const st = (h.state ?? {}) as Record<string, unknown>;
      // After a reload the sheet's entry may still be on top: adopt it.
      if (sheetEntry.current === undefined) sheetEntry.current = typeof st[SHEET_FLAG] === "number" ? (st[SHEET_FLAG] as number) : null;
      if (sheetOpen && !sheetEntry.current) {
        const token = Date.now();
        h.pushState({ ...st, [SHEET_FLAG]: token }, "");
        sheetEntry.current = token;
      } else if (!sheetOpen && sheetEntry.current) {
        sheetEntry.current = null;
        h.back();
      }
    } catch {
      sheetEntry.current = null;
    }
  }, [sheetOpen]);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state ?? {}) as Record<string, unknown>;
      if (sheetEntry.current && st[SHEET_FLAG] !== sheetEntry.current) {
        sheetEntry.current = null;
        setSheet(null);
      }
      if (exitAfterPop.current) {
        exitAfterPop.current = false;
        exitRef.current();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** One action per 250 ms: a double tap or a tap that lands as a sheet closes does nothing. */
  const guard = () => {
    const now = tapClock();
    if (now - lastTap.current < 250) return false;
    lastTap.current = now;
    return true;
  };

  const showToast = (text: string, tone: Toast["tone"] = "info", withRedo = false) => {
    setToast({ text, tone, redo: withRedo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), withRedo ? 5000 : 3500);
  };

  const fire = (key: string, ev: ToolEvent, params: Record<string, string | number | boolean>) => {
    const k = `${match.id}:${key}`;
    if (fired.current.has(k)) return;
    fired.current.add(k);
    trackTool(ev, TOOL, params);
  };

  /** Analytics, a few events a match: each completed over, wickets, innings and match end. */
  const track = (v: MatchView) => {
    for (const inn of v.innings) {
      const done = inn.byOver.filter((o) => o.complete).length;
      if (done) fire(`over:${inn.index}:${done}`, "tool_action", { action: "over", over: done, innings: inn.index + 1 });
      if (inn.wickets) fire(`wkt:${inn.index}:${inn.wickets}`, "tool_action", { action: "wicket", innings: inn.index + 1 });
      if (inn.ended) fire(`inn:${inn.index}`, "tool_action", { action: "innings_end", innings: inn.index + 1, reason: inn.ended });
    }
    // The live link's code goes to the admin's list of tool users only (lib/analytics/tools.ts leaves it out of GA).
    const code: Record<string, string> = live?.info.on && live.info.link ? { code: live.info.link.code } : {};
    if (v.status === "done") fire("end", "tool_result_generated", { action: "match_end", result: v.result?.kind ?? "none", overs: v.setup.overs, players: v.setup.playersPerSide, ...code });
  };

  /** Apply one tap's events together (same timestamp, so undo takes them back together). */
  const commit = (events: MatchEvent[]): boolean => {
    let m = match;
    const warns: string[] = [];
    for (const e of stamp(events, wallClock())) {
      const c = check(m, e);
      if (c.error) {
        showToast(c.error, "error");
        return false;
      }
      if (e.type !== "setBowler" && e.type !== "changeSetup") warns.push(...c.warnings);
      m = apply(m, e);
    }
    lastTap.current = tapClock();
    const v2 = derive(m);
    setRedo([]);
    setArmed(null);
    setNb("bat");
    onChange(m);
    const fresh = v2.retireDue.filter((id) => !view.retireDue.includes(id)).length ? v2.warnings.filter((w) => /retire/.test(w)) : [];
    const all = [...new Set([...warns, ...fresh])];
    if (all.length) showToast(all.join(". "), "warn");
    else setToast(null);
    const wkts = (x: MatchView) => x.innings.reduce((s, i) => s + i.wickets, 0);
    if (wkts(v2) > wkts(view)) vibrate([20, 40, 20]);
    if (v2.innings.length !== view.innings.length || v2.status !== view.status) setTab("live");
    setSaid(`${v2.lastAction ?? ""}. ${scoreLine(v2)}`);
    track(v2);
    setSheet(sheetFor(v2));
    return true;
  };

  const undo = () => {
    if (armed) {
      setArmed(null);
      return;
    }
    if (!match.events.length || !guard()) return;
    const { match: m, removedBall } = smartUndo(match);
    if (m === match) return;
    vibrate(10);
    let what = view.lastAction ?? "the last step";
    if (removedBall !== null) {
      const line = view.innings.flatMap((i) => i.commentary).find((l) => l.kind === "ball" && l.event === removedBall);
      if (line) what = `ball ${line.label} (${chipText(line.chip ?? "")})`;
    }
    setRedo((r) => [...r.slice(-49), match]);
    onChange(m);
    setSheet(null);
    showToast(`Took back ${what}`, "info", true);
    setSaid(`Undone. ${scoreLine(derive(m))}`);
  };

  const redoLast = () => {
    const prev = redo[redo.length - 1];
    if (!prev) return;
    setRedo((r) => r.slice(0, -1));
    onChange(prev);
    setToast(null);
    setSaid(`Redone. ${scoreLine(derive(prev))}`);
  };

  const tapRuns = (n: number) => {
    if (!view.ready || !guard()) return;
    if (armed && !runAllowed(armed, nb, n)) return;
    vibrate();
    commit([buildBall(armed ?? "none", n, nb)]);
  };

  /** Arming is not guarded, so a quick Wd Wd (just the wide) or Wd 2 always goes in; commit() still blocks a third tap. */
  const tapExtra = (x: Extra) => {
    if (!view.ready) return;
    if (armed === x) {
      if (!guard()) return;
      vibrate();
      commit([buildBall(x, plainRuns(x), nb)]);
      return;
    }
    vibrate();
    setArmed(x);
    setNb("bat");
  };

  const tapWicket = () => {
    if (!view.ready || !guard()) return;
    vibrate();
    setSheet({ k: "wicket", extra: armed ?? "none", nb });
  };

  const openSheet = (s: SheetState) => {
    lastTap.current = tapClock();
    setSheet(s);
  };

  const onMore = (a: MoreAction) => {
    switch (a) {
      case "five":
        if (view.ready) commit([buildBall(armed ?? "none", 5, nb)]);
        else setSheet(null);
        break;
      case "swap":
        commit([{ type: "swapStrike" }]);
        break;
      case "retire":
        openSheet({ k: "wicket", extra: "none", nb: "bat", preset: "retire" });
        break;
      case "bowler":
        openSheet({ k: "bowler", mode: "change" });
        break;
      case "share":
        openSheet({ k: "share" });
        break;
      case "settings":
        openSheet({ k: "settings" });
        break;
      case "end":
        openSheet({ k: "confirm", what: "end" });
        break;
      case "abandon":
        openSheet({ k: "confirm", what: "abandon" });
        break;
      case "matches":
        // Close the sheet's history entry first, then leave the scorer once that Back lands.
        if (sheetEntry.current) exitAfterPop.current = true;
        setSheet(null);
        if (!exitAfterPop.current) onExit();
        break;
    }
  };

  const onPlayer = (side: Side, id: string) => openSheet({ k: "player", side, id });

  const actions: PanelActions = {
    onStartChase: () => openSheet({ k: "openers" }),
    onResultCard: () => onResultCard(view),
    onShare: () => openSheet({ k: "share" }),
    onNewMatch,
  };

  // Desktop keys: 0-6 runs, W wicket, D wide, N no-ball, B bye, L leg bye, U undo.
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (sheet || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (/^[0-6]$/.test(k)) tapRuns(Number(k));
      else if (k === "w") tapWicket();
      else if (k === "d") tapExtra("wide");
      else if (k === "n") tapExtra("noBall");
      else if (k === "b") tapExtra("bye");
      else if (k === "l") tapExtra("legBye");
      else if (k === "u") undo();
      else if (k === "escape" && armed) setArmed(null);
      else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const inn = view.current;
  const s = view.setup;
  const closeSheet = () => {
    lastTap.current = tapClock();
    setSheet(null);
  };

  return (
    <div ref={rootRef} tabIndex={-1} className="fixed inset-0 z-[70] bg-primary-100 outline-none" role="dialog" aria-modal="true" aria-label={`Live scorer, ${s.teamA} vs ${s.teamB}`}>
      <div className="mx-auto h-full w-full max-w-6xl grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] lg:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[420px_minmax(0,1fr)] lg:gap-4 lg:p-4">
        {/* Score header */}
        <ScoreHeader
          view={view}
          className="lg:col-start-1 lg:row-start-1 lg:rounded-3xl lg:overflow-hidden"
          onExit={onExit}
          onShare={() => openSheet({ k: "share" })}
          onMore={() => openSheet({ k: "more" })}
          onPlayer={onPlayer}
          badge={
            live && pillTone(live.info) ? (
              <>
                <LivePill info={live.info} onClick={() => openSheet({ k: "share" })} />
                <WatchCount watchers={watchers} tone="dark" />
              </>
            ) : undefined
          }
        />

        {/* Tabs */}
        <MatchTabs view={view} tab={tab} onTab={setTab} onPlayer={onPlayer} actions={actions} className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:rounded-3xl lg:overflow-hidden lg:border lg:border-primary-200" />

        {/* Tap pad */}
        <footer className="relative bg-white border-t border-primary-200 px-3 pt-2 lg:col-start-1 lg:row-start-2 lg:self-start lg:rounded-3xl lg:border" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
          {toast && (
            <div role={toast.tone === "error" ? "alert" : "status"} className={`absolute left-3 right-3 bottom-full mb-2 rounded-2xl px-4 py-3 shadow-elevated flex items-center gap-3 text-[14px] font-semibold ${toast.tone === "error" ? "bg-red-600 text-white" : toast.tone === "warn" ? "bg-amber-300 text-amber-950" : "bg-primary-900 text-white"}`}>
              <span className="flex-1 min-w-0">{toast.text}</span>
              {toast.redo && redo.length > 0 && (
                <button type="button" onClick={redoLast} className="shrink-0 inline-flex items-center gap-1 h-10 px-3 rounded-full bg-white/15 text-[14px] font-bold">
                  <Redo2 className="w-4 h-4" aria-hidden /> Redo
                </button>
              )}
              <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="shrink-0 w-9 h-9 -mr-1 inline-flex items-center justify-center rounded-full hover:bg-white/15">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <Pad
            view={view}
            armed={armed}
            nb={nb}
            setNb={setNb}
            canUndo={match.events.length > 0}
            onRuns={tapRuns}
            onExtra={tapExtra}
            onWicket={tapWicket}
            onUndo={undo}
            onDisarm={() => setArmed(null)}
            onMore={() => openSheet({ k: "more" })}
            onNeed={() => openSheet(view.inningsBreak ? { k: "openers" } : sheetFor(view))}
            actions={actions}
          />
        </footer>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>

      {sheet?.k === "openers" && <OpenersSheet key={`op-${view.eventCount}`} match={match} view={view} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "batter" && <BatterSheet match={match} view={view} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "bowler" && <BowlerSheet match={match} view={view} mode={sheet.mode} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "wicket" && <WicketSheet match={match} view={view} extra={sheet.extra} nb={sheet.nb} preset={sheet.preset} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "more" && <MoreSheet view={view} onAction={onMore} onClose={closeSheet} />}
      {sheet?.k === "player" && <PlayerSheet view={view} side={sheet.side} id={sheet.id} onCommit={commit} onAction={onMore} onClose={closeSheet} />}
      {sheet?.k === "settings" && <SettingsSheet match={match} view={view} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "share" && (
        <ShareSheet
          text={shareText(view, live?.url ? { link: live.url } : {})}
          title={view.status === "done" ? "Share the result" : "Share live score"}
          live={live}
          onShared={(how) => trackTool("tool_cta_clicked", TOOL, { href: "share", how, status: view.status })}
          onClose={closeSheet}
        />
      )}
      {sheet?.k === "confirm" && (
        <ConfirmSheet
          title={sheet.what === "end" ? `End ${inn.battingName}'s innings?` : "Abandon the match?"}
          body={sheet.what === "end" ? `${inn.battingName} finish on ${inn.score} in ${inn.overs} overs.${inn.index === 0 ? " The chase starts next." : " The result is decided on these scores."} Undo brings it back.` : "The match ends with no result. Undo brings it back."}
          confirm={sheet.what === "end" ? "End innings" : "Abandon"}
          danger={sheet.what === "abandon"}
          onConfirm={() => commit([{ type: "endInnings", ...(sheet.what === "abandon" ? { reason: "abandoned" as const } : {}) }])}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The pad                                                             */
/* ------------------------------------------------------------------ */

const KEY = "press-tight relative rounded-2xl font-bold select-none touch-manipulation transition-colors disabled:opacity-25 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

function Pad({
  view,
  armed,
  nb,
  setNb,
  canUndo,
  onRuns,
  onExtra,
  onWicket,
  onUndo,
  onDisarm,
  onMore,
  onNeed,
  actions,
}: {
  view: MatchView;
  armed: Extra | null;
  nb: NbSource;
  setNb: (n: NbSource) => void;
  canUndo: boolean;
  onRuns: (n: number) => void;
  onExtra: (x: Extra) => void;
  onWicket: () => void;
  onUndo: () => void;
  onDisarm: () => void;
  onMore: () => void;
  onNeed: () => void;
  actions: PanelActions;
}) {
  const inn = view.current;
  const over = inn.thisOver;
  // Smaller chips for a long over or one with a few long labels (Wd+2, Nb+1lb); the strip scrolls so the newest ball stays in view.
  const chips = over ? over.balls : [];
  const small = chips.length > 5 || chips.filter((b) => b.chip.length > 2).length >= 2;
  const stripRef = useRef<HTMLDivElement>(null);
  const shownBalls = view.ready && !armed ? chips.length : -1;
  useEffect(() => {
    const el = stripRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [shownBalls, over?.number, small]);
  const undoKey = (
    <button type="button" onClick={onUndo} disabled={!canUndo && !armed} aria-label={armed ? "Cancel the extra" : `Undo${view.lastAction ? `: ${view.lastAction}` : ""}`} className={`${KEY} w-full h-14 border-2 border-primary-300 bg-primary-50 text-primary-800 text-[15px] inline-flex flex-col items-center justify-center gap-0.5 active:bg-primary-200`}>
      <Undo2 className="w-5 h-5" aria-hidden />
      <span className="text-[13px] leading-none">{armed ? "Cancel" : "Undo"}</span>
    </button>
  );

  if (!view.ready) {
    const need = view.needs;
    const label =
      view.status === "done"
        ? null
        : view.inningsBreak
          ? "Start the chase"
          : need.includes("striker") && need.includes("nonStriker")
            ? "Pick the openers"
            : need.includes("striker") || need.includes("nonStriker")
              ? "Pick the next batter"
              : `Pick the bowler for over ${Math.floor(inn.legalBalls / 6) + 1}`;
    return (
      <div className="py-1">
        {view.status === "done" ? (
          <div className="grid grid-cols-[1fr_5rem] gap-2 items-center">
            <button type="button" onClick={actions.onResultCard} className={`${KEY} h-16 bg-accent-500 text-white text-[17px] hover:bg-accent-600`}>
              Make the result card
            </button>
            {undoKey}
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_5rem] gap-2 items-center">
            <button type="button" onClick={onNeed} className={`${KEY} h-16 bg-primary-900 text-white text-[18px] hover:bg-accent-600`}>
              {label}
            </button>
            {undoKey}
          </div>
        )}
      </div>
    );
  }

  const runKey = (n: number) => {
    const hint = keyHint(armed, nb, n);
    const ok = !armed || runAllowed(armed, nb, n);
    const tone = armed ? "bg-white border-2 border-amber-400 text-primary-900 active:bg-amber-100" : n === 4 ? "bg-accent-500 border-2 border-accent-600 text-white active:bg-accent-700" : n === 6 ? "bg-primary-900 border-2 border-primary-900 text-accent-300 active:bg-primary-700" : "bg-white border-2 border-primary-300 text-primary-900 active:bg-primary-100";
    const s = n === 1 ? "" : "s";
    const spoken = !armed
      ? n === 0
        ? "Dot ball"
        : n === 4
          ? "Four"
          : n === 6
            ? "Six"
            : `${n} run${s}`
      : armed === "wide"
        ? n
          ? `Wide plus ${n}`
          : "Just the wide"
        : armed === "noBall"
          ? n
            ? `No-ball plus ${n}${nb === "bat" ? " off the bat" : nb === "bye" ? ` bye${s}` : ` leg bye${s}`}`
            : "Just the no-ball"
          : `${n} ${armed === "bye" ? "bye" : "leg bye"}${s}`;
    return (
      <button key={n} type="button" disabled={!ok} onClick={() => onRuns(n)} aria-label={spoken} className={`${KEY} h-16 [@media(max-height:700px)]:h-14 text-[30px] leading-none tabular-nums inline-flex flex-col items-center justify-center ${tone}`}>
        {n}
        {hint && <span className="mt-0.5 text-[11px] font-bold text-amber-800 leading-none">{hint}</span>}
      </button>
    );
  };
  const extraKey = (x: Extra, label: string, tall: boolean) => (
    <button
      key={x}
      type="button"
      onClick={() => onExtra(x)}
      aria-pressed={armed === x}
      aria-label={`${SPOKEN_EXTRA[x]}${armed === x ? ", tap again for the plain one" : ""}`}
      className={`${KEY} ${tall ? "h-16 [@media(max-height:700px)]:h-14" : "h-14"} text-[19px] border-2 ${armed === x ? "bg-amber-400 border-amber-500 text-amber-950" : "bg-amber-50 border-amber-300 text-amber-950 active:bg-amber-200"}`}
    >
      {label}
    </button>
  );

  const armedText = armed === "wide" ? "Wide. Runs they ran, or Wd again for just the wide." : armed === "noBall" ? (nb === "bat" ? "No-ball. Runs off the bat?" : nb === "bye" ? "No-ball. Byes run?" : "No-ball. Leg byes run?") : armed === "bye" ? "Byes. How many did they run?" : armed === "legBye" ? "Leg byes. How many did they run?" : "";

  return (
    <div>
      {view.freeHit ? (
        <p role="status" className="-mx-3 -mt-2 mb-2 h-9 flex items-center justify-center bg-amber-400 text-amber-950 text-[15px] font-extrabold tracking-[0.2em] lg:mx-0 lg:mt-0 lg:rounded-xl">
          FREE HIT
        </p>
      ) : (
        <p className="hidden lg:flex mb-2 h-9 items-center justify-center text-[12px] text-primary-500">Keys: 0 to 6, W wicket, D wide, N no-ball, B bye, L leg bye, U undo</p>
      )}
      {armed ? (
        <div className="min-h-12 flex items-center gap-2 rounded-xl bg-amber-100 pl-3 pr-1 py-1">
          <p className="flex-1 min-w-0 text-[14px] font-semibold leading-snug text-amber-950">{armedText}</p>
          {armed === "noBall" && (
            <div role="radiogroup" aria-label="No-ball runs from" className="flex shrink-0 rounded-lg bg-white/70 p-0.5">
              {(
                [
                  ["bat", "Bat"],
                  ["bye", "B"],
                  ["legBye", "LB"],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={nb === v} aria-label={v === "bat" ? "Off the bat" : v === "bye" ? "Byes" : "Leg byes"} onClick={() => setNb(v)} className={`h-10 min-w-10 px-2 rounded-md text-[13px] font-bold ${nb === v ? "bg-amber-950 text-white" : "text-amber-950"}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={onDisarm} aria-label="Cancel the extra" className="shrink-0 w-10 h-10 inline-flex items-center justify-center rounded-full text-amber-950 hover:bg-amber-200">
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="min-h-12 flex items-center gap-2">
          <span className="shrink-0 w-14 leading-tight">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-primary-500">{over && over.complete ? `Over ${over.number}` : "This over"}</span>
            {over && over.balls.length > 0 && <span className="block text-[13px] font-bold text-primary-800 tabular-nums">{over.runs} run{over.runs === 1 ? "" : "s"}</span>}
          </span>
          <div ref={stripRef} role="group" className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scrollbar-hide" aria-label="Balls this over">
            {chips.length ? chips.map((b) => <BallChip key={b.event} chip={b.chip} tone={b.tone} label={b.label} size={small ? "sm" : "md"} />) : <span className="text-[13px] text-primary-500">New over</span>}
          </div>
          <button type="button" onClick={onMore} className="shrink-0 h-10 px-3 rounded-full border-2 border-primary-200 text-[13px] font-bold text-primary-700 inline-flex items-center gap-1 hover:border-primary-400">
            More
          </button>
        </div>
      )}

      <div className="mt-2 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map(runKey)}
        {runKey(4)}
        {runKey(6)}
        {extraKey("wide", "Wd", true)}
        {extraKey("noBall", "Nb", true)}
        <button type="button" onClick={onWicket} aria-label={armed ? `Wicket on a ${SPOKEN_EXTRA[armed]?.toLowerCase()}` : "Wicket"} className={`${KEY} h-14 bg-red-600 border-2 border-red-700 text-white text-[24px] active:bg-red-800`}>
          W
        </button>
        {extraKey("bye", "Bye", false)}
        {extraKey("legBye", "LB", false)}
        {undoKey}
      </div>
    </div>
  );
}
