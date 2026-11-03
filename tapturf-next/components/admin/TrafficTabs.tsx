"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Today, 7 days or 30 days for the Traffic section's lists: one row of
 * three buttons above them, the server's lists for each window below, one
 * shown at a time (`initial` first, also before the page has its
 * JavaScript: 7 days, or Today while the 7 days have nothing yet).
 */

export type TabWindow = "today" | "d7" | "d30";
const TABS: { id: TabWindow; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "d7", label: "7 days" },
  { id: "d30", label: "30 days" },
];

export function TrafficTabs({ panels, note, initial = "d7" }: { panels: Record<TabWindow, ReactNode>; note?: Record<TabWindow, string>; initial?: TabWindow }) {
  const [on, setOn] = useState<TabWindow>(initial);
  const id = useId();
  return (
    <div>
      <div role="tablist" aria-label="Which days" className="mb-3 grid grid-cols-3 gap-1 rounded-full bg-primary-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${id}-${t.id}-tab`}
            aria-selected={on === t.id}
            aria-controls={`${id}-${t.id}`}
            onClick={() => setOn(t.id)}
            className={`min-h-10 rounded-full text-[13px] font-semibold transition-colors focus-neon ${on === t.id ? "bg-white text-primary-900 shadow-sm" : "text-primary-600 hover:text-primary-900"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {note && <p className="-mt-1 mb-3 px-1 text-[12px] text-primary-500">{note[on]}</p>}
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`${id}-${t.id}`} aria-labelledby={`${id}-${t.id}-tab`} hidden={on !== t.id} className="space-y-4">
          {panels[t.id]}
        </div>
      ))}
    </div>
  );
}
