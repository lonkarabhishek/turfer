"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Goal, ListOrdered, MoreHorizontal, Pause, Play, Plus, Redo2, Share2, Timer, Undo2, UserPlus, X } from "lucide-react";
import { applyBoard, boardShareText, checkBoard, deriveBoard, padFor, undoBoard } from "@/lib/board";
import type { Board, BoardEvent, BoardView, PadAction, Side, Tag } from "@/lib/board/types";
import { trackTool, type ToolEvent } from "@/lib/analytics/tools";
import { BoardHeader } from "@/components/board/BoardHeader";
import { BoardTabs } from "@/components/board/BoardTabs";
import { useTimeUp } from "@/components/board/BoardClock";
import { TEAM, bigScore, isSetSport, order, sportIcon, unitWord } from "@/components/board/shared";
import { WatchCount } from "@/components/live/WatchCount";
import type { Watchers } from "@/components/live/watch";
import { pillTone, type LiveInfo } from "../scorer/live";
import { BOARD_WORDS, ConfirmSheet, ShareSheet, type ShareLive } from "../scorer/ShareSheet";
import { Sheet } from "../scorer/ui";
import { EndSheet, MoreSheet, NamesSheet, PlayerSheet, RulesSheet, SetTimeSheet, type MoreAction } from "./Sheets";
import { RALLY_GUARD_MS, TAP_GUARD_MS, answer, answered, guardMs, knownPlayers, namePrompt, offersName, padParts, playerTeam, promptKey, stamp, swappedNow, withPlayer } from "./logic";
import { loadPrefs, savePrefs, type BoardPrefs } from "./storage";

export const TOOL = "live_scoreboard";
const SHEET_FLAG = "tapturfSheet";
/** Racquet sports and volleyball with timeouts in their rules: their strip is always there, so nothing moves once play starts. */
const TIMEOUT_SPORTS = ["volleyball", "table-tennis", "pickleball"];

