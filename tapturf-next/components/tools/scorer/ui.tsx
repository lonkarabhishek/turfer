"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { ChipTone } from "@/lib/cricket/scoring";
import { chipText } from "./logic";

/** Chip colours: strong fills for boundaries and wickets, readable in sunlight. */
export const TONE: Record<ChipTone, string> = {
  dot: "bg-primary-100 text-primary-600",
  run: "bg-white text-primary-900 ring-1 ring-inset ring-primary-300",
  four: "bg-accent-500 text-white",
  six: "bg-primary-900 text-accent-300",
  wicket: "bg-red-600 text-white",
  extra: "bg-amber-300 text-amber-950",
};

const SPOKEN: Record<ChipTone, string> = { dot: "dot ball", run: "runs", four: "four", six: "six", wicket: "wicket", extra: "extra" };

export function BallChip({ chip, tone, size = "md", label }: { chip: string; tone: ChipTone; size?: "sm" | "md"; label?: string }) {
  const s = size === "sm" ? "min-w-7 h-7 text-[12px] px-1" : "min-w-9 h-9 text-[14px] px-1.5";
  return (
    <span role="img" title={label} aria-label={`${label ? `${label}: ` : ""}${chipText(chip)}${tone === "dot" || tone === "run" ? "" : `, ${SPOKEN[tone]}`}`} className={`inline-flex items-center justify-center rounded-full font-bold tabular-nums shrink-0 ${s} ${TONE[tone]}`}>
      {chipText(chip)}
    </span>
  );
}

/**
 * Bottom sheet on phones, centred card on desktop. Focus moves to the
 * sheet when it opens and back when it closes; Escape and the backdrop
 * close it when it can be closed.
 */
export function Sheet({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: ReactNode; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => setShown(true));
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[80] flex items-end lg:items-center justify-center">
      <div className={`absolute inset-0 bg-black/55 motion-safe:transition-opacity motion-safe:duration-200 ${shown ? "opacity-100" : "opacity-0"}`} onClick={() => onClose?.()} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={`relative w-full ${wide ? "lg:max-w-2xl" : "lg:max-w-lg"} max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-3xl lg:rounded-3xl bg-white shadow-elevated outline-none motion-safe:transition-transform motion-safe:duration-200 ${shown ? "translate-y-0" : "translate-y-6"}`}
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm px-4 pt-3 pb-2 flex items-start gap-3 border-b border-primary-100">
          <div className="min-w-0 flex-1">
            <span className="mx-auto mb-2 block h-1 w-10 rounded-full bg-primary-200 lg:hidden" aria-hidden />
            <h2 id={id} className="text-[18px] font-bold text-primary-900 leading-tight">
              {title}
            </h2>
            {subtitle && <div className="text-[13px] text-primary-500 mt-0.5">{subtitle}</div>}
          </div>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="mt-2 w-11 h-11 -mr-1 shrink-0 inline-flex items-center justify-center rounded-full text-primary-500 hover:bg-primary-100">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="px-4 pt-3">{children}</div>
      </div>
    </div>
  );
}

/** A big tappable choice in a sheet: name on top, a detail line under it. */
export function Pick({ onClick, label, detail, selected, muted, danger, disabled, className = "" }: { onClick: () => void; label: ReactNode; detail?: ReactNode; selected?: boolean; muted?: boolean; danger?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`press-tight min-h-14 w-full rounded-2xl border-2 px-3 py-2 text-left transition-colors disabled:opacity-40 ${
        selected ? "border-accent-600 bg-accent-50" : danger ? "border-red-200 bg-red-50 hover:border-red-400" : muted ? "border-primary-200 bg-primary-50 hover:border-primary-400" : "border-primary-200 bg-white hover:border-accent-500"
      } ${className}`}
    >
      <span className={`block text-[16px] font-bold leading-tight ${muted ? "text-primary-500" : danger ? "text-red-700" : "text-primary-900"}`}>{label}</span>
      {detail && <span className="block text-[12px] text-primary-500 mt-0.5 leading-snug">{detail}</span>}
    </button>
  );
}

/** Small segmented row of options inside sheets. */
export function Options<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`press-tight min-h-12 min-w-12 px-4 rounded-xl border-2 text-[15px] font-bold transition-colors ${value === o.value ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-800 hover:border-primary-400"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SheetLabel({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-bold uppercase tracking-wide text-primary-500 mb-2 mt-4 first:mt-0">{children}</p>;
}

/** Text box that selects its content on focus, so typing replaces a default name. */
export function NameInput({ value, onChange, placeholder, label, onEnter, id }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; onEnter?: () => void; id?: string }) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, 40))}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      autoCapitalize="words"
      enterKeyHint="done"
      maxLength={40}
      className="w-full h-12 px-3.5 rounded-xl bg-primary-50 border-2 border-primary-200 text-[16px] font-semibold text-primary-900 placeholder:text-primary-500 placeholder:font-normal focus:outline-none focus:border-accent-500 focus:bg-white"
    />
  );
}
