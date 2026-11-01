"use client";

import { useEffect, useState } from "react";
import { CalendarX2, Loader2, Repeat as RepeatIcon, X } from "lucide-react";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";

/**
 * Stopping a repeat, from its game's page or the Me tab: no more games
 * go up, and the host picks whether the games already up and not played
 * yet stay on (players can still join them) or are cancelled (their
 * players and anyone waiting are told, as for any cancelled game).
 * onStop answers the page's words for what went wrong, or null.
 */
export function SeriesStopSheet({
  open,
  label,
  left,
  onStop,
  onClose,
}: {
  open: boolean;
  /** "Every Tue and Thu" (lib/games/repeat.ts repeatLabel). */
  label: string;
  /** Its games up and not played yet; null when not known. */
  left: number | null;
  onStop: (cancel: boolean) => Promise<string | null>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"keep" | "cancel" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const stop = async (cancel: boolean) => {
    setBusy(cancel ? "cancel" : "keep");
    setError("");
    const problem = await onStop(cancel);
    setBusy(null);
    if (problem) setError(problem);
  };
  const games = left === null ? "its games not played yet" : left === 1 ? "the 1 game not played yet" : `the ${left} games not played yet`;

  return (
    <ViewportOverlay className="z-[70] flex items-end sm:items-center justify-center" data-modal-open="true">
      <div className="fixed inset-0 bg-primary-800/50 animate-fade-in" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stop-title"
        className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-elevated animate-slide-up flex flex-col max-h-[calc(var(--vv-h,100dvh)*0.9)]"
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 bg-primary-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-primary-200 shrink-0">
          <p id="stop-title" className="text-[16px] font-bold text-primary-900">Stop repeating?</p>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors focus-neon">
            <X className="w-4 h-4 text-primary-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-3 space-y-3">
          <p className="text-[15px] text-primary-700 leading-snug">
            No new games will go up for this repeat (<span className="font-semibold text-primary-900">{label.charAt(0).toLowerCase() + label.slice(1)}</span>).
          </p>
          <button
            type="button"
            onClick={() => stop(false)}
            disabled={!!busy}
            className="w-full flex items-start gap-3 rounded-2xl border-2 border-primary-200 bg-white hover:border-primary-300 px-4 py-3.5 text-left transition-colors disabled:opacity-60 focus-neon"
          >
            <span className="size-9 shrink-0 rounded-xl grid place-items-center bg-primary-50 text-primary-700">
              {busy === "keep" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RepeatIcon className="w-4 h-4" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-primary-900 leading-snug">Stop, keep the games already up</span>
              <span className="block text-[13px] text-primary-500 leading-snug mt-0.5">
                {left === 0 ? "None are left to play." : "They stay on, and players can still join them."}
              </span>
            </span>
          </button>
          {left !== 0 && (
            <button
              type="button"
              onClick={() => stop(true)}
              disabled={!!busy}
              className="w-full flex items-start gap-3 rounded-2xl border-2 border-hot-500/40 bg-hot-500/5 hover:border-hot-500 px-4 py-3.5 text-left transition-colors disabled:opacity-60 focus-neon"
            >
              <span className="size-9 shrink-0 rounded-xl grid place-items-center bg-hot-500/10 text-hot-600">
                {busy === "cancel" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CalendarX2 className="w-4 h-4" aria-hidden />}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-hot-600 leading-snug">Stop and cancel {games}</span>
                <span className="block text-[13px] text-primary-500 leading-snug mt-0.5">Their players and anyone waiting to join are told.</span>
              </span>
            </button>
          )}
          {error && (
            <p role="alert" className="text-[14px] font-medium text-hot-600">
              {error}
            </p>
          )}
        </div>
        <div className="shrink-0 px-4 pb-3 pt-1">
          <button type="button" onClick={onClose} disabled={!!busy} className="w-full min-h-[48px] rounded-full text-[15px] font-semibold text-primary-700 hover:bg-primary-50 focus-neon">
            Keep repeating
          </button>
        </div>
        <div className="sm:hidden h-[var(--safe-b,env(safe-area-inset-bottom))] bg-white shrink-0" />
      </div>
    </ViewportOverlay>
  );
}
