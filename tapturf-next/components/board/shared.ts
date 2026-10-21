import { SPORT_LIST } from "@/lib/board";
import type { BasketballRules, BoardSport, BoardView, FootballRules, OtherRules, PickleballRules, RallyRules, Side, TennisRules } from "@/lib/board/types";

/**
 * Looks and words the board header, tabs and the scorer's pad share, so
 * a team has one colour everywhere: side a dark with the green accent,
 * side b blue. Both carry white text at well over 4.5:1, for sunlight.
 */
export const TEAM: Record<Side, { key: string; press: string; bar: string; dot: string; text: string; soft: string; border: string }> = {
  a: { key: "bg-primary-900 text-white", press: "active:bg-black", bar: "bg-accent-400", dot: "bg-accent-500", text: "text-accent-300", soft: "bg-accent-50 text-accent-800", border: "border-primary-900" },
  b: { key: "bg-sky-700 text-white", press: "active:bg-sky-900", bar: "bg-sky-400", dot: "bg-sky-500", text: "text-sky-300", soft: "bg-sky-50 text-sky-800", border: "border-sky-700" },
};

/** Sports scored set by set (or game by game): the scorer taps who won each point. */
export const SET_SPORTS: readonly BoardSport[] = ["volleyball", "badminton", "pickleball", "tennis", "table-tennis", "padel"];
export const isSetSport = (s: BoardSport) => SET_SPORTS.includes(s);

/** Tennis and padel show the games of the set in play; the rally sports' game in play is the big score. */
export const showsSetInPlay = (s: BoardSport) => s === "tennis" || s === "padel";

export function sportIcon(sport: BoardSport): string {
  return SPORT_LIST.find((x) => x.sport === sport)?.icon ?? "🏅";
}

/** [left, right] as the scorer sees the court. */
export const order = (swapped?: boolean): [Side, Side] => (swapped ? ["b", "a"] : ["a", "b"]);

/** The match format in a few words, under the sport: "2 x 20 min", "Best of 3, to 21", "Best of 3 sets, star point". */
export function rulesLine(view: BoardView): string {
  switch (view.sport) {
    case "football": {
      const r = view.setup.rules as FootballRules;
      return `${r.halves} x ${r.halfMinutes} min${r.penalties ? ", penalties if level" : ""}`;
    }
    case "basketball": {
      const r = view.setup.rules as BasketballRules;
      const to = r.target !== null ? `first to ${r.target}${r.winBy > 1 ? ", win by 2" : ""}` : "";
      if (!r.clock) return to ? to.charAt(0).toUpperCase() + to.slice(1) : `${r.periods} periods`;
      return `${r.periods} x ${r.periodMinutes} min${to ? `, ${to}` : ""}`;
    }
    case "pickleball": {
      const r = view.setup.rules as PickleballRules;
      return `${r.scoring === "rally" ? "Rally scoring" : "Side-out"}, to ${r.points}${r.bestOf > 1 ? `, best of ${r.bestOf}` : ""}`;
    }
    case "tennis":
    case "padel": {
      const r = view.setup.rules as TennisRules;
      const sets = r.bestOf === 1 ? "1 set" : `Best of ${r.bestOf} sets`;
      const deuce = r.deuce === "golden" ? (view.sport === "tennis" ? ", no-ad" : ", golden point") : r.deuce === "star" ? ", star point" : "";
      return `${sets}${r.games !== 6 ? ` to ${r.games}` : ""}${r.finalSet === "match-tiebreak" ? ", match tiebreak" : ""}${deuce}`;
    }
    case "other": {
      const r = view.setup.rules as OtherRules;
      return r.target !== null ? `First to ${r.target}` : r.periods !== null ? `${r.periods} periods` : "Points";
    }
    default: {
      const r = view.setup.rules as RallyRules;
      const unit = view.sport === "volleyball" ? "set" : "game";
      return `${r.bestOf === 1 ? `1 ${unit}` : `Best of ${r.bestOf}`}, to ${r.points}`;
    }
  }
}

/** "Game" or "Set": what a racquet match is played in. */
export const unitWord = (view: BoardView) => (view.scoreUnit === "Sets" ? "set" : "game");

/** The big number for a side: the point or game score in play when there is one, else the score. */
export const bigScore = (view: BoardView, side: Side) => (view.current ? view.current[side] : String(view.teams[side].score));
