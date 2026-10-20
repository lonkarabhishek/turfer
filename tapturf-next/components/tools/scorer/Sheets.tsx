"use client";

import { useState } from "react";
import { ArrowUpDown, Check, Copy, MessageCircle, Share2 } from "lucide-react";
import {
  WICKET_LABELS,
  allowedWicketKinds,
  apply,
  check,
  derive,
  normalizeRules,
  type BallWicket,
  type BallWicketKind,
  type BatterOption,
  type ChangeSetupEvent,
  type End,
  type Extra,
  type Match,
  type MatchEvent,
  type MatchView,
  type RetireKind,
  type Rules,
  type Side,
} from "@/lib/cricket/scoring";
import { buildBall, cleanName, defaultName, placeholderOf, resolvePlayer, type NbSource } from "./logic";
import { NameInput, Options, Pick, Sheet, SheetLabel } from "./ui";

type Commit = (events: MatchEvent[]) => boolean;

/* ------------------------------------------------------------------ */
/* Picking players                                                     */
/* ------------------------------------------------------------------ */

/** Chips of a team's players plus a box to type a new one. Tapping a chip picks straight away. */
function PlayerPicker({ options, newName, onPick, newLabel }: { options: { id: string; name: string; detail?: string; muted?: boolean }[]; newName: string; onPick: (name: string, id?: string) => void; newLabel: string }) {
  const [typed, setTyped] = useState("");
  const name = cleanName(typed);
  return (
    <div>
      {options.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <Pick key={o.id} onClick={() => onPick(o.name, o.id)} label={o.name} detail={o.detail} muted={o.muted} />
          ))}
        </div>
      )}
      <div className={`${options.length ? "mt-3" : ""} grid grid-cols-2 gap-2`}>
        <Pick onClick={() => onPick(newName)} label={newName} detail={newLabel} className="border-dashed" />
        <div className="flex flex-col gap-1">
          <NameInput value={typed} onChange={setTyped} placeholder="Or type a name" label="Type a player name" onEnter={() => name && onPick(name)} />
          {name && (
            <button type="button" onClick={() => onPick(name)} className="press-tight h-11 rounded-xl bg-primary-900 text-white text-[14px] font-bold">
              Add {name.length > 14 ? `${name.slice(0, 14)}...` : name}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Real names first, then anyone retired hurt, then placeholder bowlers ("Bowler 2") last. */
const batterOpts = (list: BatterOption[]) =>
  [...list]
    .sort((x, y) => Number(x.retiredHurt) - Number(y.retiredHurt) || Number(placeholderOf(x.name) === "Bowler") - Number(placeholderOf(y.name) === "Bowler"))
    .map((b) => ({ id: b.id, name: b.name, detail: b.retiredHurt ? `Retired hurt, ${b.runs} (${b.balls})` : b.balls ? `${b.runs} (${b.balls})` : "Yet to bat", muted: b.retiredHurt }));

/** Who bowls next: the latest bowlers first, then the rest of the team. */
function bowlerOrder(view: MatchView) {
  const recent: string[] = [];
  for (const o of [...view.current.byOver].reverse()) if (o.bowler && !recent.includes(o.bowler)) recent.push(o.bowler);
  const rank = (id: string) => {
    const i = recent.indexOf(id);
    return i < 0 ? 999 : i;
  };
  return [...view.bowlerOptions].sort((a, b) => rank(a.id) - rank(b.id));
}

/** Batters at the start of an innings, and the opening bowler. One tap with the defaults. */
export function OpenersSheet({ match, view, onCommit, onClose }: { match: Match; view: MatchView; onCommit: Commit; onClose: () => void }) {
  const inn = view.current;
  const needS = view.needs.includes("striker");
  const needN = view.needs.includes("nonStriker");
  const needB = view.needs.includes("bowler");
  const bat = view.batterOptions.filter((b) => !b.retiredHurt);
  // Defaults: named players in order; a side with only placeholders gets fresh ones for the role.
  const batPick = bat.filter((b) => placeholderOf(b.name) !== "Bowler");
  const firstBowler = view.bowlerOptions.find((b) => !b.blocked && placeholderOf(b.name) !== "Batter");
  const d1 = batPick[0]?.name ?? defaultName(view, inn.batting, "Batter");
  const d2 = batPick.find((b) => b.name !== d1)?.name ?? defaultName(view, inn.batting, "Batter", [d1]);
  const [s, setS] = useState(needS ? d1 : "");
  const [n, setN] = useState(needN ? (needS ? d2 : d1) : "");
  const [b, setB] = useState(needB ? (firstBowler?.name ?? defaultName(view, inn.bowling, "Bowler")) : "");
  const [err, setErr] = useState<string | null>(null);

  const go = () => {
    const sN = cleanName(s);
    const nN = cleanName(n);
    const bN = cleanName(b);
    if ((needS && !sN) || (needN && !nN) || (needB && !bN)) return setErr("Fill in every name, or keep the ones given.");
    if (needS && needN && sN.toLowerCase() === nN.toLowerCase()) return setErr("Pick two different batters.");
    let m = match;
    const evs: MatchEvent[] = [];
    const push = (e: MatchEvent) => {
      evs.push(e);
      m = apply(m, e);
    };
    if (needS) push({ type: "setBatter", ...resolvePlayer(m, inn.batting, sN), end: "striker" });
    if (needN) push({ type: "setBatter", ...resolvePlayer(m, inn.batting, nN), end: "nonStriker" });
    if (needB) push({ type: "setBowler", ...resolvePlayer(m, inn.bowling, bN) });
    if (!onCommit(evs)) setErr("Could not start. Check the names.");
  };

  const chips = (side: Side, value: string, setValue: (v: string) => void, exclude: string[]) => {
    const list = side === inn.batting ? bat.map((p) => p.name) : view.bowlerOptions.map((p) => p.name);
    const shown = list.filter((x) => !exclude.includes(x));
    if (!shown.length) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {shown.slice(0, 12).map((x) => (
          <button key={x} type="button" onClick={() => setValue(x)} aria-pressed={x === value} className={`press-tight h-10 px-3 rounded-full border text-[14px] font-semibold ${x === value ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800"}`}>
            {x}
          </button>
        ))}
      </div>
    );
  };

  return (
    <Sheet title={inn.index === 0 ? "Who opens?" : `${inn.battingName} chase ${inn.target}`} subtitle="Keep these names or type real ones. You can rename anyone later by tapping their name." onClose={onClose}>
      {needS && (
        <div className="mt-1">
          <SheetLabel>{inn.battingName}: on strike</SheetLabel>
          <NameInput id="op-s" value={s} onChange={setS} label="Batter on strike" />
          {chips(inn.batting, s, setS, [n])}
        </div>
      )}
      {needS && needN && (
        <div className="flex justify-center my-1">
          <button
            type="button"
            onClick={() => {
              setS(n);
              setN(s);
            }}
            className="press-tight inline-flex items-center gap-1.5 h-10 px-3 rounded-full text-[13px] font-semibold text-primary-600 hover:bg-primary-100"
          >
            <ArrowUpDown className="w-4 h-4" aria-hidden /> Swap ends
          </button>
        </div>
      )}
      {needN && (
        <div className="mt-1">
          <SheetLabel>{inn.battingName}: non-striker</SheetLabel>
          <NameInput id="op-n" value={n} onChange={setN} label="Non-striker" />
          {chips(inn.batting, n, setN, [s])}
        </div>
      )}
      {needB && (
        <div className={needS || needN ? "mt-5" : "mt-1"}>
          <SheetLabel>{inn.bowlingName}: bowling first</SheetLabel>
          <NameInput id="op-b" value={b} onChange={setB} label="Opening bowler" />
          {chips(inn.bowling, b, setB, [])}
        </div>
      )}
      {err && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-red-600">
          {err}
        </p>
      )}
      <button type="button" onClick={go} className="press-tight mt-5 w-full h-14 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600">
        Start scoring
      </button>
    </Sheet>
  );
}

