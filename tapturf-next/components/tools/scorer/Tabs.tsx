"use client";

import { useState, type ReactNode } from "react";
import { Award, ImageIcon, Plus, Share2 } from "lucide-react";
import { formatOvers } from "@/lib/cricket/overs";
import type { BatterLine, BowlerLine, InningsView, MatchView, Side } from "@/lib/cricket/scoring";
import { rate } from "./logic";
import { BallChip } from "./ui";

type OnPlayer = (side: Side, id: string) => void;

function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white border border-primary-200 p-3 ${className}`}>
      {(title || right) && (
        <div className="flex items-baseline justify-between gap-2 mb-2">
          {title && <h3 className="text-[13px] font-bold uppercase tracking-wide text-primary-500">{title}</h3>}
          {right && <div className="text-[13px] text-primary-500 tabular-nums">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const th = "py-1.5 px-1 text-right text-[12px] font-semibold text-primary-500 tabular-nums";
const td = "py-2 px-1 text-right text-[15px] tabular-nums text-primary-800";

function NameButton({ name, onClick, strong }: { name: string; onClick?: () => void; strong?: boolean }) {
  if (!onClick) return <span className={strong ? "font-bold text-primary-900" : "font-semibold text-primary-900"}>{name}</span>;
  return (
    <button type="button" onClick={onClick} className={`text-left underline decoration-primary-200 underline-offset-4 hover:decoration-accent-500 ${strong ? "font-bold text-primary-900" : "font-semibold text-primary-900"}`}>
      {name}
    </button>
  );
}

function BattingTable({ rows, side, onPlayer, showHow }: { rows: BatterLine[]; side: Side; onPlayer?: OnPlayer; showHow?: boolean }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-primary-100">
          <th className="py-1.5 pr-1 text-left text-[12px] font-semibold text-primary-500">Batter</th>
          <th className={th}>R</th>
          <th className={th}>B</th>
          <th className={th}>4s</th>
          <th className={th}>6s</th>
          <th className={th}>SR</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.id} className="border-b border-primary-100 last:border-0 align-top">
            <td className="py-2 pr-1 text-[15px] min-w-0">
              <span className="inline-flex items-center gap-1.5 max-w-full">
                {b.onStrike && <span className="w-2 h-2 rounded-full bg-accent-500 shrink-0" aria-label="On strike" />}
                <NameButton name={b.name} strong={b.onStrike} onClick={onPlayer ? () => onPlayer(side, b.id) : undefined} />
                {showHow && (b.status === "batting" || b.status === "notOut") && <span className="text-primary-900 font-bold" aria-hidden>*</span>}
              </span>
              {showHow && <span className={`block text-[12px] leading-snug ${b.status === "out" ? "text-primary-500" : "text-accent-700"}`}>{b.howOut}</span>}
            </td>
            <td className={`${td} font-bold text-primary-900`}>{b.runs}</td>
            <td className={td}>{b.balls}</td>
            <td className={td}>{b.fours}</td>
            <td className={td}>{b.sixes}</td>
            <td className={`${td} text-[13px] text-primary-500`}>{b.sr === null ? "-" : b.sr.toFixed(0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BowlingTable({ rows, side, onPlayer }: { rows: BowlerLine[]; side: Side; onPlayer?: OnPlayer }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-primary-100">
          <th className="py-1.5 pr-1 text-left text-[12px] font-semibold text-primary-500">Bowler</th>
          <th className={th}>O</th>
          <th className={th}>M</th>
          <th className={th}>R</th>
          <th className={th}>W</th>
          <th className={th}>Econ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => {
          const bits = [b.wides ? `${b.wides} wd` : "", b.noBalls ? `${b.noBalls} nb` : "", b.dots ? `${b.dots} dots` : ""].filter(Boolean).join(", ");
          return (
            <tr key={b.id} className="border-b border-primary-100 last:border-0 align-top">
              <td className="py-2 pr-1 text-[15px]">
                <span className="inline-flex items-center gap-1.5">
                  {b.current && <span className="w-2 h-2 rounded-full bg-accent-500 shrink-0" aria-label="Bowling now" />}
                  <NameButton name={b.name} strong={b.current} onClick={onPlayer ? () => onPlayer(side, b.id) : undefined} />
                </span>
                {bits && <span className="block text-[12px] text-primary-500">{bits}</span>}
              </td>
              <td className={td}>{b.overs}</td>
              <td className={td}>{b.maidens}</td>
              <td className={td}>{b.runs}</td>
              <td className={`${td} font-bold text-primary-900`}>{b.wickets}</td>
              <td className={`${td} text-[13px] text-primary-500`}>{b.econ === null ? "-" : b.econ.toFixed(1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function OverRow({ inn, number }: { inn: InningsView; number: number }) {
  const o = inn.byOver[number - 1];
  if (!o) return null;
  return (
    <li className="py-2.5 flex items-center gap-3">
      <div className="w-16 shrink-0">
        <p className="text-[14px] font-bold text-primary-900">Over {o.number}</p>
        <p className="text-[12px] text-primary-500 truncate">{o.bowlerName || "-"}</p>
      </div>
      <div className="flex-1 min-w-0 flex flex-wrap gap-1">
        {o.balls.map((b) => (
          <BallChip key={b.event} chip={b.chip} tone={b.tone} size="sm" label={b.label} />
        ))}
      </div>
      <div className="w-16 shrink-0 text-right">
        <p className="text-[15px] font-bold text-primary-900 tabular-nums">
          {o.maiden && <span className="mr-1 text-[11px] font-bold text-accent-700">Maiden</span>}
          {o.runs}
        </p>
        <p className="text-[12px] text-primary-500 tabular-nums">
          {o.totalRuns}/{o.totalWickets}
        </p>
      </div>
    </li>
  );
}

function InningsSwitch({ view, value, onChange }: { view: MatchView; value: number; onChange: (i: number) => void }) {
  if (view.innings.length < 2) return null;
  return (
    <div role="tablist" aria-label="Innings" className="flex rounded-xl bg-primary-100 p-1 gap-1 mb-3">
      {view.innings.map((inn) => (
        <button
          key={inn.index}
          type="button"
          role="tab"
          aria-selected={value === inn.index}
          onClick={() => onChange(inn.index)}
          className={`flex-1 min-h-11 rounded-lg px-2 text-[14px] font-semibold truncate ${value === inn.index ? "bg-white text-primary-900 shadow-soft" : "text-primary-600"}`}
        >
          {inn.battingName} {inn.score}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Live                                                                */
/* ------------------------------------------------------------------ */

export type PanelActions = { onStartChase: () => void; onResultCard: () => void; onShare: () => void; onNewMatch: () => void };

export function LiveTab({ view, onPlayer, actions }: { view: MatchView; onPlayer: OnPlayer; actions: PanelActions }) {
  const inn = view.current;
  if (view.status === "done") return <ResultPanel view={view} onPlayer={onPlayer} actions={actions} />;
  if (view.inningsBreak) return <BreakPanel view={view} actions={actions} />;

  const atCrease = [inn.striker, inn.nonStriker].filter((b): b is BatterLine => !!b);
  const recent = inn.byOver.slice(-3).reverse();
  const ballsLeft = inn.ballsLeft;
  const proj = (rpo: number) => Math.round(inn.runs + (rpo * ballsLeft) / 6);

  return (
    <div className="space-y-3">
      {view.chase && (
        <Card title="The chase" right={`Target ${view.chase.target}`}>
          <p className="text-[20px] font-bold text-primary-900 leading-tight">{view.chase.runsNeeded <= 0 ? "Target reached" : view.chase.text}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Stat label="Need" value={String(Math.max(0, view.chase.runsNeeded))} />
            <Stat label="Req. rate" value={rate(view.chase.rrr)} />
            <Stat label="Run rate" value={rate(inn.crr)} />
          </div>
          {view.chase.sameStage && inn.legalBalls > 0 && (
            <p className="mt-2 text-[13px] text-primary-600">
              At this stage {view.innings[0].battingName} were{" "}
              <span className="font-bold text-primary-900 tabular-nums">
                {view.chase.sameStage.runs}/{view.chase.sameStage.wickets}
              </span>
              . {inn.runs > view.chase.sameStage.runs ? `${inn.battingName} are ${inn.runs - view.chase.sameStage.runs} ahead.` : inn.runs < view.chase.sameStage.runs ? `${inn.battingName} are ${view.chase.sameStage.runs - inn.runs} behind.` : "Dead level."}
            </p>
          )}
        </Card>
      )}

      <Card title="Batting" right={inn.partnership ? `Partnership ${inn.partnership.runs} (${inn.partnership.balls})` : undefined}>
        {atCrease.length ? <BattingTable rows={atCrease} side={inn.batting} onPlayer={onPlayer} /> : <p className="text-[14px] text-primary-500">Pick the batters to start.</p>}
      </Card>

      <Card title="Bowling" right={view.onHatTrick ? <span className="font-bold text-red-600">On a hat-trick</span> : undefined}>
        {inn.bowler ? <BowlingTable rows={[inn.bowler]} side={inn.bowling} onPlayer={onPlayer} /> : <p className="text-[14px] text-primary-500">Pick who bowls this over.</p>}
      </Card>

      {view.warnings.length > 0 && (
        <div role="note" className="rounded-2xl bg-amber-50 border border-amber-300 px-3 py-2 text-[14px] text-amber-900 space-y-1">
          {view.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {inn.lastWicket && (
        <Card title="Last wicket">
          <p className="text-[14px] text-primary-800">{inn.lastWicket}</p>
        </Card>
      )}

      {recent.length > 0 && (
        <Card title="Recent overs">
          <ul className="divide-y divide-primary-100">
            {recent.map((o) => (
              <OverRow key={o.number} inn={inn} number={o.number} />
            ))}
          </ul>
        </Card>
      )}

      {!view.chase && inn.crr !== null && ballsLeft > 0 && (
        <Card title="Projected score" right={`${ballsLeft} balls left`}>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label={`Now (${rate(inn.crr)})`} value={String(inn.projected ?? proj(inn.crr))} strong />
            {[8, 10, 12].map((r) => (
              <Stat key={r} label={`At ${r}`} value={String(proj(r))} />
            ))}
          </div>
        </Card>
      )}

      <Card title="This innings">
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat label="Fours" value={String(inn.fours)} />
          <Stat label="Sixes" value={String(inn.sixes)} />
          <Stat label="Dots" value={String(inn.dots)} />
          <Stat label="Extras" value={String(inn.extras.total)} />
        </div>
        {inn.extras.total > 0 && <p className="mt-2 text-[12px] text-primary-500">{inn.extrasText}</p>}
      </Card>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl px-1 py-2 ${strong ? "bg-primary-900 text-white" : "bg-primary-50"}`}>
      <p className={`text-[20px] font-bold tabular-nums leading-none ${strong ? "text-white" : "text-primary-900"}`}>{value}</p>
      <p className={`mt-1 text-[11px] font-semibold ${strong ? "text-white/70" : "text-primary-500"}`}>{label}</p>
    </div>
  );
}

