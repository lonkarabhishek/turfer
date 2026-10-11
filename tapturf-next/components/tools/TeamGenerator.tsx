"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Shuffle } from "lucide-react";
import { trackTool } from "@/lib/analytics/tools";
import { ToolCta } from "./ToolCta";
import { PrimaryButton, SecondaryButton, Segmented } from "./inputs";

const TOOL = "team_generator";
type Mode = "random" | "balanced";

const SAMPLE = "Abhishek\nRohan\nOmkar\nShreyas\nAkash\nRaj\nSahil\nAman\nVarun\nKaran";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random: shuffle and deal round-robin. Balanced: strongest first, snake order. */
export function splitTeams(players: { name: string; rating: number }[], count: number, mode: Mode): { name: string; rating: number }[][] {
  const teams: { name: string; rating: number }[][] = Array.from({ length: count }, () => []);
  if (mode === "random") {
    shuffle(players).forEach((p, i) => teams[i % count].push(p));
    return teams;
  }
  const ordered = shuffle(players).sort((a, b) => b.rating - a.rating);
  ordered.forEach((p, i) => {
    const round = Math.floor(i / count);
    const pos = i % count;
    const idx = round % 2 === 0 ? pos : count - 1 - pos;
    teams[idx].push(p);
  });
  return teams;
}

export function TeamGenerator({ cta }: { cta: { label: string; href: string } }) {
  const [text, setText] = useState("");
  const [count, setCount] = useState<"2" | "3" | "4">("2");
  const [mode, setMode] = useState<Mode>("random");
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [teams, setTeams] = useState<{ name: string; rating: number }[][] | null>(null);
  const [copied, setCopied] = useState(false);
  const used = useRef(false);

  useEffect(() => {
    trackTool("tool_opened", TOOL);
  }, []);

  const names = useMemo(() => {
    const seen = new Set<string>();
    return text
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .filter((s) => {
        const k = s.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 40);
  }, [text]);

  const n = Number(count);
  const canGo = names.length >= n;

  const generate = () => {
    if (!canGo) return;
    if (!used.current) {
      used.current = true;
      trackTool("tool_used", TOOL);
    }
    const players = names.map((name) => ({ name, rating: ratings[name] ?? 3 }));
    setTeams(splitTeams(players, n, mode));
    setCopied(false);
    trackTool("tool_result_generated", TOOL, { players: names.length, teams: n, mode });
  };

  const copy = async () => {
    if (!teams) return;
    const body = teams.map((t, i) => `Team ${i + 1}: ${t.map((p) => p.name).join(", ")}`).join("\n");
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your teams", body);
    }
  };

  return (
    <div className="rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      <label htmlFor="tg-names" className="block text-[13px] font-semibold text-primary-800 mb-1.5">
        Player names, one per line
      </label>
      <textarea
        id="tg-names"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        rows={6}
        placeholder={SAMPLE}
        className="w-full rounded-xl bg-primary-50 border border-primary-200 px-3.5 py-3 text-[16px] text-primary-900 placeholder:text-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white transition-colors"
      />
      <div className="mt-1 flex items-center justify-between text-[12px] text-primary-400">
        <span>
          {names.length} player{names.length === 1 ? "" : "s"}
          {names.length > 0 && names.length < n ? `, need at least ${n}` : ""}
        </span>
        {text === "" && (
          <button type="button" onClick={() => setText(SAMPLE)} className="text-accent-700 font-semibold hover:underline">
            Try the sample
          </button>
        )}
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">How many teams</p>
          <Segmented
            value={count}
            onChange={setCount}
            ariaLabel="Number of teams"
            options={[
              { value: "2", label: "2 teams" },
              { value: "3", label: "3 teams" },
              { value: "4", label: "4 teams" },
            ]}
          />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Mode</p>
          <Segmented
            value={mode}
            onChange={setMode}
            ariaLabel="Mode"
            options={[
              { value: "random", label: "Random" },
              { value: "balanced", label: "Balanced" },
            ]}
          />
        </div>
      </div>

      {mode === "balanced" && names.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-semibold text-primary-800 mb-1.5">Rate each player, 1 to 5</p>
          <ul className="divide-y divide-primary-100 rounded-xl border border-primary-200 overflow-hidden">
            {names.map((name) => (
              <li key={name} className="flex items-center justify-between gap-3 px-3 py-2 bg-white">
                <span className="text-[15px] text-primary-900 truncate">{name}</span>
                <div role="radiogroup" aria-label={`Rating for ${name}`} className="flex gap-1 shrink-0">
                  {[1, 2, 3, 4, 5].map((r) => {
                    const on = (ratings[name] ?? 3) === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setRatings((m) => ({ ...m, [name]: r }))}
                        className={`w-9 h-9 rounded-lg text-[13px] font-bold transition-colors ${on ? "bg-accent-500 text-white" : "bg-primary-100 text-primary-600 hover:bg-primary-200"}`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <PrimaryButton onClick={generate} disabled={!canGo} className="w-full sm:w-auto">
          <Shuffle className="w-4 h-4" aria-hidden /> {teams ? "Regenerate" : "Generate teams"}
        </PrimaryButton>
        {teams && (
          <SecondaryButton onClick={copy} className="w-full sm:w-auto">
            {copied ? <Check className="w-4 h-4" aria-hidden /> : <Copy className="w-4 h-4" aria-hidden />} {copied ? "Copied" : "Copy teams"}
          </SecondaryButton>
        )}
      </div>

      {teams && (
        <div className="mt-5 grid sm:grid-cols-2 gap-3" aria-live="polite">
          {teams.map((t, i) => (
            <div key={i} className="rounded-2xl bg-primary-900 text-white p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-lg">Team {i + 1}</p>
                <p className="text-[12px] text-primary-300">
                  {t.length} player{t.length === 1 ? "" : "s"}
                  {mode === "balanced" ? ` · ${t.reduce((s, p) => s + p.rating, 0)} pts` : ""}
                </p>
              </div>
              <ol className="mt-2 space-y-1 text-[15px]">
                {t.map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{p.name}</span>
                    {mode === "balanced" && <span className="text-[12px] text-accent-300 shrink-0">{p.rating}</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      <ToolCta tool={TOOL} label={cta.label} href={cta.href} />
    </div>
  );
}
