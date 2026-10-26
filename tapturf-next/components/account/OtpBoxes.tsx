"use client";

import { useEffect, useRef } from "react";

/**
 * Six boxes for an SMS code: type, paste (all six at once) or let the
 * phone fill it in from the message. value keeps each box in place (a
 * space for an empty one); onComplete runs once all six are in.
 * 6 x 44 px plus gaps fits a 390 px screen with room to spare.
 */
export function OtpBoxes({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = true,
  label = "The 6-digit code",
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete: (code: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const cells = Array.from({ length: 6 }, (_, i) => (/\d/.test(value[i] ?? "") ? value[i] : ""));

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  // Back from a check or a send (the boxes were disabled, so focus left them) with the boxes
  // empty, after a wrong code say: the cursor is in the first box again. It also keeps a focused
  // field on the page, so PWALifecycle doesn't reload it while the person reads the SMS.
  const wasDisabled = useRef(disabled);
  useEffect(() => {
    if (wasDisabled.current && !disabled && autoFocus && !/\d/.test(value)) refs.current[0]?.focus();
    wasDisabled.current = disabled;
  }, [disabled, autoFocus, value]);

  const emit = (next: string[]) => {
    onChange(next.map((c) => c || " ").join("").replace(/\s+$/, ""));
    if (next.every((c) => /^\d$/.test(c))) onComplete(next.join(""));
  };

  /** Digits typed, pasted or filled in from box i on. */
  const put = (i: number, digits: string) => {
    const from = digits.length >= 6 ? 0 : i;
    const next = cells.slice();
    for (let k = 0; k < digits.length && from + k < 6; k++) next[from + k] = digits[k];
    emit(next);
    refs.current[Math.min(5, from + digits.length)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2" role="group" aria-label={label}>
      {cells.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          value={d}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) {
              const next = cells.slice();
              next[i] = "";
              return emit(next);
            }
            // One new digit replaces the box; more than one is a paste or the phone's autofill.
            put(i, v.length === 2 && d ? v.replace(d, "") || v.slice(-1) : v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !cells[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (!pasted) return;
            e.preventDefault();
            put(i, pasted);
          }}
          className={`w-11 h-12 text-center font-mono text-lg font-bold bg-white border-2 rounded-lg text-primary-800 focus:outline-none focus:ring-2 focus:ring-accent-500/20 transition-all disabled:opacity-60 ${
            d ? "border-accent-500 bg-accent-50" : "border-primary-200 focus:border-accent-500"
          }`}
        />
      ))}
    </div>
  );
}