/** The next batter in, after a retirement or an undo. */
export function BatterSheet({ match, view, onCommit, onClose }: { match: Match; view: MatchView; onCommit: Commit; onClose: () => void }) {
  const side = view.current.batting;
  const end: End = view.needs.includes("striker") ? "striker" : "nonStriker";
  const pick = (name: string, id?: string) => onCommit([{ type: "setBatter", ...(id ? { player: id } : resolvePlayer(match, side, name)) }]);
  return (
    <Sheet title="Next batter in" subtitle={end === "striker" ? "Comes in on strike." : "Comes in at the non-striker's end."} onClose={onClose}>
      <PlayerPicker options={batterOpts(view.batterOptions)} newName={defaultName(view, side, "Batter")} newLabel="New player" onPick={pick} />
    </Sheet>
  );
}

/** Next over's bowler, or a change mid-over. The last over's bowler needs a second tap. */
export function BowlerSheet({ match, view, mode, onCommit, onClose }: { match: Match; view: MatchView; mode: "over" | "change"; onCommit: Commit; onClose: () => void }) {
  const side = view.current.bowling;
  const [confirm, setConfirm] = useState<string | null>(null);
  const overNo = Math.floor(view.current.legalBalls / 6) + 1;
  const opts = bowlerOrder(view).filter((o) => !(mode === "change" && o.current));
  const max = view.setup.rules.maxOversPerBowler;
  const pick = (name: string, id?: string) => onCommit([{ type: "setBowler", ...(id ? { player: id } : resolvePlayer(match, side, name)) }]);
  return (
    <Sheet title={mode === "change" ? "Change bowler" : `Over ${overNo}: who bowls?`} subtitle={mode === "change" ? "The new bowler finishes this over." : view.current.lastOverBowler ? "The last over's bowler cannot bowl this one." : undefined} onClose={onClose}>
      {opts.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {opts.map((o) => {
            const warn = o.blocked === "lastOver" ? "Bowled the last over" : o.blocked === "quota" ? `Has bowled all ${max} overs` : null;
            const figures = o.balls ? `${o.overs} ov, ${o.wickets}/${o.runs}` : "Not bowled yet";
            return (
              <Pick
                key={o.id}
                onClick={() => {
                  if (warn && confirm !== o.id) return setConfirm(o.id);
                  pick(o.name, o.id);
                }}
                label={o.name}
                detail={warn ? (confirm === o.id ? "Tap again to let them bowl" : warn) : figures}
                muted={!!warn && confirm !== o.id}
                danger={!!warn && confirm === o.id}
              />
            );
          })}
        </div>
      )}
      <div className={opts.length ? "mt-3" : ""}>
        <PlayerPicker options={[]} newName={defaultName(view, side, "Bowler")} newLabel="New bowler" onPick={pick} />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Wickets                                                             */
/* ------------------------------------------------------------------ */

type Kind = BallWicketKind | "retire";
const NEEDS_DETAIL: ReadonlySet<Kind> = new Set<Kind>(["caught", "runOut", "stumped", "retire", "obstructing"]);
const CROSSING: ReadonlySet<Kind> = new Set<Kind>(["caught", "runOut", "obstructing"]);

/**
 * W, then how out, then (when there is one) who comes in next, all in
 * one sheet. The ball and the new batter are saved together, so undo
 * takes both back.
 */
export function WicketSheet({ match, view, extra, nb, preset, onCommit, onClose }: { match: Match; view: MatchView; extra: Extra; nb: NbSource; preset?: "retire"; onCommit: Commit; onClose: () => void }) {
  const inn = view.current;
  const [kind, setKind] = useState<Kind | null>(preset ?? null);
  const [out, setOut] = useState<End>("striker");
  const [runs, setRuns] = useState(0);
  const [fielder, setFielder] = useState("");
  const [typedFielder, setTypedFielder] = useState("");
  const [retire, setRetire] = useState<RetireKind>("retiredHurt");
  const [faceNew, setFaceNew] = useState<boolean | null>(null);
  const [showFielder, setShowFielder] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const kinds = allowedWicketKinds(extra, { freeHit: view.freeHit });
  const both = !!inn.striker && !!inn.nonStriker;
  const outLine = out === "striker" ? inn.striker : inn.nonStriker;
  const survivor = out === "striker" ? inn.nonStriker : inn.striker;
  const fieldSide = inn.bowling;

  /** The event(s) for the current choices; crossed only flips who faces next. */
  const build = (crossed: boolean): MatchEvent | null => {
    if (!kind) return null;
    if (kind === "retire") return { type: "retire", out, kind: retire };
    const fid = fielder || (cleanName(typedFielder) ? resolveFielder(view, fieldSide, cleanName(typedFielder)) : "");
    const w: BallWicket = { kind, ...(out !== "striker" ? { out } : {}), ...(fid ? { fielder: fid } : {}), ...(crossed ? { crossed: true } : {}) };
    return buildBall(kind === "runOut" ? extra : extra === "bye" || extra === "legBye" ? "none" : extra, kind === "runOut" ? runs : 0, nb, w);
  };

  // What happens after the wicket: does someone come in, and at which end? (One derive, well under a millisecond.)
  const after = (() => {
    const e = build(false);
    if (!e) return null;
    const c = check(match, e);
    if (c.error) return { error: c.error, needBatter: false, newOnStrike: false, view: null as MatchView | null };
    const v2 = derive(apply(match, e));
    const needBatter = v2.status === "live" && v2.current.index === inn.index && (v2.needs.includes("striker") || v2.needs.includes("nonStriker"));
    return { error: null, needBatter, newOnStrike: v2.needs.includes("striker"), view: v2 };
  })();

  const canCross = !!kind && CROSSING.has(kind) && !!after?.needBatter && both;
  const newOnStrike = faceNew ?? after?.newOnStrike ?? true;
  const crossed = canCross && after ? newOnStrike !== after.newOnStrike : false;

  const commit = (batterName?: string, batterId?: string) => {
    const e = build(crossed);
    if (!e) return;
    const evs: MatchEvent[] = [e];
    if (batterName) evs.push({ type: "setBatter", ...(batterId ? { player: batterId } : resolvePlayer(apply(match, e), inn.batting, batterName)) });
    if (!onCommit(evs)) setErr("That did not fit. Check who is out.");
  };

  const pickKind = (k: Kind) => {
    setKind(k);
    setErr(null);
    if (NEEDS_DETAIL.has(k)) return;
    // Bowled, LBW, hit wicket: nothing more to ask unless someone comes in.
    const e = buildBall(extra === "bye" || extra === "legBye" ? "none" : extra, 0, nb, { kind: k as BallWicketKind });
    const v2 = derive(apply(match, e));
    const need = v2.status === "live" && v2.current.index === inn.index && (v2.needs.includes("striker") || v2.needs.includes("nonStriker"));
    if (!need) onCommit([e]);
  };

  const extraWord = extra === "wide" ? "Wide" : extra === "noBall" ? "No-ball" : extra === "bye" ? "Byes" : extra === "legBye" ? "Leg byes" : null;

  if (!kind) {
    const order: BallWicketKind[] = ["bowled", "caught", "lbw", "runOut", "stumped", "hitWicket"];
    return (
      <Sheet
        title="How out?"
        subtitle={
          view.freeHit ? (
            <span className="font-semibold text-amber-700">Free hit: only a run out counts.</span>
          ) : extraWord ? (
            `${extraWord} ball, so only these are possible.`
          ) : (
            `${inn.striker?.name ?? "Striker"} on strike, ${inn.bowler?.name ?? "bowler"} bowling.`
          )
        }
        onClose={onClose}
      >
        <div className="grid grid-cols-2 gap-2">
          {order
            .filter((k) => kinds.includes(k))
            .map((k) => (
              <Pick key={k} onClick={() => pickKind(k)} label={WICKET_LABELS[k]} className="min-h-16" />
            ))}
          {extra === "none" && <Pick onClick={() => pickKind("retire")} label="Retired" detail="Hurt or out, between balls" className="min-h-16" />}
        </div>
        {kinds.includes("obstructing") && (
          <button type="button" onClick={() => pickKind("obstructing")} className="mt-3 h-11 px-2 text-[14px] font-semibold text-primary-600 underline-offset-2 hover:underline">
            Obstructing the field
          </button>
        )}
      </Sheet>
    );
  }

  const label = kind === "retire" ? "Retired" : WICKET_LABELS[kind];
  const fieldOpts = view.teams[fieldSide].players;
  const fielderWord = kind === "caught" ? "Caught by" : kind === "stumped" ? "Stumped by (keeper)" : "Fielder";
  const outName = outLine?.name ?? "Batter";

  return (
    <Sheet
      title={kind === "retire" ? "Retired" : `${label}: ${outName}`}
      subtitle={kind === "retire" ? "Retired hurt can bat again later. Retired out counts as a wicket." : `${outName} ${outLine ? `${outLine.runs} (${outLine.balls})` : ""}${inn.bowler && kind !== "runOut" && kind !== "obstructing" ? `, wicket to ${inn.bowler.name}` : ""}`}
      onClose={onClose}
    >
      <button type="button" onClick={() => (preset ? onClose() : setKind(null))} className="-mt-1 mb-2 h-10 text-[14px] font-semibold text-accent-700">
        {preset ? "Cancel" : "Change how out"}
      </button>

      {(kind === "runOut" || kind === "retire" || kind === "obstructing") && both && (
        <>
          <SheetLabel>{kind === "retire" ? "Who is retiring" : "Who is out"}</SheetLabel>
          <div className="grid grid-cols-2 gap-2">
            {(["striker", "nonStriker"] as const).map((e) => {
              const b = e === "striker" ? inn.striker : inn.nonStriker;
              return <Pick key={e} onClick={() => setOut(e)} selected={out === e} label={b?.name ?? e} detail={e === "striker" ? "On strike" : "Non-striker"} />;
            })}
          </div>
        </>
      )}

      {kind === "retire" && (
        <>
          <SheetLabel>Retired</SheetLabel>
          <Options
            value={retire}
            onChange={setRetire}
            label="Retired hurt or out"
            options={[
              { value: "retiredHurt", label: "Hurt, can come back" },
              { value: "retiredOut", label: "Out" },
            ]}
          />
        </>
      )}

      {kind === "runOut" && (
        <>
          <SheetLabel>{extra === "wide" ? "Runs completed on the wide" : extra === "bye" || extra === "legBye" ? `${extraWord} completed` : "Runs completed"}</SheetLabel>
          <Options
            value={runs}
            onChange={setRuns}
            label="Runs completed"
            options={[0, 1, 2, 3].map((x) => ({ value: x, label: String(x) }))}
          />
        </>
      )}

      {/* A run out asks more, so its optional fielder waits behind a link and the next batter stays in view on small phones. */}
      {kind === "runOut" && !showFielder && (
        <button type="button" onClick={() => setShowFielder(true)} className="mt-3 h-11 px-2 -ml-2 text-[14px] font-semibold text-accent-700 underline-offset-2 hover:underline">
          Add the fielder (optional)
        </button>
      )}
      {(kind === "caught" || kind === "stumped" || (kind === "runOut" && showFielder)) && (
        <>
          <SheetLabel>{fielderWord}, optional</SheetLabel>
          <div className="flex flex-wrap gap-1.5">
            {fieldOpts.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={fielder === p.id}
                onClick={() => {
                  setFielder(fielder === p.id ? "" : p.id);
                  setTypedFielder("");
                }}
                className={`press-tight h-11 px-3.5 rounded-full border-2 text-[14px] font-semibold ${fielder === p.id ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800"}`}
              >
                {p.name}
                {kind === "caught" && p.id === inn.bowler?.id ? " (bowler)" : ""}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <NameInput
              value={typedFielder}
              onChange={(v) => {
                setTypedFielder(v);
                if (v) setFielder("");
              }}
              placeholder="Or type the fielder's name"
              label="Fielder name"
            />
          </div>
        </>
      )}

      {canCross && survivor && (
        <>
          <SheetLabel>Next ball faced by</SheetLabel>
          <Options
            value={newOnStrike ? "new" : "old"}
            onChange={(v) => setFaceNew(v === "new")}
            label="Next ball faced by"
            options={[
              { value: "new", label: "New batter" },
              { value: "old", label: survivor.name },
            ]}
          />
        </>
      )}

      {(after?.error || err) && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-red-600">
          {after?.error ?? err}
        </p>
      )}

      {after && !after.error && after.needBatter && after.view && (
        <>
          <SheetLabel>Next batter in</SheetLabel>
          <PlayerPicker options={batterOpts(after.view.batterOptions)} newName={defaultName(after.view, inn.batting, "Batter")} newLabel="New player" onPick={(name, id) => commit(name, id)} />
        </>
      )}
      {after && !after.error && !after.needBatter && (
        <button type="button" onClick={() => commit()} className="press-tight mt-5 w-full h-14 rounded-full bg-red-600 text-white text-[17px] font-bold hover:bg-red-700">
          <Check className="inline w-5 h-5 mr-1 -mt-0.5" aria-hidden /> {kind === "retire" ? "Confirm" : "Confirm wicket"}
        </button>
      )}
    </Sheet>
  );
}

/** A fielder typed by name: a team player if the name matches, else the name itself. */
function resolveFielder(view: MatchView, side: Side, name: string): string {
  const hit = view.teams[side].players.find((p) => p.name.toLowerCase() === name.toLowerCase());
  return hit ? hit.id : name;
}

/* ------------------------------------------------------------------ */
/* More, players, settings, sharing                                    */
/* ------------------------------------------------------------------ */

export type MoreAction = "five" | "swap" | "retire" | "bowler" | "share" | "settings" | "end" | "abandon" | "matches";

export function MoreSheet({ view, onAction, onClose }: { view: MatchView; onAction: (a: MoreAction) => void; onClose: () => void }) {
  const live = view.status === "live";
  const canSwap = live && !!view.current.striker && !!view.current.nonStriker;
  return (
    <Sheet title="More" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Pick onClick={() => onAction("five")} label="5 runs" detail="Overthrows, a 4 plus 1" disabled={!view.ready} />
        <Pick onClick={() => onAction("swap")} label="Swap strike" detail="If the ends got mixed up" disabled={!canSwap} />
        <Pick onClick={() => onAction("retire")} label="Retire a batter" detail="Hurt or retired out" disabled={!live || (!view.current.striker && !view.current.nonStriker)} />
        <Pick onClick={() => onAction("bowler")} label="Change bowler" detail="Injury or a mistake" disabled={!live || !view.current.bowler} />
        <Pick onClick={() => onAction("share")} label="Share live score" detail="WhatsApp ready text" />
        <Pick onClick={() => onAction("settings")} label="Match settings" detail="Teams, overs, house rules" />
        <Pick onClick={() => onAction("end")} label="End innings" detail="Declared or time up" disabled={!live} />
        <Pick onClick={() => onAction("matches")} label="All matches" detail="Start or open another" />
      </div>
      <button type="button" onClick={() => onAction("abandon")} disabled={!live} className="mt-4 h-11 px-2 text-[14px] font-semibold text-red-600 disabled:opacity-40">
        Abandon match (no result)
      </button>
    </Sheet>
  );
}

/** Tap a name: rename, and for the batters and bowler at the crease the quick actions. */
export function PlayerSheet({ view, side, id, onCommit, onAction, onClose }: { view: MatchView; side: Side; id: string; onCommit: Commit; onAction: (a: MoreAction) => void; onClose: () => void }) {
  const p = view.teams[side].players.find((x) => x.id === id);
  const [name, setName] = useState(p?.name ?? "");
  const cur = view.current;
  const atCrease = view.status === "live" && side === cur.batting && (cur.striker?.id === id || cur.nonStriker?.id === id);
  const bowling = view.status === "live" && side === cur.bowling && cur.bowler?.id === id;
  if (!p) return null;
  const save = () => {
    const n = cleanName(name);
    if (!n || n === p.name) return onClose();
    onCommit([{ type: "renamePlayer", team: side, player: id, name: n }]);
  };
  return (
    <Sheet title={p.name} subtitle={view.teams[side].name} onClose={onClose}>
      <SheetLabel>Name</SheetLabel>
      <div className="flex gap-2">
        <NameInput value={name} onChange={setName} label="Player name" onEnter={save} />
        <button type="button" onClick={save} className="press-tight h-12 px-5 shrink-0 rounded-xl bg-primary-900 text-white text-[15px] font-bold">
          Save
        </button>
      </div>
      <p className="mt-1.5 text-[12px] text-primary-500">Changes the name everywhere, old balls included.</p>
      {(atCrease || bowling) && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {atCrease && <Pick onClick={() => onAction("swap")} label="Swap strike" disabled={!cur.striker || !cur.nonStriker} />}
          {atCrease && <Pick onClick={() => onAction("retire")} label="Retire" detail="Hurt or out" />}
          {bowling && <Pick onClick={() => onAction("bowler")} label="Change bowler" detail="Someone else finishes the over" />}
        </div>
      )}
    </Sheet>
  );
}

