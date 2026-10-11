"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { trackTool } from "@/lib/analytics/tools";
import { ToolCta } from "./ToolCta";

const TOOL = "toss";
type Side = "heads" | "tails";
type Pick = "bat" | "bowl";

/** Call it, flip it, pick bat or bowl. Thumb-sized buttons for the turf. */
export function CricketToss({ cta }: { cta: { label: string; href: string } }) {
  const [call, setCall] = useState<Side | null>(null);
  const [flipping, setFlipping] = useState(false);
  const [landed, setLanded] = useState<Side | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [spin, setSpin] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    trackTool("tool_opened", TOOL);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flip = () => {
    if (!call || flipping) return;
    trackTool("tool_used", TOOL, { call });
    setFlipping(true);
    setLanded(null);
    setPick(null);
    // Crypto randomness where available, Math.random otherwise.
    let bit: number;
    try {
      bit = crypto.getRandomValues(new Uint8Array(1))[0] & 1;
    } catch {
      bit = Math.random() < 0.5 ? 0 : 1;
    }
    const result: Side = bit === 0 ? "heads" : "tails";
    // Several full turns, ending face-up on the result (heads = 0deg, tails = 180deg).
    setSpin((s) => {
      const base = Math.ceil(s / 360) * 360 + 360 * 4;
      return base + (result === "tails" ? 180 : 0);
    });
    timer.current = setTimeout(() => {
      setLanded(result);
      setFlipping(false);
      trackTool("tool_result_generated", TOOL, { result, won: result === call });
    }, 1400);
  };

  const reset = () => {
    setCall(null);
    setLanded(null);
    setPick(null);
    setFlipping(false);
  };

  const won = landed != null && landed === call;
  const choosing = landed != null && won && pick == null;

  return (
    <div className="rounded-3xl border border-primary-200 bg-white p-4 sm:p-6 shadow-soft">
      {/* Coin */}
      <div className="flex justify-center py-2" aria-hidden>
        <div className="coin-scene">
          <div className="coin" style={{ transform: `rotateY(${spin}deg)`, transition: flipping ? "transform 1.4s cubic-bezier(0.2, 0.7, 0.2, 1)" : "none" }}>
            <div className="coin-face coin-heads">H</div>
            <div className="coin-face coin-tails">T</div>
          </div>
        </div>
      </div>

      <div className="min-h-[56px] text-center" aria-live="polite">
        {landed == null ? (
          <p className="text-[15px] text-primary-600">{flipping ? "In the air..." : call ? `You called ${call}. Flip it.` : "Call it: heads or tails?"}</p>
        ) : (
          <>
            <p className="font-display text-2xl text-primary-900">
              It&rsquo;s {landed}. {won ? "You won the toss." : "You lost the toss."}
            </p>
            {pick && <p className="mt-1 text-[15px] text-accent-700 font-semibold">You won the toss and chose to {pick}.</p>}
            {!won && <p className="mt-1 text-[14px] text-primary-500">The other side decides whether to bat or bowl.</p>}
          </>
        )}
      </div>

      {/* Controls: one thumb, bottom of the card */}
      <div className="mt-3 space-y-3">
        {landed == null && (
          <>
            <div role="radiogroup" aria-label="Your call" className="grid grid-cols-2 gap-3">
              {(["heads", "tails"] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={call === s}
                  disabled={flipping}
                  onClick={() => setCall(s)}
                  className={`press-tight h-14 rounded-2xl text-[16px] font-bold capitalize border-2 transition-colors ${call === s ? "border-accent-500 bg-accent-50 text-accent-800" : "border-primary-200 bg-white text-primary-800 hover:border-accent-400"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={flip}
              disabled={!call || flipping}
              className="press-tight w-full h-14 rounded-full bg-primary-900 text-white text-[16px] font-bold tracking-wide hover:bg-accent-600 disabled:opacity-40 transition-colors"
            >
              {flipping ? "Flipping..." : "Flip coin"}
            </button>
          </>
        )}

        {choosing && (
          <div role="radiogroup" aria-label="Bat or bowl" className="grid grid-cols-2 gap-3">
            {(["bat", "bowl"] as Pick[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={false} onClick={() => setPick(p)} className="press-tight h-14 rounded-2xl border-2 border-primary-200 bg-white text-[16px] font-bold capitalize text-primary-800 hover:border-accent-400 transition-colors">
                {p}
              </button>
            ))}
          </div>
        )}

        {landed != null && (
          <button type="button" onClick={reset} className="press-tight w-full h-12 rounded-full border border-primary-200 bg-white text-[15px] font-semibold text-primary-800 hover:border-accent-400 inline-flex items-center justify-center gap-2 transition-colors">
            <RotateCcw className="w-4 h-4" aria-hidden /> New toss
          </button>
        )}
      </div>

      <ToolCta tool={TOOL} label={cta.label} href={cta.href} />
    </div>
  );
}
