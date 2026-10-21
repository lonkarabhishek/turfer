// Relative, not "@/", so logic.test.ts compiles on its own.
import { applyBoard, checkBoard, deriveBoard, undoBoard } from "../../../lib/board";
import type { AnyRules, Board, BoardEvent, BoardSport, BoardView, EndEvent, PadAction, RulePreset, Side } from "../../../lib/board/types";

/**
 * The Live Scoreboard pad's decisions, kept apart from React so they can
 * be tested: which buttons go where, the tap guard, adding a player name
 * to a tap after the fact, the ways to end a match, rules changes and the
 * clock's "Set time".
 */

export const other = (s: Side): Side => (s === "a" ? "b" : "a");

/** Every event of a tap carries the tap's wall clock: minutes and the clock come from it, never from when a sheet closed. */
export function stamp(e: BoardEvent, now: number): BoardEvent {
  return { ...e, at: now } as BoardEvent;
}

/** A second tap this soon does nothing. Rally points get longer: no rally is that short, and a laggy re-tap on a mid-range phone would add a phantom point. */
export const TAP_GUARD_MS = 250;
export const RALLY_GUARD_MS = 500;
export const guardMs = (a: Pick<PadAction, "event">) => (a.event.type === "point" && !a.event.how && !a.event.value ? RALLY_GUARD_MS : TAP_GUARD_MS);

/** The pad's actions by where they go: each side's column (or half), each side's timeout strip, and the match-wide ones by id. */
export type PadParts = { a: PadAction[]; b: PadAction[]; timeout: Record<Side, PadAction | null>; wide: Map<string, PadAction> };

export function padParts(pad: readonly PadAction[]): PadParts {
  const parts: PadParts = { a: [], b: [], timeout: { a: null, b: null }, wide: new Map() };
  for (const p of pad) {
    if (p.side === null) parts.wide.set(p.id, p);
    // Timeouts sit in a strip under each side, never inside the half a point tap lands on.
    else if (p.event.type === "timeout") parts.timeout[p.side] = p;
    else parts[p.side].push(p);
  }
  return parts;
}

/** Whether a tap offers "Add player" afterwards. Basketball only when the scorer asked for names: a basket every 15 seconds. */
export function offersName(a: Pick<PadAction, "ask">, sport: BoardSport, basketballNames: boolean): boolean {
  return a.ask === "player" && (sport !== "basketball" || basketballNames);
}

/** The team whose player the event names: an own goal is put in by the other team. */
export function playerTeam(e: BoardEvent): Side | null {
  if (e.type === "point") return e.how === "own-goal" ? other(e.side) : e.side;
  if (e.type === "card" || e.type === "foul") return e.side;
  return null;
}

/** The name sheet's question and the toast's button for an event. */
export function namePrompt(e: BoardEvent): { title: string; button: string } {
  if (e.type === "card") return { title: "Who got the card?", button: "Add player" };
  if (e.type === "foul") return { title: "Whose foul?", button: "Add player" };
  if (e.type === "point" && e.how === "own-goal") return { title: "Who put it in?", button: "Add player" };
  if (e.type === "point" && (e.how === "shootout-goal" || e.how === "shootout-miss")) return { title: "Who took the kick?", button: "Add kicker" };
  return { title: "Who scored?", button: "Add scorer" };
}

/** Names already typed for a team, newest first, for one-tap chips. */
export function knownPlayers(board: Board, team: Side, max = 12): string[] {
  const out: string[] = [];
  for (let i = board.events.length - 1; i >= 0 && out.length < max; i--) {
    const e = board.events[i];
    const p = "player" in e ? e.player : undefined;
    if (p && playerTeam(e) === team && !out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
  }
  return out;
}

/**
 * The board with a player name put on the event at index, which must
 * still be the last one: the tap went in at once (stamped then), the
 * name comes after. Null when something else has been added since, or
 * the engine will not take it.
 */
export function withPlayer(board: Board, index: number, name: string): Board | null {
  const last = board.events[board.events.length - 1];
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean || index !== board.events.length - 1 || !last || playerTeam(last) === null) return null;
  const before = undoBoard(board);
  const next = applyBoard(before, { ...last, player: clean } as BoardEvent);
  return next === before ? null : next;
}

