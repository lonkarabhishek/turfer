"use client";

import { useState } from "react";
import { ArrowLeftRight, Plus, X } from "lucide-react";
import { cleanName } from "../scorer/logic";
import { PLAYERS_MAX } from "@/lib/turfSession/names";
import type { Side, SideKey } from "@/lib/turfSession/types";

/**
 * The two sides' players as chips in two columns: a tap moves a player to
 * the other side. With onAdd, a box under each column adds one; with
 * remove, each chip has its own small X. Names only; the sides' own names
 * are typed elsewhere. One column under 360 px.
 */
export function SidesEditor({ sides, onChange, add = false, remove = false }: { sides: { a: Side; b: Side }; onChange: (s: { a: Side; b: Side }) => void; add?: boolean; remove?: boolean }) {
  const [typed, setTyped] = useState<Record<SideKey, string>>({ a: "", b: "" });
  const other = (k: SideKey): SideKey => (k === "a" ? "b" : "a");
  const all = new Set([...sides.a.players, ...sides.b.players].map((p) => p.toLowerCase()));

  const move = (k: SideKey, i: number) => {
    const name = sides[k].players[i];
    const o = other(k);
    onChange({ ...sides, [k]: { ...sides[k], players: sides[k].players.filter((_, j) => j !== i) }, [o]: { ...sides[o], players: [...sides[o].players, name] } } as { a: Side; b: Side });
  };
  const drop = (k: SideKey, i: number) => onChange({ ...sides, [k]: { ...sides[k], players: sides[k].players.filter((_, j) => j !== i) } } as { a: Side; b: Side });
  const addOne = (k: SideKey) => {
    const name = cleanName(typed[k]);
    if (!name || all.has(name.toLowerCase()) || sides[k].players.length >= PLAYERS_MAX) return;
    onChange({ ...sides, [k]: { ...sides[k], players: [...sides[k].players, name] } } as { a: Side; b: Side });
    setTyped((t) => ({ ...t, [k]: "" }));
  };

  return (
    // Under 360 px the sides stack, so a name is never cut to its first letter (Amit or Arjun?).
    <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2">
      {(["a", "b"] as const).map((k) => (
        <div key={k} className="min-w-0 rounded-2xl bg-primary-50 border border-primary-200 p-2">
          <p className="px-1 text-[13px] font-bold text-primary-900 truncate">
            {sides[k].name} <span className="font-semibold text-primary-500 tabular-nums">· {sides[k].players.length}</span>
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {sides[k].players.map((p, i) => (
              <li key={`${p}-${i}`} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => move(k, i)}
                  aria-label={`Move ${p} to ${sides[other(k)].name}`}
                  className="press-tight min-w-0 flex-1 min-h-11 px-3 rounded-full bg-white border-2 border-primary-200 text-left text-[15px] font-semibold text-primary-900 inline-flex items-center justify-between gap-1 hover:border-accent-500"
                >
                  <span className="truncate">{p}</span>
                  <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-primary-400" aria-hidden />
                </button>
                {remove && (
                  <button type="button" onClick={() => drop(k, i)} aria-label={`Remove ${p}`} className="shrink-0 w-11 min-h-11 inline-flex items-center justify-center rounded-full text-primary-500 hover:text-red-600 hover:bg-red-50">
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
            {!sides[k].players.length && <li className="px-1 py-2 text-[13px] text-primary-500">Nobody yet</li>}
          </ul>
          {add && (
            <div className="mt-2 flex gap-1">
              <input
                type="text"
                value={typed[k]}
                onChange={(e) => setTyped((t) => ({ ...t, [k]: e.target.value.slice(0, 40) }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOne(k);
                  }
                }}
                placeholder="Add a player"
                aria-label={`Add a player to ${sides[k].name}`}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="done"
                maxLength={40}
                className="min-w-0 flex-1 h-11 px-3 rounded-xl bg-white border-2 border-primary-200 text-[16px] text-primary-900 placeholder:text-primary-500 focus:outline-none focus:border-accent-500"
              />
              <button type="button" onClick={() => addOne(k)} aria-label={`Add to ${sides[k].name}`} className="press-tight shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-xl bg-primary-900 text-white">
                <Plus className="w-5 h-5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
