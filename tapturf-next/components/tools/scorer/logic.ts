// Relative, not "@/", so logic.test.ts compiles on its own (npm run test:scorer).
import { derive, newPlayerId, undoBall, type BallEvent, type BallWicket, type Extra, type Match, type MatchEvent, type MatchView, type Side } from "../../../lib/cricket/scoring";

/** Where the runs on a no-ball came from. */
export type NbSource = "bat" | "bye" | "legBye";

/**
 * One delivery from what the scorer tapped: the extra that was armed (or
 * none) and the number pressed. Runs on a wide, byes and leg byes go in
 * extraRuns, runs off the bat in runs, as the engine wants them.
 */
export function buildBall(extra: Extra, n: number, nb: NbSource = "bat", wicket?: BallWicket): BallEvent {
  const w = wicket ? { wicket } : {};
  switch (extra) {
    case "wide":
      return { type: "ball", runs: 0, extra: "wide", ...(n ? { extraRuns: n } : {}), ...w };
    case "noBall":
      if (nb === "bat" || !n) return { type: "ball", runs: n, extra: "noBall", ...w };
      return { type: "ball", runs: 0, extra: "noBall", extraRuns: n, noBallExtra: nb === "legBye" ? "legBye" : "bye", ...w };
    case "bye":
    case "legBye":
      // A run out off a bye with nothing run is just a run out on a fair ball.
      return n > 0 ? { type: "ball", runs: 0, extra, extraRuns: n, ...w } : { type: "ball", runs: 0, extra: "none", ...w };
    default:
      return { type: "ball", runs: n, extra: "none", ...w };
  }
}

/** Tapping an extra key twice: the plain version. A wide, a no-ball, one bye, one leg bye. */
export const plainRuns = (extra: Extra) => (extra === "bye" || extra === "legBye" ? 1 : 0);

/** Which numbers make sense for the armed extra. */
export function runAllowed(extra: Extra | null, nb: NbSource, n: number): boolean {
  if (extra === "wide") return n !== 6;
  if (extra === "bye" || extra === "legBye") return n >= 1 && n !== 6;
  if (extra === "noBall" && nb !== "bat") return n !== 6;
  return true;
}

/** "Wd+2", "Nb+4", "3lb": what a key does with the armed extra. */
export function keyHint(extra: Extra | null, nb: NbSource, n: number): string | null {
  if (!extra || !runAllowed(extra, nb, n)) return null;
  if (extra === "wide") return n ? `Wd+${n}` : "Wd";
  if (extra === "noBall") return n ? `Nb+${n}${nb === "bye" ? "b" : nb === "legBye" ? "lb" : ""}` : "Nb";
  return `${n}${extra === "bye" ? "b" : "lb"}`;
}

/** Give every event of one tap the same timestamp, so undo can take the whole tap back. */
export function stamp(events: MatchEvent[], at: number): MatchEvent[] {
  return events.map((e) => ({ ...e, at }));
}

const PICKS = new Set(["setBatter", "setBowler"]);

/**
 * What Undo does. The last tap is taken back as a whole (a wicket and the
 * batter who came in, the openers, a strike swap). A batter or bowler
 * picked because a ball asked for one (end of over, after a wicket) goes
 * back with that ball, since the pick only made sense after it.
 */
export function smartUndo(m: Match): { match: Match; removedBall: number | null } {
  const ev = m.events;
  if (!ev.length) return { match: m, removedBall: null };
  const last = ev[ev.length - 1];
  let i = ev.length - 1;
  if (last.at !== undefined) while (i > 0 && ev[i - 1].at === last.at) i--;
  const group = ev.slice(i);
  const before: Match = { ...m, events: ev.slice(0, i) };
  const ballIn = group.findIndex((e) => e.type === "ball");
  if (ballIn >= 0) return { match: before, removedBall: i + ballIn };
  if (group.every((e) => PICKS.has(e.type)) && i > 0 && ev[i - 1].type === "ball") {
    const v = derive(before);
    // Picks for a new innings stay their own step: undo goes back to the break.
    if (v.needs.length && v.current.byOver.length > 0) {
      let b = i - 1;
      while (b >= 0 && ev[b].type !== "ball") b--;
      return { match: undoBall(m), removedBall: b };
    }
  }
  return { match: before, removedBall: null };
}

export const cleanName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 40);

/** "Bowler 2" offered as an opening batter (or "Batter 3" as a bowler) only confuses: placeholders keep their role. */
export const placeholderOf = (name: string): "Batter" | "Bowler" | null => {
  const m = /^(Batter|Bowler) \d+$/i.exec(name.trim());
  return m ? (m[1].toLowerCase() === "batter" ? "Batter" : "Bowler") : null;
};

/**
 * The next "Batter 3" or "Bowler 2" for a side: after the highest one
 * used and after everyone who has batted (or bowled) this innings, so a
 * renamed "Batter 1" does not come back as a new player of that name.
 */
export function defaultName(view: MatchView, side: Side, kind: "Batter" | "Bowler", exclude: string[] = []): string {
  const names = view.teams[side].players.map((p) => p.name);
  const used = new Set([...names, ...exclude].map((x) => x.toLowerCase()));
  let max = 0;
  for (const n of names) if (placeholderOf(n) === kind) max = Math.max(max, Number(n.trim().split(" ")[1]));
  const inn = view.current;
  const count = kind === "Batter" && side === inn.batting ? inn.batters.length : kind === "Bowler" && side === inn.bowling ? inn.bowlers.length : 0;
  for (let n = Math.max(max, count) + 1; ; n++) if (!used.has(`${kind} ${n}`.toLowerCase())) return `${kind} ${n}`;
}

/** A typed or tapped name to a player: the roster player with that name, or a new one. */
export function resolvePlayer(m: Match, side: Side, name: string): { player: string; name?: string } {
  const clean = cleanName(name);
  const v = derive(m);
  const hit = v.teams[side].players.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (hit) return { player: hit.id };
  return { player: newPlayerId(m, side), name: clean };
}

/** Clocks for event handlers (taps, saves). Never called while rendering. */
export const tapClock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
export const wallClock = () => Date.now();

export function vibrate(pattern: number | number[] = 10) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

/** "." reads badly on a chip in the sun; show 0. */
export { chipText } from "./chip";

export const rate = (r: number | null) => (r === null ? "-" : r.toFixed(2));