/* ------------------------------------------------------------------ */
/* Ending a match                                                      */
/* ------------------------------------------------------------------ */

export type EndReason = "time" | "retired" | "conceded" | "walkover" | "abandoned";

export const END_REASONS: { reason: EndReason; label: string; detail: string }[] = [
  { reason: "time", label: "Time up", detail: "Result on the score now" },
  { reason: "retired", label: "Retired", detail: "Injured or cannot go on" },
  { reason: "conceded", label: "Conceded", detail: "Gave up or walked off" },
  { reason: "walkover", label: "Walkover", detail: "Did not turn up" },
  { reason: "abandoned", label: "Abandoned", detail: "Rain, light or a fight. No result" },
];

/** The end event for a reason (and the side that stops, for retired, conceded and walkover). */
export function endEvent(reason: EndReason, side: Side | null): EndEvent | null {
  if (reason === "time") return { type: "end" };
  if (reason === "abandoned") return { type: "end", reason: "abandoned" };
  return side ? { type: "end", reason, side } : null;
}

/** What ending now would say, or why the engine will not take it. */
export function endPreview(board: Board, e: EndEvent, now: number): { error: string } | { result: string } {
  const ev = stamp(e, now);
  const error = checkBoard(board, ev);
  if (error) return { error };
  const v = deriveBoard(applyBoard(board, ev));
  return { result: v.result?.text ?? v.headline };
}

/** A reason the engine takes for at least one side (or none needed). */
export function reasonAllowed(board: Board, reason: EndReason, now: number): boolean {
  const sides: (Side | null)[] = reason === "time" || reason === "abandoned" ? [null] : ["a", "b"];
  return sides.some((s) => {
    const e = endEvent(reason, s);
    return !!e && !("error" in endPreview(board, e, now));
  });
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/** A preset chip is on when every rule it sets is in force. */
export function optionOn(rules: AnyRules, option: RulePreset<AnyRules>["options"][number]): boolean {
  const r = rules as Record<string, unknown>;
  return Object.entries(option.rules).every(([k, v]) => same(r[k], v));
}

/** The keys that changed, for a rules event that only carries what it changes. */
export function rulesDiff(current: AnyRules, next: AnyRules): Partial<AnyRules> {
  const c = current as Record<string, unknown>;
  return Object.fromEntries(Object.entries(next as Record<string, unknown>).filter(([k, v]) => !same(c[k], v))) as Partial<AnyRules>;
}

/* ------------------------------------------------------------------ */
/* Set time                                                            */
/* ------------------------------------------------------------------ */

/**
 * The value the scorer types, as people read the clock: football's match
 * clock (52:10 in the 2nd half), basketball's time left. Back to the
 * period clock's ms (elapsed up, left down), or why it does not fit.
 */
export function setTimeMs(view: BoardView, minutes: number, seconds: number): { ms: number } | { error: string } {
  const c = view.clock;
  if (!c) return { error: "This match has no clock" };
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0 || seconds > 59) return { error: "Type minutes, and seconds from 0 to 59" };
  const typed = (Math.floor(minutes) * 60 + Math.floor(seconds)) * 1000;
  if (c.down) {
    if (c.limitMs !== null && typed > c.limitMs) return { error: `A ${Math.round(c.limitMs / 60_000)} minute period has at most ${Math.round(c.limitMs / 60_000)}:00 left` };
    return { ms: typed };
  }
  const ms = typed - c.baseMs;
  if (ms < 0) {
    const m = Math.round(c.baseMs / 60_000);
    return { error: `This half starts at ${m}:00. Type ${m}:00 or more` };
  }
  return { ms };
}

/** The clock as the Set time boxes show it at `shown` (the period value): match minutes and seconds. */
export function clockParts(view: BoardView, shown: number): { minutes: number; seconds: number } {
  const c = view.clock;
  const total = Math.max(0, c ? (c.down ? Math.ceil(shown / 1000) : Math.floor((c.baseMs + shown) / 1000)) : 0);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}
