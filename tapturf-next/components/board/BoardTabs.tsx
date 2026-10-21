"use client";

import { useState, type ReactNode } from "react";
import type { BoardView, Side, TimelineLine } from "@/lib/board/types";
import { TEAM, isSetSport } from "./shared";
import { TagHandle } from "@/components/account/TagHandle";

/**
 * The tabs under the board header, shared by the scorer and the follower
 * page: Live (result, notices, the sets table, the last few lines),
 * Timeline (everything, newest first) and Stats (team stats and players).
 * Pure: the tab picked is its own state, so a follower's pick survives
 * every poll. readOnly is the follower: what is going on, no scorer hints.
 */

type Tab = "live" | "timeline" | "stats";
const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "timeline", label: "Timeline" },
  { id: "stats", label: "Stats" },
];

export function BoardTabs({ view, readOnly, className = "" }: { view: BoardView; readOnly?: boolean; className?: string }) {
  const [tab, setTab] = useState<Tab>("live");
  return (
    <div className={`flex flex-col min-h-0 bg-primary-50 ${className}`}>
      <div role="tablist" aria-label="Match details" className="flex gap-0.5 px-2 bg-white border-b border-primary-200 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`bd-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="bd-panel"
            onClick={() => setTab(t.id)}
            className={`h-11 px-2 grow text-[14px] font-semibold border-b-[3px] transition-colors ${tab === t.id ? "border-accent-500 text-primary-900" : "border-transparent text-primary-500 hover:text-primary-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="bd-panel" role="tabpanel" aria-labelledby={`bd-tab-${tab}`} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
        {tab === "live" && <LivePanel view={view} readOnly={readOnly} />}
        {tab === "timeline" && <Timeline view={view} lines={[...view.timeline].reverse()} empty={readOnly ? "Every point, goal and break shows here once the match starts." : "Every point, goal and break shows here as you score."} />}
        {tab === "stats" && <StatsPanel view={view} readOnly={readOnly} />}
      </div>
    </div>
  );
}

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

const Dot = ({ side }: { side: Side }) => <span className={`w-2.5 h-2.5 shrink-0 rounded-full ${TEAM[side].dot}`} aria-hidden />;

/* ------------------------------------------------------------------ */
/* Live                                                                */
/* ------------------------------------------------------------------ */

function LivePanel({ view, readOnly }: { view: BoardView; readOnly?: boolean }) {
  const recent = view.timeline.slice(-6).reverse();
  const done = view.status === "done";
  return (
    <div className="space-y-3">
      {done && (
        <section className="rounded-2xl bg-primary-900 text-white p-4">
          <p className="text-[12px] font-bold uppercase tracking-wide text-accent-300">{view.result?.kind === "abandoned" ? "No result" : "Result"}</p>
          <p className="mt-1 text-[22px] font-bold leading-tight">{view.result?.text ?? "Match over"}</p>
          <p className="mt-1 text-[15px] text-white/80">{view.headline}</p>
        </section>
      )}
      {!done && view.notices.length > 0 && (
        <div role="note" className="rounded-2xl bg-amber-50 border border-amber-300 px-3 py-2 text-[15px] font-semibold text-amber-950">
          {view.notices.join(" · ")}
        </div>
      )}
      {isSetSport(view.sport) && view.sets.some((x) => x.a + x.b > 0 || x.winner) && <SetsTable view={view} />}
      <Card title="Latest">
        {recent.length ? <Lines view={view} lines={recent} /> : <p className="text-[14px] text-primary-500">{readOnly ? "The score shows here once the match starts." : "Tap a button below to score. Undo takes back the last tap."}</p>}
      </Card>
    </div>
  );
}

/** Sets or games by number, both teams; the one in play in bold, a tiebreak as a small number, a match tiebreak in brackets. */
function SetsTable({ view }: { view: BoardView }) {
  const word = view.scoreUnit === "Sets" ? "Set" : "Game";
  const th = "py-1.5 px-1 text-center text-[12px] font-semibold text-primary-500 tabular-nums";
  return (
    <Card title={view.scoreUnit === "Sets" ? "Sets" : "Games"}>
      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-primary-100">
              <th className="py-1.5 pr-1 text-left text-[12px] font-semibold text-primary-500">
                <span className="sr-only">Team</span>
              </th>
              {view.sets.map((x, i) => (
                <th key={i} className={th} scope="col">
                  {x.matchTiebreak ? "TB" : `${word.charAt(0)}${i + 1}`}
                </th>
              ))}
              <th className={`${th} text-primary-800`} scope="col">
                {view.scoreUnit}
              </th>
            </tr>
          </thead>
          <tbody>
            {(["a", "b"] as const).map((side) => (
              <tr key={side} className="border-b border-primary-100 last:border-0">
                <th scope="row" className="py-2 pr-1 text-left text-[15px] font-semibold text-primary-900 max-w-0 w-full">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Dot side={side} />
                    <span className="truncate">{view.teams[side].name}</span>
                    {view.status === "live" && view.server === side && <span className="shrink-0 text-[11px] font-bold text-amber-700">serving</span>}
                  </span>
                </th>
                {view.sets.map((x, i) => {
                  const live = x.winner === null && view.status === "live";
                  return (
                    <td key={i} className={`py-2 px-1 text-center text-[16px] tabular-nums ${x.winner === side || live ? "font-bold text-primary-900" : "text-primary-500"}`}>
                      {x[side]}
                      {x.tiebreak && x.winner !== side && <sup className="text-[10px]">{x.tiebreak[side]}</sup>}
                    </td>
                  );
                })}
                <td className="py-2 px-1 text-center text-[18px] font-bold tabular-nums text-primary-900">{view.teams[side].score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

const LINE_TONE: Record<TimelineLine["tone"], string> = {
  score: "text-primary-900",
  card: "text-primary-900",
  info: "text-primary-600 italic",
  end: "font-bold text-primary-900",
};

function Lines({ view, lines }: { view: BoardView; lines: TimelineLine[] }) {
  // Racquet sports have no minutes: no empty column for them.
  const timed = lines.some((l) => l.when);
  return (
    <ol className="divide-y divide-primary-100">
      {lines.map((l) => (
        <li key={l.key} className={`flex items-start gap-2.5 py-2 ${l.tone === "end" ? "bg-primary-50 -mx-3 px-3" : ""}`}>
          {timed && <span className="w-14 shrink-0 pt-0.5 text-[12px] font-bold tabular-nums whitespace-nowrap text-primary-500">{l.when ?? ""}</span>}
          {l.side ? <span className="pt-1.5"><Dot side={l.side} /></span> : <span className="w-2.5 shrink-0" aria-hidden />}
          <p className={`min-w-0 flex-1 text-[14px] leading-snug ${LINE_TONE[l.tone]}`}>
            {l.tone === "card" && <span className={`inline-block w-2.5 h-3.5 mr-1.5 -mb-0.5 rounded-[2px] ${/^(red|second yellow)/i.test(l.text) ? "bg-red-600" : "bg-amber-400"}`} aria-hidden />}
            {l.text}
            {l.side && <span className="sr-only">, {view.teams[l.side].name}</span>}
          </p>
          {l.score && <span className="shrink-0 pt-0.5 text-[13px] font-bold tabular-nums text-primary-700">{l.score}</span>}
        </li>
      ))}
    </ol>
  );
}

function Timeline({ view, lines, empty }: { view: BoardView; lines: TimelineLine[]; empty: string }) {
  if (!lines.length) return <p className="text-[14px] text-primary-500">{empty}</p>;
  return (
    <Card>
      <Lines view={view} lines={lines} />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

function StatsPanel({ view, readOnly }: { view: BoardView; readOnly?: boolean }) {
  const { a, b } = view.teams;
  return (
    <div className="space-y-3">
      {view.stats.length > 0 ? (
        <Card>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-primary-100">
                <th scope="col" className="py-1.5 w-[32%] text-left text-[13px] font-bold text-primary-900">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Dot side="a" />
                    <span className="truncate">{a.name}</span>
                  </span>
                </th>
                <th scope="col" className="py-1.5">
                  <span className="sr-only">Stat</span>
                </th>
                <th scope="col" className="py-1.5 w-[32%] text-right text-[13px] font-bold text-primary-900">
                  <span className="flex items-center justify-end gap-1.5 min-w-0">
                    <span className="truncate">{b.name}</span>
                    <Dot side="b" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view.stats.map((st) => (
                <tr key={st.label} className="border-b border-primary-100 last:border-0">
                  <td className="py-2 text-left text-[16px] font-bold tabular-nums text-primary-900">{st.a}</td>
                  <th scope="row" className="py-2 px-1 text-center text-[13px] font-semibold text-primary-500">
                    {st.label}
                  </th>
                  <td className="py-2 text-right text-[16px] font-bold tabular-nums text-primary-900">{st.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <p className="text-[14px] text-primary-500">Stats fill in as the match goes.</p>
      )}
      {view.players.length > 0 && (
        <Card title="Players">
          <ul className="divide-y divide-primary-100">
            {view.players.map((p, i) => (
              <li key={`${p.side}-${p.name}-${p.tag?.u ?? ""}-${i}`} className="py-2 flex items-start gap-2">
                <span className="pt-1.5">
                  <Dot side={p.side} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-primary-900 truncate">{p.name}</span>
                  <span className="block text-[12px] text-primary-500 truncate">
                    {view.teams[p.side].name}
                    {p.tag && (
                      <>
                        {" · "}
                        <TagHandle tag={p.tag} link={readOnly} className="text-accent-700 font-semibold" />
                      </>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[14px] tabular-nums text-primary-800 max-w-[50%]">{p.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
