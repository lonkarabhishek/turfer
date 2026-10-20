"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, MoreHorizontal, Share2 } from "lucide-react";
import type { BatterLine, BowlerLine, MatchView, Side } from "@/lib/cricket/scoring";
import { rate } from "./logic";
import { CommentaryTab, LiveTab, OversTab, ScorecardTab, type PanelActions } from "./Tabs";
import { Manhattan, Worm } from "./Charts";

/**
 * The score header and the tabs under it, shared by the scorer and the
 * follower page (/live/<code>), so the two cannot drift apart. Without
 * handlers they are read only: names are plain text and the scorer's
 * own buttons are left out.
 */

type OnPlayer = (side: Side, id: string) => void;

export type MatchTab = "live" | "card" | "overs" | "graphs" | "comms";
export const MATCH_TABS: { id: MatchTab; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "card", label: "Scorecard" },
  { id: "overs", label: "Overs" },
  { id: "graphs", label: "Graphs" },
  { id: "comms", label: "Commentary" },
];

const ICON_BUTTON = "w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-white/10";

export function ScoreHeader({
  view,
  className = "",
  onExit,
  onShare,
  onMore,
  onPlayer,
  badge,
  venue,
}: {
  view: MatchView;
  className?: string;
  onExit?: () => void;
  onShare?: () => void;
  onMore?: () => void;
  /** Tap a batter or the bowler. */
  onPlayer?: OnPlayer;
  /** Next to the team names: the scorer's LIVE pill, the follower's live dot. */
  badge?: ReactNode;
  /** Add the venue to the line under the names. The scorer knows where it is. */
  venue?: boolean;
}) {
  const inn = view.current;
  const s = view.setup;
  const teams = (
    <p className={`text-[13px] font-semibold truncate${badge ? " min-w-0" : ""}`}>
      {s.teamA} v {s.teamB}
    </p>
  );
  const batter = (b: BatterLine) => (
    <>
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${b.onStrike ? "bg-accent-500" : "bg-transparent"}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] ${b.onStrike ? "font-bold" : "font-semibold text-primary-700"}`}>{b.name}</span>
      </span>
      <span className="text-[16px] font-bold tabular-nums shrink-0">
        {b.runs}
        <span className="text-[13px] font-semibold text-primary-500"> ({b.balls})</span>
      </span>
    </>
  );
  const bowler = (b: BowlerLine) => (
    <>
      <span className="text-[12px] font-bold uppercase text-primary-500">Bowling</span>
      <span className="flex-1 min-w-0 truncate text-[15px] font-semibold">{b.name}</span>
      {view.onHatTrick && <span className="text-[12px] font-bold text-red-600">Hat-trick ball</span>}
      <span className="text-[14px] font-bold tabular-nums">
        {b.overs}-{b.maidens}-{b.runs}-{b.wickets}
      </span>
    </>
  );

  return (
    <header className={`bg-primary-900 text-white ${className}`}>
      <div className="flex items-center gap-1 px-1.5 h-12">
        {onExit && (
          <button type="button" onClick={onExit} aria-label="Leave the scorer. The match is saved." className={ICON_BUTTON}>
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="flex-1 min-w-0 text-center">
          {badge ? (
            <div className="flex items-center justify-center gap-1.5">
              {teams}
              {badge}
            </div>
          ) : (
            teams
          )}
          <p className="text-[11px] text-white/60 truncate">
            {view.status === "done" ? "Match over" : `${inn.index === 0 ? "1st" : "2nd"} innings`} · {s.overs} overs{s.title ? ` · ${s.title}` : ""}
            {venue && s.venue ? ` · ${s.venue}` : null}
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

      <div className="px-4 pb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300 truncate">{inn.battingName}</p>
          <p className="font-display text-[46px] [@media(max-height:700px)]:text-[38px] leading-[0.95] font-bold tabular-nums">
            {inn.runs}
            <span className="text-white/50">/</span>
            {inn.wickets}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[24px] font-bold tabular-nums leading-tight">
            {inn.overs}
            <span className="text-[14px] font-semibold text-white/60"> / {Math.round(inn.maxBalls / 6)} ov</span>
          </p>
          {inn.crr !== null && <p className="text-[14px] text-white/75 tabular-nums">CRR {rate(inn.crr)}</p>}
        </div>
      </div>
      {view.status === "done" ? (
        <p className="px-4 py-2 bg-accent-600 text-[16px] font-bold">{view.result?.text}</p>
      ) : view.chase && !view.inningsBreak ? (
        <p className="px-4 py-2 bg-accent-600 text-[16px] font-bold tabular-nums">
          {view.chase.runsNeeded <= 0 ? "Target reached" : `Need ${view.chase.runsNeeded} from ${view.chase.ballsLeft}`}
          <span className="font-semibold text-white/85"> · RRR {rate(view.chase.rrr)}</span>
        </p>
      ) : view.inningsBreak && view.chase ? (
        <p className="px-4 py-2 bg-accent-600 text-[16px] font-bold">Target {view.chase.target} from {view.chase.ballsLeft} balls</p>
      ) : (
        <p className="px-4 py-1.5 bg-white/10 text-[14px] text-white/85 tabular-nums [@media(max-height:700px)]:hidden">{inn.projected !== null ? `Projected ${inn.projected} at this rate` : inn.byOver.length ? `${s.overs} overs a side. No legal ball yet.` : `${s.overs} overs a side. First ball coming up.`}</p>
      )}

      {/* Batters and bowler, tap a name to rename or act */}
      {view.status === "live" && !view.inningsBreak && (
        <div className="bg-white text-primary-900 border-b border-primary-200">
          <div className="grid grid-cols-2 divide-x divide-primary-100">
            {[inn.striker, inn.nonStriker].map((b, i) =>
              b ? (
                onPlayer ? (
                  <button key={b.id} type="button" onClick={() => onPlayer(inn.batting, b.id)} className="min-h-12 px-3 py-1.5 text-left flex items-center gap-2 hover:bg-primary-50" aria-label={`${b.name}${b.onStrike ? ", on strike" : ""}, ${b.runs} off ${b.balls}`}>
                    {batter(b)}
                  </button>
                ) : (
                  <div key={b.id} className="min-h-12 px-3 py-1.5 flex items-center gap-2">
                    {batter(b)}
                    {b.onStrike && <span className="sr-only">, on strike</span>}
                  </div>
                )
              ) : (
                <div key={i} className="min-h-12 px-3 py-1.5 flex items-center text-[14px] text-primary-500">{i === 1 && inn.striker && s.rules.lastManStands ? "Batting alone" : "Next batter"}</div>
              ),
            )}
          </div>
          <div className="border-t border-primary-100">
            {inn.bowler ? (
              onPlayer ? (
                <button type="button" onClick={() => onPlayer(inn.bowling, inn.bowler!.id)} className="w-full min-h-10 px-3 py-1 text-left flex items-center gap-2 hover:bg-primary-50">
                  {bowler(inn.bowler)}
                </button>
              ) : (
                <div className="min-h-10 px-3 py-1 flex items-center gap-2">{bowler(inn.bowler)}</div>
              )
            ) : (
              <p className="min-h-10 px-3 py-2 text-[14px] text-primary-500">Bowler for the next over</p>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

/**
 * The tab strip and its panel. The scorer passes tab and onTab, since it
 * jumps back to Live at an innings or match end; left out, the tabs keep
 * their own, so a follower's pick survives every poll.
 */
export function MatchTabs({
  view,
  tab,
  onTab,
  readOnly,
  onPlayer,
  actions,
  className = "",
}: {
  view: MatchView;
  tab?: MatchTab;
  onTab?: (t: MatchTab) => void;
  readOnly?: boolean;
  onPlayer?: OnPlayer;
  actions?: Partial<PanelActions>;
  className?: string;
}) {
  const [own, setOwn] = useState<MatchTab>("live");
  const current = tab ?? own;
  const select = onTab ?? setOwn;
  return (
    <div className={`flex flex-col min-h-0 bg-primary-50 ${className}`}>
      <div role="tablist" aria-label="Match details" className="flex gap-0.5 overflow-x-auto scrollbar-hide px-2 bg-white border-b border-primary-200 shrink-0">
        {MATCH_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ls-tab-${t.id}`}
            aria-selected={current === t.id}
            aria-controls="ls-panel"
            onClick={() => select(t.id)}
            className={`h-11 px-1.5 min-[380px]:px-2 shrink-0 grow text-[12px] min-[380px]:text-[13px] sm:text-[14px] font-semibold border-b-[3px] transition-colors ${current === t.id ? "border-accent-500 text-primary-900" : "border-transparent text-primary-500 hover:text-primary-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="ls-panel" role="tabpanel" aria-labelledby={`ls-tab-${current}`} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
        {current === "live" && <LiveTab view={view} onPlayer={onPlayer} actions={actions} readOnly={readOnly} />}
        {current === "card" && <ScorecardTab view={view} onPlayer={onPlayer} />}
        {current === "overs" && <OversTab view={view} />}
        {current === "graphs" && (
          <div className="space-y-4">
            <section className="rounded-2xl bg-white border border-primary-200 p-3">
              <Manhattan view={view} />
            </section>
            <section className="rounded-2xl bg-white border border-primary-200 p-3">
              <Worm view={view} />
            </section>
          </div>
        )}
        {current === "comms" && <CommentaryTab view={view} readOnly={readOnly} />}
      </div>
    </div>
  );
}
