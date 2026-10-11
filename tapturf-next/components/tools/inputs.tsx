"use client";

import type { ReactNode } from "react";

/**
 * Small form pieces shared by the cricket tools. Big tap targets,
 * numeric keyboards on phones, 16px text so iOS does not zoom.
 */

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-primary-800 mb-1.5">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-[12px] text-red-600">{error}</p> : hint ? <p className="mt-1 text-[12px] text-primary-400">{hint}</p> : null}
    </div>
  );
}

const base = "w-full h-12 px-3.5 rounded-xl bg-primary-50 border text-[16px] text-primary-900 placeholder:text-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white transition-colors";

export function NumberInput({ id, value, onChange, placeholder, min = 0, max = 2000, invalid, ariaLabel }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; min?: number; max?: number; invalid?: boolean; ariaLabel?: string }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min={min}
      max={max}
      step={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={`${base} ${invalid ? "border-red-400" : "border-primary-200"}`}
    />
  );
}

/** Overs in cricket notation; decimal keyboard, one digit after the point. */
export function OversInput({ id, value, onChange, placeholder, invalid, ariaLabel }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; invalid?: boolean; ariaLabel?: string }) {
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, "").slice(0, 6))}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={`${base} ${invalid ? "border-red-400" : "border-primary-200"}`}
    />
  );
}

export function TextInput({ id, value, onChange, placeholder, maxLength = 40, ariaLabel }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number; ariaLabel?: string }) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      autoComplete="off"
      className={`${base} border-primary-200`}
    />
  );
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex w-full rounded-xl bg-primary-100 p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 h-10 rounded-lg text-[14px] font-semibold transition-colors ${value === o.value ? "bg-white text-primary-900 shadow-soft" : "text-primary-600 hover:text-primary-900"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SecondaryButton({ onClick, children, className = "", disabled }: { onClick: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press-tight inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-full border border-primary-200 bg-white text-[14px] font-semibold text-primary-800 hover:border-accent-400 hover:text-accent-700 disabled:opacity-40 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({ onClick, children, className = "", disabled, type = "button" }: { onClick?: () => void; children: ReactNode; className?: string; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`press-tight inline-flex items-center justify-center gap-1.5 h-12 px-6 rounded-full bg-accent-500 text-white text-[15px] font-bold hover:bg-accent-600 disabled:opacity-40 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}
