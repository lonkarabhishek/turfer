"use client";

import { useEffect, useMemo, useRef } from "react";
import { X, Clock } from "lucide-react";

/**
 * 30-minute-only start-time picker. Replaces <input type="time">
 * because iOS Safari's native wheel ignores `step` and lets users
 * scroll to 8:23. This sheet only offers :00 and :30 slots so the
 * value on-screen is exactly what the user picked.
 *
 * Slots run 06:00 → 23:30 (36 slots). Selected slot is centered in
 * view on open.
 */

const START_HOUR = 6;
const END_HOUR = 23; // last slot: 23:30
const SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

function fmt(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = h % 12 || 12;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function TimeSlotSheet({
  open,
  value,
  onSelect,
  onClose,
}: {
  open: boolean;
  value: string;
  onSelect: (hhmm: string) => void;
  onClose: () => void;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Center the selected slot when the sheet opens
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      selectedRef.current?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    }, 40);
    return () => clearTimeout(t);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Split into rough day parts so it doesn't feel like a wall of numbers
  const groups = useMemo(() => {
    return [
      { label: "Morning", slots: SLOTS.filter((s) => {
        const h = parseInt(s, 10);
        return h < 12;
      }) },
      { label: "Afternoon", slots: SLOTS.filter((s) => {
        const h = parseInt(s, 10);
        return h >= 12 && h < 17;
      }) },
      { label: "Evening", slots: SLOTS.filter((s) => {
        const h = parseInt(s, 10);
        return h >= 17 && h < 21;
      }) },
      { label: "Night", slots: SLOTS.filter((s) => {
        const h = parseInt(s, 10);
        return h >= 21;
      }) },
    ];
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
      data-modal-open="true"
    >
      <div className="absolute inset-0 bg-primary-800/50 animate-fade-in" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-elevated animate-slide-up flex flex-col max-h-[85vh]">
        {/* Grabber */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 bg-primary-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-primary-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center shadow-neon shrink-0">
              <Clock className="w-4 h-4 text-white" strokeWidth={2.5} />
            </span>
            <div>
              <p className="text-[15px] font-bold text-primary-800 leading-none">Pick a start time</p>
              <p className="text-[11px] font-mono uppercase tracking-widest text-primary-500 mt-0.5">
                30-min slots only
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary-100 transition-colors"
          >
            <X className="w-4 h-4 text-primary-500" />
          </button>
        </div>

        {/* Slots */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {groups.map(({ label, slots }) => (
            <section key={label} className="mb-4 last:mb-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-500 mb-2 px-1">
                {label}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => {
                  const selected = slot === value;
                  return (
                    <button
                      key={slot}
                      ref={selected ? selectedRef : undefined}
                      onClick={() => { onSelect(slot); onClose(); }}
                      className={`py-3 rounded-xl text-[14px] font-bold font-mono tabular text-center transition-all active:scale-[0.97] focus-neon ${
                        selected
                          ? "bg-accent-500 text-white shadow-neon"
                          : "bg-white border border-primary-200 text-primary-800 hover:border-accent-400"
                      }`}
                    >
                      {fmt(slot)}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* iOS safe area */}
        <div className="sm:hidden h-[env(safe-area-inset-bottom)] bg-white shrink-0" />
      </div>
    </div>
  );
}