/** Clocks for event handlers. Never called while rendering. */
const wallNow = () => Date.now();
const tapClock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function vibrate(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

type SheetState =
  | null
  | { k: "more" }
  | { k: "names" }
  | { k: "rules" }
  | { k: "details" }
  | { k: "end"; at: number }
  | { k: "share"; at: number }
  | { k: "time"; at: number }
  | { k: "player"; index: number }
  | { k: "confirm"; action: PadAction; body: string };

type Toast = { text: string; tone: "info" | "warn" | "error"; redo?: boolean; add?: { index: number; button: string } };

const PILL_DOT = { green: "bg-green-400", amber: "bg-amber-400", red: "bg-red-500" } as const;

function pillLabel(info: LiveInfo): string {
  if (info.mode === "starting") return "Live link: getting your link";
  if (info.state === "synced") return "Live link on, up to date";
  if (info.state === "sending") return "Live link on, sending";
  if (info.state === "offline") return "Live link on, offline";
  return "Live link stopped";
}

/** By the sport name while the match has a live link. Tapping it opens the share sheet. */
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

/**
 * Full-screen scorer for a board. Racquet sports and volleyball: the two
 * halves of the screen are the "won the point" buttons, with the points
 * in them, so the scorer taps the side the winner stands on (Swap sides
 * follows the players when they change ends). Football, basketball and
 * other sports: a column of buttons per team under the header, and a
 * clock bar. Every tap goes in at once, stamped then; a name can be
 * added after ("Add scorer"). Undo, then Redo, like the cricket scorer.
 */
export function BoardScreen({
  board,
  onChange,
  onExit,
  onNewMatch,
  live,
  watchers = null,
}: {
  board: Board;
  onChange: (b: Board) => void;
  onExit: () => void;
  onNewMatch: () => void;
  /** Left out when the site has no live links. */
  live?: ShareLive;
  /** How many followers have the live link open (useWatchers), shown by the LIVE pill. */
  watchers?: Watchers | null;
}) {
  const view = useMemo(() => deriveBoard(board), [board]);
  const pad = useMemo(() => padFor(board, view), [board, view]);
  const parts = padParts(pad);
  const halves = isSetSport(board.sport);
  const [prefs, setPrefsState] = useState<BoardPrefs>(() => loadPrefs(board.id));
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [redo, setRedo] = useState<Board[]>([]);
  const [said, setSaid] = useState("");
  const timeIsUp = useTimeUp(view, wallNow);
  const lastTap = useRef(0);
  /**
   * The guard for the next pad tap when it is not the usual one: after
   * Undo the short window (that tap is likely the correction), after Go to
   * penalties the long one (the kick keys take the button's place).
   */
  const nextGuard = useRef<number | null>(null);
  const fired = useRef(new Set<string>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const rootRef = useRef<HTMLDivElement>(null);
  /** Token of the history entry pushed for the open sheet, so phone Back closes the sheet, not the scorer. Undefined until read. */
  const sheetEntry = useRef<number | null | undefined>(undefined);
  const exitAfterPop = useRef(false);
  const exitRef = useRef(onExit);

  const swapped = swappedNow(board, prefs);
  const sides = order(swapped);
  const isLive = view.status === "live";
  // Both prompts belong to the point that raised them: answered once, they stay answered (logic.ts promptKey).
  const key = promptKey(board);
  const seen = answered(prefs, key);
  const gameEnd = isLive && view.gameJustEnded && !seen ? view.gameJustEnded : null;
  const endsBanner = isLive && !gameEnd && view.changeEnds && !seen;

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

  const setPrefs = (p: BoardPrefs) => {
    setPrefsState(p);
    savePrefs(board.id, p);
  };

  /** One action per guard window: a double tap, or a tap that lands as a sheet closes, does nothing. */
  const guard = (ms: number) => {
    const now = tapClock();
    if (now - lastTap.current < ms) return false;
    lastTap.current = now;
    return true;
  };

  const showToast = (text: string, tone: Toast["tone"] = "info", extra: Pick<Toast, "redo" | "add"> = {}) => {
    setToast({ text, tone, ...extra });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), extra.redo || extra.add ? 5000 : 3500);
  };

  const fire = (key: string, ev: ToolEvent, params: Record<string, string | number | boolean>) => {
    const k = `${board.id}:${key}`;
    if (fired.current.has(k)) return;
    fired.current.add(k);
    trackTool(ev, TOOL, params);
  };

  /** Analytics, a few events a match: each game or set, each period, the end. */
  const track = (v: BoardView) => {
    const sets = v.sets.filter((x) => x.winner).length;
    if (sets) fire(`set:${sets}`, "tool_action", { action: "game_end", sport: v.sport, game: sets });
    if (v.period && v.period.index > 0) fire(`period:${v.period.index}`, "tool_action", { action: "period_end", sport: v.sport, period: v.period.index });
    if (v.status === "done") fire("end", "tool_result_generated", { action: "match_end", sport: v.sport, result: v.result?.kind ?? "none" });
  };

  /** Apply one tap's events together, all stamped with the tap's time. */
  const commit = (events: BoardEvent[], action?: PadAction): boolean => {
    const at = wallNow();
    let b = board;
    for (const e of events) {
      const ev = stamp(e, at);
      const why = checkBoard(b, ev);
      if (why) {
        showToast(why, "error");
        return false;
      }
      b = applyBoard(b, ev);
    }
    lastTap.current = tapClock();
    const v2 = deriveBoard(b);
    setRedo([]);
    onChange(b);
    setSheet(null);
    const last = b.events[b.events.length - 1];
    if (action && last && offersName(action, board.sport, prefs.names)) showToast(v2.lastAction ?? "Saved", "info", { add: { index: b.events.length - 1, button: namePrompt(last).button } });
    else setToast(null);
    if (v2.sets.filter((x) => x.winner).length > view.sets.filter((x) => x.winner).length || v2.status !== view.status) vibrate([20, 40, 20]);
    setSaid(`${v2.lastAction ?? ""}. ${v2.result?.text ?? v2.headline}`);
    track(v2);
    return true;
  };

  const tap = (a: PadAction) => {
    if (a.disabled) {
      showToast(a.disabled, "warn");
      return;
    }
    // A finished game waits for "Start game N": an extra tap on the winning point must not score in the next one.
    if (gameEnd && (a.event.type === "point" || a.event.type === "serve")) return;
    if (!guard(nextGuard.current ?? guardMs(a))) return;
    nextGuard.current = null;
    vibrate();
    if (a.event.type === "period") {
      // Full time (or the last period) ends the match: say what the result will be first.
      const v2 = deriveBoard(applyBoard(board, stamp(a.event, wallNow())));
      if (v2.status === "done") {
        setSheet({ k: "confirm", action: a, body: `${v2.result?.text ?? "The match ends"}. Undo brings it back.` });
        return;
      }
    }
    commit([a.event], a);
  };

  const undo = () => {
    if (!board.events.length || !guard(TAP_GUARD_MS)) return;
    vibrate(10);
    const what = view.lastAction ?? "the last tap";
    const b = undoBoard(board);
    setRedo((r) => [...r.slice(-49), board]);
    onChange(b);
    nextGuard.current = TAP_GUARD_MS;
    setSheet(null);
    showToast(`Took back ${what}`, "info", { redo: true });
    setSaid(`Undone. ${deriveBoard(b).headline}`);
  };

  const redoLast = () => {
    const prev = redo[redo.length - 1];
    if (!prev) return;
    setRedo((r) => r.slice(0, -1));
    onChange(prev);
    // The toast goes from over the pad: a second tap of a double tap must not land on a half.
    lastTap.current = tapClock();
    nextGuard.current = null;
    setToast(null);
    setSaid(`Redone. ${deriveBoard(prev).headline}`);
  };

  /** The name sheet's save: the name goes on the tap that already counted, if it is still the last one. Redo is left alone. */
  const savePlayer = (index: number, name: string, tag?: Tag) => {
    const b = withPlayer(board, index, name, tag);
    setSheet(null);
    if (!b) {
      showToast("Something was added after that tap, so the name could not go on it.", "error");
      return;
    }
    onChange(b);
    setToast(null);
    setSaid(`${name} added. ${deriveBoard(b).lastAction ?? ""}`);
  };

  const openSheet = (s: SheetState) => {
    lastTap.current = tapClock();
    setSheet(s);
  };

  const closeSheet = () => {
    lastTap.current = tapClock();
    setSheet(null);
  };

  const startNext = (swap: boolean) => {
    // The panel takes the halves' place as the winning point lands: the second touch of a double tap does nothing.
    if (!guard(RALLY_GUARD_MS)) return;
    setPrefs(answer(prefs, key, swap, board));
    vibrate();
  };

  /** Swap sides: answers the Change ends banner when it is up, else the scorer's own swap. */
  const swapSides = () => {
    lastTap.current = tapClock();
    setPrefs(endsBanner ? answer(prefs, key, true, board) : { ...prefs, swap: !prefs.swap });
  };

  const fixServe = parts.wide.get("fix-serve");
  const fixNumber = parts.wide.get("fix-number");

  const onMore = (a: MoreAction) => {
    switch (a) {
      case "names":
        openSheet({ k: "names" });
        break;
      case "rules":
        openSheet({ k: "rules" });
        break;
      case "share":
        openSheet({ k: "share", at: wallNow() });
        break;
      case "details":
        openSheet({ k: "details" });
        break;
      case "end":
        openSheet({ k: "end", at: wallNow() });
        break;
      case "swap":
        swapSides();
        setSheet(null);
        break;
      case "players":
        setPrefs({ ...prefs, names: !prefs.names });
        setSheet(null);
        break;
      case "server":
        if (fixServe) commit([fixServe.event]);
        break;
      case "number":
        if (fixNumber) commit([fixNumber.event]);
        break;
      case "matches":
        // Close the sheet's history entry first, then leave the scorer once that Back lands.
        if (sheetEntry.current) exitAfterPop.current = true;
        setSheet(null);
        if (!exitAfterPop.current) onExit();
        break;
    }
  };

  // Desktop keys: the arrow keys score for the left or right half, U undoes.
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      // A held key repeats: one press, one point.
      if (e.repeat || sheet || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      const half = (s: Side) => parts[s].find((x) => x.tone === "primary");
      if (k === "u") undo();
      else if (halves && !gameEnd && (k === "arrowleft" || k === "arrowright")) {
        const a = half(k === "arrowleft" ? sides[0] : sides[1]);
        if (a) tap(a);
      } else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const names = `${view.teams.a.name} vs ${view.teams.b.name}`;
  // Level at full time with penalties off: one tap turns them on and the shootout starts (the page promises this).
  const penaltiesOn: BoardEvent = { type: "rules", rules: { penalties: true } };
  const toPenalties = !isLive && board.sport === "football" && view.result?.kind === "draw" && !checkBoard(board, penaltiesOn) ? penaltiesOn : null;
  const canUndo = board.events.length > 0;
  const add = toast?.add;
  const toastEl = toast && (
    <div role={toast.tone === "error" ? "alert" : "status"} className={`absolute left-3 right-3 bottom-full mb-2 z-10 rounded-2xl pl-4 pr-2 py-2 min-h-14 shadow-elevated flex items-center gap-2 text-[14px] font-semibold ${toast.tone === "error" ? "bg-red-600 text-white" : toast.tone === "warn" ? "bg-amber-300 text-amber-950" : "bg-primary-900 text-white"}`}>
      <span className="flex-1 min-w-0">{toast.text}</span>
      {add && (
        <button type="button" onClick={() => openSheet({ k: "player", index: add.index })} className="shrink-0 inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full bg-accent-500 text-white text-[14px] font-bold">
          <UserPlus className="w-4 h-4" aria-hidden /> {add.button}
        </button>
      )}
      {toast.redo && redo.length > 0 && (
        <button type="button" onClick={redoLast} className="shrink-0 inline-flex items-center gap-1 h-11 px-3 rounded-full bg-white/15 text-[14px] font-bold">
          <Redo2 className="w-4 h-4" aria-hidden /> Redo
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          lastTap.current = tapClock();
          nextGuard.current = null;
          setToast(null);
        }}
        aria-label="Dismiss"
        className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-white/15">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
  const undoKey = (
    <button type="button" onClick={undo} disabled={!canUndo} aria-label={`Undo${view.lastAction ? `: ${view.lastAction}` : ""}`} className={`${KEY} h-14 border-2 border-primary-300 bg-primary-50 text-primary-800 inline-flex flex-col items-center justify-center gap-0.5 active:bg-primary-200`}>
      <Undo2 className="w-5 h-5" aria-hidden />
      <span className="text-[13px] leading-none">Undo</span>
    </button>
  );
  const donePanel = (
    <div className="h-full rounded-3xl bg-primary-900 text-white p-5 flex flex-col items-center justify-center text-center gap-2">
      <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">{view.result?.kind === "abandoned" ? "No result" : "Result"}</p>
      <p className="text-[24px] font-bold leading-tight">{view.result?.text ?? "Match over"}</p>
      <p className="text-[15px] text-white/75">{view.headline}</p>
      <div className="mt-3 w-full max-w-sm grid grid-cols-2 gap-2">
        <button type="button" onClick={() => openSheet({ k: "share", at: wallNow() })} className="press-tight inline-flex items-center justify-center gap-2 h-14 rounded-full bg-accent-500 text-white text-[16px] font-bold hover:bg-accent-600">
          <Share2 className="w-4 h-4" aria-hidden /> Share result
        </button>
        <button type="button" onClick={() => guard(RALLY_GUARD_MS) && onNewMatch()} className="press-tight inline-flex items-center justify-center gap-2 h-14 rounded-full bg-white/10 text-white text-[16px] font-bold hover:bg-white/20">
          <Plus className="w-4 h-4" aria-hidden /> New match
        </button>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} tabIndex={-1} className="fixed inset-0 z-[70] bg-primary-100 outline-none" role="dialog" aria-modal="true" aria-label={`Live scoreboard, ${names}`}>
      <div className={`mx-auto h-full w-full max-w-6xl grid grid-cols-[minmax(0,1fr)] ${halves ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)_auto]"} lg:grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[440px_minmax(0,1fr)] lg:gap-4 lg:p-4`}>
        <BoardHeader
          view={view}
          board={board}
          now={wallNow}
          compact={halves}
          swapped={swapped}
          className="lg:col-start-1 lg:row-start-1 lg:rounded-3xl lg:overflow-hidden"
          onExit={onExit}
          onShare={() => openSheet({ k: "share", at: wallNow() })}
          onMore={() => openSheet({ k: "more" })}
          onTeam={() => openSheet({ k: "names" })}
          badge={
            live && pillTone(live.info) ? (
              <>
                <LivePill info={live.info} onClick={() => openSheet({ k: "share", at: wallNow() })} />
                <WatchCount watchers={watchers} tone="dark" />
              </>
            ) : undefined
          }
        />

        {/* Racquet sports keep the tabs to the side on a laptop; on a phone the halves get the room, and the tabs are a tap away. */}
        <BoardTabs view={view} className={`${halves ? "hidden lg:flex" : ""} lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:rounded-3xl lg:overflow-hidden lg:border lg:border-primary-200`} />

        {halves ? (
          <section className="min-h-0 flex flex-col lg:col-start-1 lg:row-start-2 lg:rounded-3xl lg:overflow-hidden lg:bg-white lg:border lg:border-primary-200" aria-label="Scoring pad">
            <HintStrip view={view} waiting={!!gameEnd} endsBanner={endsBanner} onSwap={swapSides} onDismiss={() => setPrefs(answer(prefs, key, false, board))} />
            <div className="flex-1 min-h-0 px-2 pb-2 grid grid-cols-2 gap-2">
              {!isLive ? (
                <div className="col-span-2 min-h-0">{donePanel}</div>
              ) : gameEnd ? (
                <GameEnd view={view} label={gameEnd.label} changeEnds={gameEnd.changeEnds} onStart={startNext} />
              ) : (
                sides.map((s) => <Half key={s} view={view} side={s} action={parts[s].find((x) => x.tone === "primary") ?? null} onTap={tap} />)
              )}
            </div>
            {(TIMEOUT_SPORTS.includes(board.sport) || parts.timeout.a || parts.timeout.b) && (
              <div className="grid grid-cols-2 gap-2 px-2 pb-2">
                {sides.map((s) => (
                  <SmallKey key={s} side={s} action={isLive && !gameEnd ? parts.timeout[s] : null} fallback="Timeout" onTap={tap} view={view} />
                ))}
              </div>
            )}
            <footer className="relative bg-white border-t border-primary-200 px-3 pt-2" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
              {toastEl}
              <div className="grid grid-cols-3 lg:grid-cols-2 gap-2">
                <button type="button" onClick={swapSides} className={`${KEY} h-14 border-2 border-primary-200 bg-white text-primary-800 inline-flex flex-col items-center justify-center gap-0.5 active:bg-primary-100`}>
                  <ArrowLeftRight className="w-5 h-5" aria-hidden />
                  <span className="text-[13px] leading-none">Swap sides</span>
                </button>
                <button type="button" onClick={() => openSheet({ k: "details" })} className={`${KEY} lg:hidden h-14 border-2 border-primary-200 bg-white text-primary-800 inline-flex flex-col items-center justify-center gap-0.5 active:bg-primary-100`}>
                  <ListOrdered className="w-5 h-5" aria-hidden />
                  <span className="text-[13px] leading-none">Timeline</span>
                </button>
                {undoKey}
              </div>
              <p className="hidden lg:block mt-2 text-center text-[12px] text-primary-500">Keys: left and right arrows score for that side, U undo</p>
            </footer>
          </section>
        ) : (
          <footer className="relative bg-white border-t border-primary-200 px-3 pt-2 lg:col-start-1 lg:row-start-2 lg:self-start lg:rounded-3xl lg:border" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            {toastEl}
            {isLive ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {sides.map((s) => {
                    const t = parts.timeout[s];
                    return <Column key={s} view={view} side={s} actions={t ? [...parts[s], t] : parts[s]} onTap={tap} />;
                  })}
                </div>
              </>
            ) : (
              <>
                {toPenalties && (
                  <button type="button" onClick={() => {
                      if (guard(RALLY_GUARD_MS) && commit([toPenalties])) nextGuard.current = RALLY_GUARD_MS;
                    }} className="press-tight mb-2 w-full inline-flex items-center justify-center gap-2 h-14 rounded-full border-2 border-primary-900 bg-white text-primary-900 text-[16px] font-bold active:bg-primary-100">
                    <Goal className="w-5 h-5" aria-hidden /> Go to penalties
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => openSheet({ k: "share", at: wallNow() })} className="press-tight inline-flex items-center justify-center gap-2 h-14 rounded-full bg-accent-500 text-white text-[16px] font-bold hover:bg-accent-600">
                    <Share2 className="w-4 h-4" aria-hidden /> Share result
                  </button>
                  <button type="button" onClick={() => guard(RALLY_GUARD_MS) && onNewMatch()} className="press-tight inline-flex items-center justify-center gap-2 h-14 rounded-full bg-primary-900 text-white text-[16px] font-bold hover:bg-primary-800">
                    <Plus className="w-4 h-4" aria-hidden /> New match
                  </button>
                </div>
              </>
            )}
            <ClockBar view={view} parts={parts} timeIsUp={timeIsUp} onTap={tap} onSetTime={() => openSheet({ k: "time", at: wallNow() })} onMore={() => openSheet({ k: "more" })} undoKey={undoKey} />
          </footer>
        )}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </p>

      {sheet?.k === "more" && (
        <MoreSheet
          view={view}
          extras={{
            server: fixServe?.sub,
            number: fixNumber?.sub,
            swap: true,
            swapped,
            penalties: !!toPenalties,
            players: board.sport === "basketball" ? prefs.names : undefined,
            details: halves,
          }}
          onAction={onMore}
          onClose={closeSheet}
        />
      )}
      {sheet?.k === "names" && <NamesSheet view={view} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "rules" && <RulesSheet board={board} view={view} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "end" && <EndSheet board={board} view={view} now={sheet.at} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "time" && <SetTimeSheet view={view} now={sheet.at} onCommit={commit} onClose={closeSheet} />}
      {sheet?.k === "player" && board.events[sheet.index] && <PlayerSheetFor board={board} view={view} index={sheet.index} onSave={(n, t) => savePlayer(sheet.index, n, t)} onClose={closeSheet} />}
      {sheet?.k === "details" && (
        <Sheet title="Timeline and stats" onClose={closeSheet} wide>
          <BoardTabs view={view} className="-mx-4 -mt-3" />
        </Sheet>
      )}
      {sheet?.k === "share" && (
        <ShareSheet
          text={boardShareText(view, { ...(live?.url ? { link: live.url } : {}), now: sheet.at })}
          title={isLive ? "Share live score" : "Share the result"}
          live={live}
          words={BOARD_WORDS}
          onShared={(how) => trackTool("tool_cta_clicked", TOOL, { href: "share", how, status: view.status, sport: board.sport })}
          onClose={closeSheet}
        />
      )}
      {sheet?.k === "confirm" && <ConfirmSheet title={`${sheet.action.label}?`} body={sheet.body} confirm={sheet.action.label} onConfirm={() => commit([sheet.action.event], sheet.action)} onClose={closeSheet} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pad pieces                                                          */
/* ------------------------------------------------------------------ */

const KEY = "press-tight relative rounded-2xl font-bold select-none touch-manipulation transition-colors disabled:opacity-30 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent-500";

/** Spoken name of a button: "Goal for Red FC", "Asha serves first". */
const spoken = (view: BoardView, a: PadAction) => {
  const name = a.side ? view.teams[a.side].name : "";
  if (a.event.type === "serve") return a.label;
  return `${a.label}${a.sub ? `, ${a.sub}` : ""}${name ? ` for ${name}` : ""}`;
};

/** One half of the racquet pad: the side's name, its points, and what a tap does. */
function Half({ view, side, action, onTap }: { view: BoardView; side: Side; action: PadAction | null; onTap: (a: PadAction) => void }) {
  const t = TEAM[side];
  const name = view.teams[side].name;
  const serving = !view.needsServe && view.server === side;
  const pick = action?.event.type === "serve";
  return (
    <button
      type="button"
      onClick={() => action && onTap(action)}
      disabled={!action}
      aria-label={action ? spoken(view, action) : name}
      className={`${KEY} h-full min-h-0 w-full rounded-3xl ${t.key} ${t.press} px-2 py-3 flex flex-col items-center justify-between gap-1 overflow-hidden`}
    >
      <span className="w-full flex flex-col items-center gap-1.5">
        <span className="max-w-full text-[17px] font-bold leading-tight text-center line-clamp-2 break-words">{name}</span>
        {/* Always laid out, so the score does not jump when the serve changes sides. */}
        <span className={`flex flex-col items-center gap-0.5 ${serving ? "" : "invisible"}`} aria-hidden={!serving}>
          <span className="h-6 px-2.5 inline-flex items-center gap-1.5 rounded-full bg-amber-300 text-amber-950 text-[12px] font-extrabold">
            <span className="w-2 h-2 shrink-0 rounded-full bg-amber-950" aria-hidden />
            Serving
          </span>
          <span className="h-5 max-w-full text-[15px] font-bold leading-5 text-amber-200 truncate">{view.serveNote ?? ""}</span>
        </span>
      </span>
      {pick ? (
        <span className="text-[64px] leading-none" aria-hidden>
          {sportIcon(view.sport)}
        </span>
      ) : (
        <span className="font-display font-bold tabular-nums leading-[0.85] text-[clamp(72px,26vw,150px)] [@media(max-height:620px)]:text-[64px]" aria-hidden>
          {bigScore(view, side)}
        </span>
      )}
      <span className="w-full text-center">
        <span className="block text-[16px] font-bold leading-tight">{action?.label ?? ""}</span>
        <span className="block h-5 text-[13px] font-semibold text-white/75 truncate">{action?.sub ?? ""}</span>
      </span>
    </button>
  );
}

/** A game or set just ended: say so, and start the next one, with the ends changed or not. Point taps wait for it. */
function GameEnd({ view, label, changeEnds, onStart }: { view: BoardView; label: string; changeEnds: boolean; onStart: (swap: boolean) => void }) {
  const unit = unitWord(view);
  const n = view.sets.length;
  const swapLabel = `Swap sides and start ${unit} ${n}`;
  const plainLabel = `Start ${unit} ${n}`;
  const first = changeEnds ? { label: swapLabel, swap: true } : { label: plainLabel, swap: false };
  const second = changeEnds ? { label: plainLabel, swap: false } : { label: swapLabel, swap: true };
  return (
    <div role="status" className="col-span-2 min-h-0 rounded-3xl bg-white border-2 border-primary-200 px-4 py-5 flex flex-col items-center justify-center text-center gap-2 overflow-y-auto">
      <p className="text-[12px] font-bold uppercase tracking-wide text-accent-700">{unit === "set" ? "Set over" : "Game over"}</p>
      <p className="text-[24px] font-bold leading-tight text-primary-900">{label}</p>
      <p className="text-[15px] text-primary-600">{changeEnds ? `Players change ends now.${view.needsServe ? " Then pick who serves." : ""}` : view.needsServe ? "New toss: pick who serves next." : "Same ends."}</p>
      <div className="mt-3 w-full max-w-sm grid gap-2">
        <button type="button" onClick={() => onStart(first.swap)} className="press-tight w-full min-h-14 px-4 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600 inline-flex items-center justify-center gap-2">
          {first.swap && <ArrowLeftRight className="w-5 h-5 shrink-0" aria-hidden />} {first.label}
        </button>
        <button type="button" onClick={() => onStart(second.swap)} className="press-tight w-full min-h-12 px-4 rounded-full border-2 border-primary-200 bg-white text-primary-800 text-[15px] font-bold inline-flex items-center justify-center gap-2">
          {second.swap && <ArrowLeftRight className="w-4 h-4 shrink-0" aria-hidden />} {second.label}
        </button>
      </div>
    </div>
  );
}

/** One fixed-height line over the halves: what to tap, or the mid-game change of ends with its Swap button. */
function HintStrip({ view, waiting, endsBanner, onSwap, onDismiss }: { view: BoardView; waiting: boolean; endsBanner: boolean; onSwap: () => void; onDismiss: () => void }) {
  if (endsBanner)
    return (
      <div role="status" className="h-14 shrink-0 mx-2 my-1.5 pl-3.5 pr-1 flex items-center gap-1.5 rounded-2xl bg-amber-300 text-amber-950">
        <p className="flex-1 min-w-0 text-[15px] font-extrabold leading-tight">Change ends</p>
        <button type="button" onClick={onSwap} className="press-tight shrink-0 inline-flex items-center gap-1.5 h-11 px-3.5 rounded-full bg-amber-950 text-white text-[14px] font-bold">
          <ArrowLeftRight className="w-4 h-4" aria-hidden /> Swap sides
        </button>
        <button type="button" onClick={onDismiss} aria-label="Keep the sides" className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-amber-200">
          <X className="w-5 h-5" />
        </button>
      </div>
    );
  const word = view.sport === "tennis" || view.sport === "padel" ? "point" : "rally";
  const text = view.status === "done" ? "Match over" : waiting ? "Points wait for the next one to start" : view.needsServe ? "Tap the side that serves first" : `Tap the side that won the ${word}`;
  return <p className="h-14 shrink-0 mx-2 my-1.5 flex items-center justify-center text-[14px] font-semibold text-primary-600">{text}</p>;
}

/** A team's column of buttons: the main one big in the team's colour, the rest two to a row under it. */
function Column({ view, side, actions, onTap }: { view: BoardView; side: Side; actions: PadAction[]; onTap: (a: PadAction) => void }) {
  const t = TEAM[side];
  const main = actions.filter((a) => a.tone === "primary");
  const rest = actions.filter((a) => a.tone !== "primary");
  return (
    <div className="min-w-0 flex flex-col gap-2">
      <p className="h-6 flex items-center gap-1.5 text-[13px] font-bold text-primary-900 min-w-0">
        <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${t.dot}`} aria-hidden />
        <span className="truncate">{view.teams[side].name}</span>
      </p>
      {main.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onTap(a)}
          aria-disabled={a.disabled ? true : undefined}
          aria-label={spoken(view, a)}
          title={a.disabled}
          className={`${KEY} h-16 [@media(max-height:700px)]:h-14 ${t.key} ${t.press} inline-flex flex-col items-center justify-center leading-none ${a.disabled ? "opacity-35" : ""}`}
        >
          <span className="text-[24px]">{a.label}</span>
          {a.sub && <span className="mt-1 text-[12px] font-semibold text-white/75">{a.sub}</span>}
        </button>
      ))}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {rest.map((a, i) => (
            <SmallKey key={a.id} side={side} action={a} onTap={onTap} view={view} wide={i === rest.length - 1 && rest.length % 2 === 1} />
          ))}
        </div>
      )}
    </div>
  );
}

const TONE: Record<PadAction["tone"], string> = {
  primary: "",
  plain: "bg-white border-2 text-primary-900 active:bg-primary-100",
  warn: "bg-amber-50 border-2 border-amber-300 text-amber-950 active:bg-amber-200",
  danger: "bg-red-600 border-2 border-red-700 text-white active:bg-red-800",
};

function SmallKey({ side, action, onTap, view, wide, fallback }: { side: Side; action: PadAction | null; onTap: (a: PadAction) => void; view?: BoardView; wide?: boolean; fallback?: string }) {
  if (!action)
    return (
      <button type="button" disabled className={`${KEY} h-12 bg-white border-2 border-primary-200 text-[14px] text-primary-900`}>
        {fallback}
      </button>
    );
  const border = action.tone === "plain" ? TEAM[side].border : "";
  return (
    <button
      type="button"
      onClick={() => onTap(action)}
      aria-disabled={action.disabled ? true : undefined}
      aria-label={view ? spoken(view, action) : undefined}
      title={action.disabled}
      className={`${KEY} min-h-12 px-1 py-1 ${TONE[action.tone]} ${border} ${wide ? "col-span-2" : ""} inline-flex flex-col items-center justify-center leading-none ${action.disabled ? "opacity-35" : ""}`}
    >
      {/* Short labels ("+3") big; longer ones ("Own goal") on one line on a 360 px phone. */}
      <span className={`whitespace-nowrap ${action.label.length > 4 ? "text-[14px]" : "text-[18px]"}`}>{action.label}</span>
      {action.sub && <span className={`mt-0.5 max-w-full text-[11px] font-semibold leading-tight line-clamp-2 ${action.tone === "danger" ? "text-white/80" : "opacity-70"}`}>{action.sub}</span>}
    </button>
  );
}

/** Start, pause and set the clock, end the period. When time is up, ending the period is the big button. */
function ClockBar({
  view,
  parts,
  timeIsUp,
  onTap,
  onSetTime,
  onMore,
  undoKey,
}: {
  view: BoardView;
  parts: ReturnType<typeof padParts>;
  timeIsUp: boolean;
  onTap: (a: PadAction) => void;
  onSetTime: () => void;
  onMore: () => void;
  undoKey: ReactNode;
}) {
  const clock = parts.wide.get("clock");
  const period = parts.wide.get("period");
  const live = view.status === "live";
  const up = live && timeIsUp && !!period;
  const items: ReactNode[] = [];
  if (live && clock) {
    const primary = clock.tone === "primary" && !up;
    const running = clock.event.type === "clock" && !clock.event.run;
    items.push(
      <button
        key="clock"
        type="button"
        onClick={() => onTap(clock)}
        aria-disabled={clock.disabled ? true : undefined}
        title={clock.disabled}
        className={`${KEY} h-14 px-1 text-[14px] leading-tight inline-flex flex-col items-center justify-center gap-0.5 ${primary ? "bg-accent-500 text-white active:bg-accent-700" : "border-2 border-primary-300 bg-white text-primary-900 active:bg-primary-100"} ${clock.disabled ? "opacity-35" : ""}`}
      >
        {running ? <Pause className="w-5 h-5" aria-hidden /> : <Play className="w-5 h-5" aria-hidden />}
        <span>{clock.label}</span>
      </button>,
    );
  }
  // No Set time in a shootout: the halves are over and the clock cannot be set.
  if (live && view.clock && view.currentLabel !== "Penalties") {
    items.push(
      <button key="time" type="button" onClick={onSetTime} className={`${KEY} h-14 px-1 text-[14px] leading-tight border-2 border-primary-200 bg-white text-primary-800 inline-flex flex-col items-center justify-center gap-0.5 active:bg-primary-100`}>
        <Timer className="w-5 h-5" aria-hidden />
        <span>Set time</span>
      </button>,
    );
  }
  if (live && period) {
    items.push(
      <button
        key="period"
        type="button"
        onClick={() => onTap(period)}
        className={`${KEY} h-14 px-1 text-[14px] leading-tight inline-flex flex-col items-center justify-center ${up ? "bg-accent-500 text-white active:bg-accent-700" : "border-2 border-primary-300 bg-white text-primary-900 active:bg-primary-100"}`}
      >
        <span>{period.label}</span>
        {up && <span className="mt-0.5 text-[11px] font-semibold text-white/85">{view.clock?.down ? "Time up" : "Stoppage time"}</span>}
      </button>,
    );
  }
  if (items.length < 2) {
    items.push(
      <button key="more" type="button" onClick={onMore} className={`${KEY} h-14 px-1 text-[14px] border-2 border-primary-200 bg-white text-primary-800 inline-flex flex-col items-center justify-center gap-0.5 active:bg-primary-100`}>
        <MoreHorizontal className="w-5 h-5" aria-hidden />
        <span className="leading-none">More</span>
      </button>,
    );
  }
  return (
    <div className="mt-2 grid grid-flow-col auto-cols-fr gap-2">
      {items}
      {undoKey}
    </div>
  );
}

/** The name sheet for the tap at index, with the names typed before for the right team. */
function PlayerSheetFor({ board, view, index, onSave, onClose }: { board: Board; view: BoardView; index: number; onSave: (name: string, tag?: Tag) => void; onClose: () => void }) {
  const e = board.events[index];
  const team = playerTeam(e);
  if (!team) return null;
  return <PlayerSheet title={namePrompt(e).title} team={view.teams[team].name} known={knownPlayers(board, team)} onSave={onSave} onClose={onClose} />;
}
