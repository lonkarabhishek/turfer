"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import { trackTool } from "@/lib/analytics/tools";
import { STATUS_H } from "@/lib/tools/tossSim";
import { ToolCta } from "./ToolCta";
import { TossCoin, type TossCoinHandle } from "./TossCoin";

const TOOL = "toss";
type Side = "heads" | "tails";
type Pick = "bat" | "bowl";
type Phase = "idle" | "flying" | "landed";

// Coin sound: off by default, remembered on this device.
const SOUND_KEY = "tapturf.toss.sound";
const soundListeners = new Set<() => void>();
let soundMemory: boolean | null = null; // when storage is blocked
function readSound(): boolean {
  if (soundMemory != null) return soundMemory;
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}
function writeSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "1" : "0");
  } catch {
    soundMemory = on;
  }
  soundListeners.forEach((f) => f());
}
function subscribeSound(f: () => void) {
  soundListeners.add(f);
  return () => {
    soundListeners.delete(f);
  };
}

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Call it, flip it, pick bat or bowl. Thumb-sized buttons for the turf. */
export function CricketToss({ cta }: { cta: { label: string; href: string } }) {
  const [call, setCall] = useState<Side | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [face, setFace] = useState<Side>("heads");
  const [pick, setPick] = useState<Pick | null>(null);
  const [nudged, setNudged] = useState(false);
  const [tosses, setTosses] = useState(0);
  const sound = useSyncExternalStore(subscribeSound, readSound, () => false);
  const coin = useRef<TossCoinHandle>(null);
  const calls = useRef<HTMLDivElement>(null);

  useEffect(() => {
    trackTool("tool_opened", TOOL);
  }, []);

  // Stable, so calling heads or tails doesn't re-render the coin.
  const callNow = useRef(call);
  useEffect(() => {
    callNow.current = call;
  }, [call]);
  const onResult = useCallback((result: Side) => {
    setFace(result);
    setPhase("landed");
    trackTool("tool_result_generated", TOOL, { result, won: result === callNow.current });
  }, []);

  // `forced` is the test hook below; it may interrupt a toss, and the coin lands the first one.
  const flip = (forced?: Side): number => {
    if (phase === "flying" && !forced) return 0;
    if (!call) {
      // Call first: point at the two buttons instead of flipping.
      setNudged(true);
      if (!reducedMotion()) {
        calls.current?.animate([{ transform: "none" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "none" }], { duration: 320, easing: "ease-in-out" });
      }
      return 0;
    }
    trackTool("tool_used", TOOL, { call });
    let result: Side;
    if (forced) result = forced;
    else {
      // Crypto randomness where available, Math.random otherwise.
      let bit: number;
      try {
        bit = crypto.getRandomValues(new Uint8Array(1))[0] & 1;
      } catch {
        bit = Math.random() < 0.5 ? 0 : 1;
      }
      result = bit === 0 ? "heads" : "tails";
    }
    // Decided before the coin moves; the coin is thrown to land on it.
    const ms = coin.current?.toss(result) ?? 0;
    setPhase("flying");
    setPick(null);
    setNudged(false);
    setTosses((n) => n + 1);
    return ms;
  };

  // End-to-end hook for local test builds only: window.__tossTo('heads' | 'tails') -> ms to the result.
  const flipRef = useRef(flip);
  useEffect(() => {
    flipRef.current = flip;
  });
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_E2E_AUTH !== "1") return;
    const w = window as unknown as { __tossTo?: (f: Side) => number };
    w.__tossTo = (f: Side) => flipRef.current(f);
    return () => {
      delete w.__tossTo;
    };
  }, []);

  const reset = () => {
    setCall(null);
    setPick(null);
    setNudged(false);
    setPhase("idle");
  };

  const landed = phase === "landed";
  const won = landed && face === call;
  const flying = phase === "flying";

  return (
    // Clipped across only (clip, not hidden): the turning light layers' corners can't widen a 360px page, and the coin still rises freely.
    <div className="relative overflow-x-clip rounded-3xl border border-primary-200 bg-white px-4 pb-4 pt-2 sm:p-6 shadow-soft" data-toss data-state={phase} data-face={face}>
      <button
        type="button"
        aria-pressed={sound}
        aria-label="Coin sound"
        onClick={() => writeSound(!sound)}
        className={`absolute right-2 top-2 z-10 grid h-10 w-10 place-items-center rounded-full border bg-white transition-colors ${sound ? "border-primary-300 text-primary-900" : "border-primary-200 text-primary-400"}`}
      >
        {sound ? <Volume2 className="h-[18px] w-[18px]" aria-hidden /> : <VolumeX className="h-[18px] w-[18px]" aria-hidden />}
      </button>

      {/* Coin stage, with the status line in the headroom the flight passes through. */}
      <div className="relative">
        <TossCoin ref={coin} onResult={onResult} sound={sound} />
        <div
          aria-live="polite"
          className={`absolute inset-x-11 top-0 flex flex-col items-center justify-end pb-1 text-center transition-opacity duration-150 ${flying ? "opacity-0" : "opacity-100"}`}
          style={{ height: STATUS_H }}
        >
          {landed ? (
            <div key={tosses} className="toss-pop">
              <p className="text-[27px] font-extrabold leading-[1.15] tracking-tight text-primary-900">It&rsquo;s {face}.</p>
              <p className={`mt-1 text-[19px] leading-snug ${won ? "font-bold text-accent-500" : "font-semibold text-primary-500"}`}>{won ? "You won the toss." : "You lost the toss."}</p>
            </div>
          ) : (
            <p className="text-[16px] leading-snug text-primary-600">{flying ? "In the air…" : nudged ? "Call it first: heads or tails?" : call ? `You called ${call}. Flip it.` : "Call it: heads or tails?"}</p>
          )}
        </div>
      </div>

      {/* Controls: one thumb, bottom of the card */}
      <div className="mt-1 space-y-3">
        {!landed && (
          <>
            <div ref={calls} role="radiogroup" aria-label="Your call" className="grid grid-cols-2 gap-3">
              {(["heads", "tails"] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={call === s}
                  disabled={flying}
                  onClick={() => {
                    setCall(s);
                    setNudged(false);
                  }}
                  className={`press-tight h-14 rounded-2xl text-[16px] font-bold capitalize border-2 transition-colors ${call === s ? "border-accent-500 bg-accent-50 text-accent-800" : "border-primary-200 bg-white text-primary-800 hover:border-accent-400"}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => flip()}
              disabled={flying}
              className="press-tight w-full h-14 rounded-full bg-primary-900 text-white text-[16px] font-bold tracking-wide hover:bg-accent-600 disabled:opacity-45 transition-colors"
            >
              {flying ? "In the air…" : "Flip coin"}
            </button>
          </>
        )}

        {landed && won && pick == null && (
          <div role="radiogroup" aria-label="Bat or bowl" className="grid grid-cols-2 gap-3">
            {(["bat", "bowl"] as Pick[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={false} onClick={() => setPick(p)} className="press-tight h-14 rounded-2xl border-2 border-primary-200 bg-white text-[16px] font-bold capitalize text-primary-800 hover:border-accent-400 transition-colors">
                {p}
              </button>
            ))}
          </div>
        )}
        {landed && won && pick && <p className="text-center text-[15px] font-semibold text-accent-700">You won the toss and chose to {pick}.</p>}
        {landed && !won && <p className="text-center text-[14px] text-primary-500">The other side decides whether to bat or bowl.</p>}

        {landed && (
          <button type="button" onClick={reset} className="press-tight w-full h-12 rounded-full border border-primary-200 bg-white text-[15px] font-semibold text-primary-800 hover:border-accent-400 inline-flex items-center justify-center gap-2 transition-colors">
            <RotateCcw className="w-4 h-4" aria-hidden /> New toss
          </button>
        )}
      </div>

      <ToolCta tool={TOOL} label={cta.label} href={cta.href} />
    </div>
  );
}