/** Change teams, overs and house rules mid-match. Applies from now on. */
export function SettingsSheet({ match, view, onCommit, onClose }: { match: Match; view: MatchView; onCommit: Commit; onClose: () => void }) {
  const s = view.setup;
  const [a, setA] = useState(s.teamA);
  const [b, setB] = useState(s.teamB);
  const [overs, setOvers] = useState(String(s.overs));
  const [players, setPlayers] = useState(String(s.playersPerSide));
  const [rules, setRules] = useState<Rules>(s.rules);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Rules>(k: K, v: Rules[K]) => setRules((r) => ({ ...r, [k]: v }));

  const event = (): ChangeSetupEvent => {
    const e: ChangeSetupEvent = { type: "changeSetup" };
    if (cleanName(a) && cleanName(a) !== s.teamA) e.teamA = cleanName(a);
    if (cleanName(b) && cleanName(b) !== s.teamB) e.teamB = cleanName(b);
    if (Number(overs) >= 1 && Number(overs) !== s.overs) e.overs = Number(overs);
    if (Number(players) >= 2 && Number(players) !== s.playersPerSide) e.playersPerSide = Number(players);
    const r = normalizeRules(rules);
    if (JSON.stringify(r) !== JSON.stringify(s.rules)) e.rules = r;
    return e;
  };
  const save = () => {
    const e = event();
    if (Object.keys(e).length === 1) return onClose();
    const c = check(match, e);
    if (c.error) return setErr(c.error);
    if (c.warnings.length && !confirm) {
      setConfirm(true);
      return setErr(`${c.warnings.join(". ")}. Tap Save again to go ahead.`);
    }
    onCommit([e]);
  };

  return (
    <Sheet title="Match settings" subtitle="Changes apply from the next ball." onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <SheetLabel>Team 1</SheetLabel>
          <NameInput value={a} onChange={setA} label="Team 1 name" />
        </div>
        <div>
          <SheetLabel>Team 2</SheetLabel>
          <NameInput value={b} onChange={setB} label="Team 2 name" />
        </div>
        <div>
          <SheetLabel>Overs a side</SheetLabel>
          <input type="number" inputMode="numeric" min={1} max={50} value={overs} onChange={(e) => setOvers(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Overs a side" className="w-full h-12 px-3.5 rounded-xl bg-primary-50 border-2 border-primary-200 text-[16px] font-semibold" />
        </div>
        <div>
          <SheetLabel>Players a side</SheetLabel>
          <input type="number" inputMode="numeric" min={2} max={30} value={players} onChange={(e) => setPlayers(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Players a side" className="w-full h-12 px-3.5 rounded-xl bg-primary-50 border-2 border-primary-200 text-[16px] font-semibold" />
        </div>
      </div>
      <SheetLabel>Wide gives</SheetLabel>
      <Options value={rules.wideRuns} onChange={(v) => set("wideRuns", v)} label="Runs for a wide" options={[0, 1, 2].map((x) => ({ value: x, label: `${x} run${x === 1 ? "" : "s"}` }))} />
      <SheetLabel>No-ball gives</SheetLabel>
      <Options value={rules.noBallRuns} onChange={(v) => set("noBallRuns", v)} label="Runs for a no-ball" options={[0, 1, 2].map((x) => ({ value: x, label: `${x} run${x === 1 ? "" : "s"}` }))} />
      <SheetLabel>Free hit after a no-ball</SheetLabel>
      <Options value={rules.freeHit ? "on" : "off"} onChange={(v) => set("freeHit", v === "on")} label="Free hit" options={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]} />
      <SheetLabel>Max overs a bowler</SheetLabel>
      <Options value={rules.maxOversPerBowler ?? 0} onChange={(v) => set("maxOversPerBowler", v || null)} label="Max overs a bowler" options={[0, 1, 2, 3, 4, 5].map((x) => ({ value: x, label: x ? String(x) : "No limit" }))} />
      <SheetLabel>Last man stands</SheetLabel>
      <Options value={rules.lastManStands ? "on" : "off"} onChange={(v) => set("lastManStands", v === "on")} label="Last man stands" options={[{ value: "off", label: "Off" }, { value: "on", label: "On" }]} />
      <SheetLabel>Batter retires at</SheetLabel>
      <Options value={rules.retireAt ?? 0} onChange={(v) => set("retireAt", v || null)} label="Batter retires at" options={[0, 25, 30, 50].map((x) => ({ value: x, label: x ? String(x) : "Off" }))} />
      {err && (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-red-600">
          {err}
        </p>
      )}
      <button type="button" onClick={save} className="press-tight mt-5 w-full h-14 rounded-full bg-primary-900 text-white text-[17px] font-bold">
        Save
      </button>
    </Sheet>
  );
}

/** Preview of the WhatsApp text, then WhatsApp, copy, or the phone's share sheet. */
export function ShareSheet({ text, title, onShared, onClose }: { text: string; title: string; onShared: (how: string) => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const canNative = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onShared("copy");
    } catch {
      setCopied(false);
    }
  };
  return (
    <Sheet title={title} subtitle="Bold bits show as bold in WhatsApp." onClose={onClose}>
      <pre className="whitespace-pre-wrap break-words rounded-2xl bg-primary-50 p-3 text-[14px] leading-relaxed text-primary-800 font-sans">{text}</pre>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onShared("whatsapp")}
          className="press-tight col-span-2 inline-flex items-center justify-center gap-2 h-14 rounded-full bg-accent-500 text-white text-[17px] font-bold hover:bg-accent-600"
        >
          <MessageCircle className="w-5 h-5" aria-hidden /> Send on WhatsApp
        </a>
        <button type="button" onClick={copy} className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 text-[15px] font-bold text-primary-800">
          {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? "Copied" : "Copy text"}
        </button>
        {canNative ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.share({ text });
                onShared("native");
              } catch {
                /* cancelled */
              }
            }}
            className="press-tight inline-flex items-center justify-center gap-2 h-12 rounded-full border-2 border-primary-200 text-[15px] font-bold text-primary-800"
          >
            <Share2 className="w-4 h-4" aria-hidden /> Other apps
          </button>
        ) : (
          <span />
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </Sheet>
  );
}

export function ConfirmSheet({ title, body, confirm, danger, onConfirm, onClose }: { title: string; body: string; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="text-[15px] text-primary-700 leading-relaxed">{body}</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={onClose} className="press-tight h-14 rounded-full border-2 border-primary-200 text-[16px] font-bold text-primary-800">
          Cancel
        </button>
        <button type="button" onClick={onConfirm} className={`press-tight h-14 rounded-full text-white text-[16px] font-bold ${danger ? "bg-red-600 hover:bg-red-700" : "bg-primary-900"}`}>
          {confirm}
        </button>
      </div>
    </Sheet>
  );
}
