"use client";

import type { ReactNode } from "react";
import { TagHandle } from "@/components/account/TagHandle";
import { ChevronLeft, MoreHorizontal, Share2 } from "lucide-react";
import type { Board, BoardView, Side } from "@/lib/board/types";
import { BoardClock } from "./BoardClock";
import { TEAM, bigScore, isSetSport, order, rulesLine, showsSetInPlay, sportIcon } from "./shared";

/**
 * The score header, shared by the Live Scoreboard's scorer and the
 * follower page (/live/<code>), so the two cannot drift apart. Without
 * handlers it is read only. Every row has a fixed height, so a point,
 * a notice or a server change never moves anything below it.
 *
 * compact: the scorer's racquet pad shows the big points inside its two
 * halves, so the header drops them and shows the games table instead.
 * swapped: the scorer's "Swap sides", side b on the left.
 */

const ICON_BUTTON = "w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-white/10";

export function BoardHeader({
  view,
  now,
  badge,
  onExit,
  onShare,
  onMore,
  onTeam,
  swapped,
  compact,
  className = "",
}: {
  view: BoardView;
  /** Taken for callers that have it; everything shown comes from the view. */
  board?: Board;
  /** The clock's now in the scorer's clock domain: Date.now for the scorer, boardNow(...) for a follower. */
  now: () => number;
  /** Next to the sport: the scorer's LIVE pill, the follower's live badge, the eye count. */
  badge?: ReactNode;
  onExit?: () => void;
  onShare?: () => void;
  onMore?: () => void;
  /** Tap a team name (rename). */
  onTeam?: (side: Side) => void;
  swapped?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const s = view.setup;
  const sides = order(swapped);
  const setSport = isSetSport(view.sport);
  const done = view.status === "done";

  return (
    <header className={`bg-primary-900 text-white ${className}`}>
      <div className="flex items-center gap-1 px-1.5 h-12">
        {onExit && (
          <button type="button" onClick={onExit} aria-label="Leave the scorer. The match is saved." className={ICON_BUTTON}>
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="flex-1 min-w-0 text-center">
          <div className="flex items-center justify-center gap-1.5 min-w-0">
            <p className="text-[13px] font-semibold truncate min-w-0">
              <span aria-hidden>{sportIcon(view.sport)} </span>
              {view.sportName}
              {s.title ? ` · ${s.title}` : ""}
            </p>
            {badge}
          </div>
          <p className="text-[11px] text-white/60 truncate">
            {rulesLine(view)}
            {s.venue ? ` · ${s.venue}` : ""}
          </p>
        </div>
        {onShare && (
          <button type="button" onClick={onShare} aria-label="Share live score" className={ICON_BUTTON}>
            <Share2 className="w-5 h-5" />
          </button>
        )}
        {onMore && (
          <button type="button" onClick={onMore} aria-label="More options" className={ICON_BUTTON}>
            <MoreHorizontal className="w-6 h-6" />
          </button>
        )}
      </div>

      {compact && setSport ? <GamesTable view={view} sides={sides} onTeam={onTeam} /> : <ScoreRow view={view} sides={sides} now={now} onTeam={onTeam} />}
      {!compact && setSport && <SetsStrip view={view} sides={sides} />}

      <Band view={view} done={done} />
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

function TeamName({ view, side, onTeam, align }: { view: BoardView; side: Side; onTeam?: (side: Side) => void; align: "left" | "right" }) {
  const name = view.teams[side].name;
  const serving = view.status === "live" && view.server === side;
  const inner = (
    <>
      {serving && align === "right" && <ServeDot />}
      <span className="truncate">{name}</span>
      {serving && align === "left" && <ServeDot />}
    </>
  );
  const cls = `min-w-0 max-w-full inline-flex items-center gap-1.5 text-[15px] font-bold leading-tight`;
  return onTeam ? (
    <button type="button" onClick={() => onTeam(side)} aria-label={`${name}${serving ? ", serving" : ""}. Rename`} className={`${cls} min-h-8 -my-1 underline decoration-white/25 underline-offset-4 hover:decoration-white/70`}>
      {inner}
    </button>
  ) : (
    <p className={cls}>
      {inner}
      {serving && <span className="sr-only">, serving</span>}
    </p>
  );
}

/** The ball by the server's name. */
function ServeDot() {
  return <span className="w-2.5 h-2.5 shrink-0 rounded-full bg-amber-300 ring-2 ring-amber-300/30" aria-hidden />;
}

/** Names and the big scores either side; the period and clock, or games won, in the middle. */
function ScoreRow({ view, sides, now, onTeam }: { view: BoardView; sides: [Side, Side]; now: () => number; onTeam?: (side: Side) => void }) {
  const setSport = isSetSport(view.sport);
  const shootout = view.sport === "football" && view.currentLabel === "Penalties" && view.current;
  const team = (side: Side, align: "left" | "right") => (
    <div className={`min-w-0 flex flex-col ${align === "left" ? "items-start text-left" : "items-end text-right"}`}>
      <TeamName view={view} side={side} onTeam={onTeam} align={align} />
      {view.teams[side].tag && <TagHandle tag={view.teams[side].tag!} link={!onTeam} className="text-[12px] font-semibold text-accent-300 leading-tight" />}
      <p className="mt-1 font-display text-[56px] [@media(max-height:700px)]:text-[46px] leading-[0.95] font-bold tabular-nums">{setSport ? bigScore(view, side) : view.teams[side].score}</p>
      <span className={`mt-1.5 h-1 w-10 rounded-full ${TEAM[side].bar}`} aria-hidden />
      {/* Always there in the serving sports, so the row keeps its height whoever serves. */}
      {setSport && <p className="mt-1 h-4 text-[12px] font-semibold leading-4 text-amber-200 truncate max-w-full">{view.status === "live" && view.server === side && view.serveNote ? view.serveNote : ""}</p>}
    </div>
  );
  let middle: ReactNode;
  if (setSport) {
    middle = view.current ? (
      <>
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/60">{view.scoreUnit}</p>
        <p className="text-[24px] font-bold tabular-nums leading-tight">
          {view.teams[sides[0]].score}-{view.teams[sides[1]].score}
        </p>
      </>
    ) : (
      <p className="text-[24px] font-bold text-white/40" aria-hidden>
        -
      </p>
    );
  } else if (shootout) {
    middle = (
      <>
        <p className="text-[11px] font-bold uppercase tracking-wide text-amber-200">Penalties</p>
        <p className="text-[24px] font-bold tabular-nums leading-tight">
          {shootout[sides[0]]}-{shootout[sides[1]]}
        </p>
      </>
    );
  } else {
    middle = (
      <>
        <p className="text-[11px] font-bold uppercase tracking-wide text-white/60 whitespace-nowrap">{view.period?.label ?? view.scoreUnit}</p>
        {view.clock ? (
          <BoardClock view={view} now={now} className="block text-[24px] font-bold leading-tight" />
        ) : (
          <p className="text-[24px] font-bold text-white/40" aria-hidden>
            -
          </p>
        )}
      </>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 pt-1 pb-2">
      {team(sides[0], "left")}
      <div className="text-center px-1 min-w-[64px]">{middle}</div>
      {team(sides[1], "right")}
    </div>
  );
}

/** The scores of the sets or games so far, "21-17 · 8-6", on one line under the big scores. */
function SetsStrip({ view, sides }: { view: BoardView; sides: [Side, Side] }) {
  const sets = setsShown(view);
  return (
    <div className="h-8 px-4 flex items-center justify-center gap-1.5 overflow-hidden" aria-label={sets.length ? `${view.scoreUnit === "Sets" ? "Sets" : "Games"}: ${sets.map((x) => `${x[sides[0]]}-${x[sides[1]]}`).join(", ")}` : undefined}>
      {sets.map((x, i) => (
        <span key={i} aria-hidden className={`shrink-0 h-6 px-2 inline-flex items-center rounded-full text-[13px] font-bold tabular-nums ${x.live ? "bg-white text-primary-900" : "bg-white/10 text-white/85"}`}>
          {x.match ? "[" : ""}
          {x[sides[0]]}-{x[sides[1]]}
          {x.match ? "]" : ""}
          {x.tb && <sup className="ml-0.5 text-[10px]">{x.tb}</sup>}
        </span>
      ))}
    </div>
  );
}

type SetCell = { a: number; b: number; live: boolean; tb: number | null; match: boolean; winner: Side | null };

/** Finished sets, plus tennis's set in play (its games); a rally game in play is the big score already. */
function setsShown(view: BoardView): SetCell[] {
  const inPlay = showsSetInPlay(view.sport) && view.status === "live";
  return view.sets
    .map((x, i) => ({ ...x, i }))
    .filter((x) => x.winner !== null || (inPlay && x.i === view.sets.length - 1))
    .map((x) => ({ a: x.a, b: x.b, live: x.winner === null, tb: x.tiebreak ? Math.min(x.tiebreak.a, x.tiebreak.b) : null, match: !!x.matchTiebreak, winner: x.winner }));
}

/** The scorer's racquet header: a games table with the names, tap a name to rename. */
function GamesTable({ view, sides, onTeam }: { view: BoardView; sides: [Side, Side]; onTeam?: (side: Side) => void }) {
  const sets = setsShown(view);
  return (
    <div className="px-3 pb-2">
      <table className="w-full border-collapse text-[15px]">
        <tbody>
          {sides.map((side) => (
            <tr key={side} className="h-9">
              <td className="pr-2 max-w-0 w-full">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-1 h-5 shrink-0 rounded-full ${TEAM[side].bar}`} aria-hidden />
                  <TeamName view={view} side={side} onTeam={onTeam} align="left" />
                </span>
              </td>
              {sets.map((x, i) => (
                <td key={i} className={`w-8 px-1 text-center tabular-nums ${x.live ? "font-bold text-white" : x.winner === side ? "font-bold text-white" : "text-white/55"}`}>
                  {x.match ? `[${x[side]}]` : x[side]}
                  {x.tb !== null && x.winner !== side && <sup className="text-[10px]">{x.tb}</sup>}
                </td>
              ))}
              {/* With no games to count (one game of pickleball) the halves show the score already. */}
              {view.scoreUnit !== "Points" && (
                <td className="w-11 pl-2 text-right">
                  <span className="inline-flex min-w-9 h-8 px-2 items-center justify-center rounded-lg bg-white/12 text-[20px] font-bold tabular-nums">{view.teams[side].score}</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sr-only">
        {view.scoreUnit}: {view.teams[sides[0]].name} {view.teams[sides[0]].score}, {view.teams[sides[1]].name} {view.teams[sides[1]].score}
      </p>
    </div>
  );
}

/**
 * One fixed-height line under the score: the result, or the notices
 * ("Set point Asha", "Change ends"), or where the match is. Notices
 * show until the next point.
 */
function Band({ view, done }: { view: BoardView; done: boolean }) {
  if (done) return <p className="h-10 px-4 flex items-center bg-accent-600 text-[15px] font-bold truncate">{view.result?.text ?? "Match over"}</p>;
  if (view.notices.length)
    return (
      <p role="status" className="h-10 px-4 flex items-center justify-center bg-amber-300 text-amber-950 text-[15px] font-extrabold truncate">
        {view.notices.join(" · ")}
      </p>
    );
  // Neutral words: the follower page shows this line too.
  const text = view.needsServe ? "Waiting for the first serve" : isSetSport(view.sport) ? (view.currentLabel ?? "") : view.eventCount ? (view.lastAction ?? "") : view.sport === "football" ? "Waiting for kick off" : "Waiting for the start";
  return <p className="h-10 px-4 flex items-center justify-center bg-white/10 text-[14px] text-white/85 truncate">{text}</p>;
}