function topBatters(inn: InningsView, n = 2) {
  return [...inn.batters].filter((b) => b.balls > 0 || b.runs > 0).sort((a, b) => b.runs - a.runs || a.balls - b.balls).slice(0, n);
}
function topBowlers(inn: InningsView, n = 2) {
  return [...inn.bowlers].filter((b) => b.balls > 0).sort((a, b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, n);
}

function BreakPanel({ view, actions }: { view: MatchView; actions: PanelActions }) {
  const first = view.innings[0];
  const chase = view.chase;
  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-primary-900 text-white p-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">Innings break</p>
        <p className="mt-1 text-[24px] font-bold leading-tight">{first.summary}</p>
        {chase && (
          <p className="mt-2 text-[17px] text-white/90">
            {view.current.battingName} need <span className="font-bold text-white">{chase.target}</span> to win from {chase.ballsLeft} balls, at {rate(chase.rrr)} an over.
          </p>
        )}
        <button type="button" onClick={actions.onStartChase} className="press-tight mt-4 w-full h-14 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
          Start the chase
        </button>
      </section>
      <Card title={`${first.battingName}: best with the bat`}>
        <ul className="text-[15px] text-primary-800 space-y-1">
          {topBatters(first).map((b) => (
            <li key={b.id} className="flex justify-between gap-2">
              <span className="font-semibold">{b.name}</span>
              <span className="tabular-nums">
                {b.runs}
                {b.status !== "out" ? "*" : ""} ({b.balls})
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`${first.bowlingName}: best with the ball`}>
        <ul className="text-[15px] text-primary-800 space-y-1">
          {topBowlers(first).map((b) => (
            <li key={b.id} className="flex justify-between gap-2">
              <span className="font-semibold">{b.name}</span>
              <span className="tabular-nums">
                {b.figures} ({b.overs})
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-[13px] text-primary-500">
        {first.extrasText}. {first.fours} four{first.fours === 1 ? "" : "s"}, {first.sixes} six{first.sixes === 1 ? "" : "es"}.
      </p>
    </div>
  );
}

function ResultPanel({ view, onPlayer, actions }: { view: MatchView; onPlayer: OnPlayer; actions: PanelActions }) {
  const { potm, topScorer, bestBowler } = view.awards;
  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-primary-900 text-white p-4">
        <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">Result</p>
        <p className="mt-1 text-[24px] font-bold leading-tight">{view.result?.text ?? "Match over"}</p>
        <ul className="mt-2 space-y-0.5 text-[15px] text-white/85 tabular-nums">
          {view.innings.map((i) => (
            <li key={i.index}>{i.summary}</li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={actions.onResultCard} className="press-tight col-span-2 inline-flex items-center justify-center gap-2 h-14 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
            <ImageIcon className="w-5 h-5" aria-hidden /> Make the result card
          </button>
          <button type="button" onClick={actions.onShare} className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full bg-white/10 text-white text-[15px] font-bold hover:bg-white/20">
            <Share2 className="w-4 h-4" aria-hidden /> Share result
          </button>
          <button type="button" onClick={actions.onNewMatch} className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full bg-white/10 text-white text-[15px] font-bold hover:bg-white/20">
            <Plus className="w-4 h-4" aria-hidden /> New match
          </button>
        </div>
      </section>
      {(potm || topScorer || bestBowler) && (
        <Card title="Stars of the match">
          <ul className="space-y-2 text-[15px]">
            {potm && (
              <li className="flex items-start gap-2">
                <Award className="w-5 h-5 text-accent-600 shrink-0 mt-0.5" aria-hidden />
                <span>
                  <span className="block text-[12px] font-semibold text-primary-500">Player of the match, {view.teams[potm.side].name}</span>
                  <span className="font-bold text-primary-900">{potm.text}</span>
                </span>
              </li>
            )}
            {topScorer && (
              <li className="flex justify-between gap-2">
                <span className="text-primary-500">Top scorer</span>
                <span className="font-semibold text-primary-900 text-right">
                  {topScorer.text}
                  <span className="block text-[12px] font-normal text-primary-500">{view.teams[topScorer.side].name}</span>
                </span>
              </li>
            )}
            {bestBowler && (
              <li className="flex justify-between gap-2">
                <span className="text-primary-500">Best bowler</span>
                <span className="font-semibold text-primary-900 text-right">
                  {bestBowler.text}
                  <span className="block text-[12px] font-normal text-primary-500">{view.teams[bestBowler.side].name}</span>
                </span>
              </li>
            )}
          </ul>
        </Card>
      )}
      {view.innings.map((i) => (
        <InningsCard key={i.index} view={view} inn={i} onPlayer={onPlayer} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scorecard, overs, commentary                                        */
/* ------------------------------------------------------------------ */

function InningsCard({ view, inn, onPlayer }: { view: MatchView; inn: InningsView; onPlayer: OnPlayer }) {
  const maxPart = Math.max(1, ...inn.partnerships.map((p) => p.runs));
  return (
    <div className="space-y-3">
      <Card title={`${inn.battingName} innings`} right={<span className="text-[15px] font-bold text-primary-900">{inn.score} <span className="font-normal text-primary-500">({inn.overs} ov)</span></span>}>
        {inn.batters.length ? <BattingTable rows={inn.batters} side={inn.batting} onPlayer={onPlayer} showHow /> : <p className="text-[14px] text-primary-500">No one has batted yet.</p>}
        <div className="mt-2 pt-2 border-t border-primary-100 text-[14px] text-primary-700 space-y-1">
          <p>{inn.extrasText}</p>
          <p className="font-bold text-primary-900">
            Total {inn.score} ({inn.overs} ov{inn.crr !== null ? `, RR ${rate(inn.crr)}` : ""})
          </p>
          {inn.yetToBat.length > 0 && (
            <p className="text-primary-500">
              <span className="font-semibold text-primary-700">Yet to bat:</span> {inn.yetToBat.map((p) => p.name).join(", ")}
            </p>
          )}
          {inn.fow.length > 0 && (
            <p className="text-primary-500">
              <span className="font-semibold text-primary-700">Fall of wickets:</span> {inn.fow.map((f) => f.text).join(", ")}
            </p>
          )}
        </div>
      </Card>
      {inn.bowlers.length > 0 && (
        <Card title={`${inn.bowlingName} bowling`}>
          <BowlingTable rows={inn.bowlers} side={inn.bowling} onPlayer={onPlayer} />
        </Card>
      )}
      {inn.partnerships.length > 0 && (
        <Card title="Partnerships">
          <ul className="space-y-2">
            {inn.partnerships.map((p) => (
              <li key={p.number}>
                <div className="flex justify-between gap-2 text-[14px]">
                  <span className="text-primary-800 min-w-0 truncate">{p.batters.map((b) => `${b.name} ${b.runs}`).join(", ")}</span>
                  <span className="font-bold text-primary-900 tabular-nums shrink-0">
                    {p.runs} ({p.balls}){p.unbroken ? "*" : ""}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-primary-100 overflow-hidden" aria-hidden>
                  <div className="h-full rounded-full bg-primary-800" style={{ width: `${(p.runs / maxPart) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {view.status === "live" && inn.live && inn.ballsLeft > 0 && <p className="text-[12px] text-primary-500">{formatOvers(inn.ballsLeft)} overs left in this innings.</p>}
    </div>
  );
}

export function ScorecardTab({ view, onPlayer }: { view: MatchView; onPlayer: OnPlayer }) {
  const [pick, setPick] = useState<number | null>(null);
  const i = pick ?? view.current.index;
  const inn = view.innings[i] ?? view.current;
  return (
    <div>
      <InningsSwitch view={view} value={inn.index} onChange={setPick} />
      <InningsCard view={view} inn={inn} onPlayer={onPlayer} />
    </div>
  );
}

export function OversTab({ view }: { view: MatchView }) {
  const [pick, setPick] = useState<number | null>(null);
  const inn = view.innings[pick ?? view.current.index] ?? view.current;
  return (
    <div>
      <InningsSwitch view={view} value={inn.index} onChange={setPick} />
      {inn.byOver.length ? (
        <Card title={`${inn.battingName}, over by over`} right={`${inn.score} (${inn.overs})`}>
          <ul className="divide-y divide-primary-100">
            {[...inn.byOver].reverse().map((o) => (
              <OverRow key={o.number} inn={inn} number={o.number} />
            ))}
          </ul>
        </Card>
      ) : (
        <p className="text-[14px] text-primary-500">No overs yet.</p>
      )}
    </div>
  );
}

export function CommentaryTab({ view }: { view: MatchView }) {
  const list = [...view.innings].reverse().filter((i) => i.commentary.length);
  if (!list.length) return <p className="text-[14px] text-primary-500">Ball by ball commentary appears here as you score.</p>;
  return (
    <div className="space-y-4">
      {list.map((inn) => (
        <section key={inn.index}>
          <h3 className="text-[13px] font-bold uppercase tracking-wide text-primary-500 mb-1">{inn.battingName} innings</h3>
          <ol className="rounded-2xl bg-white border border-primary-200 divide-y divide-primary-100 overflow-hidden">
            {[...inn.commentary].reverse().map((l) =>
              l.kind === "ball" ? (
                <li key={l.key} className={`flex items-start gap-3 px-3 py-2.5 ${l.wicket ? "bg-red-50" : ""}`}>
                  {l.chip && l.tone && <BallChip chip={l.chip} tone={l.tone} />}
                  <p className="min-w-0 text-[14px] leading-snug text-primary-800">
                    <span className="font-bold text-primary-900 tabular-nums mr-1.5">{l.label}</span>
                    {l.text}
                  </p>
                </li>
              ) : (
                <li key={l.key} className={`px-3 py-2 text-[13px] ${l.kind === "over" ? "bg-primary-50 font-semibold text-primary-700" : "text-primary-600 italic"}`}>
                  {l.text}
                </li>
              ),
            )}
          </ol>
        </section>
      ))}
    </div>
  );
}
