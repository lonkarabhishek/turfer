"use client";

import { useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";
import { useAsk } from "./AskProvider";

const EXAMPLES = ["Box cricket in Kothrud under ₹1,000", "Football games near me this weekend", "Hindu Gymkhana vs Vedant", "Does CC Turf Pardi have parking?"];

/**
 * Inline entry on the home page and /turfs. Typing here opens the
 * chat with the message already sent, so the landing page stays
 * clean and the conversation lives in one place.
 */
export function AskEntry({ compact = false }: { compact?: boolean }) {
  const { openPanel } = useAsk();
  const [q, setQ] = useState("");
  return (
    <section className={compact ? "mb-4" : "mt-7"} aria-label="Ask TapTurf">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) {
            openPanel(q);
            setQ("");
          }
        }}
        className="relative"
      >
        <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-accent-500" strokeWidth={2.25} />
        <label htmlFor="ask-entry" className="sr-only">
          Ask TapTurf
        </label>
        <input
          id="ask-entry"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            if (!q) openPanel();
          }}
          maxLength={160}
          enterKeyHint="send"
          autoComplete="off"
          placeholder="Ask for a turf, a game, or compare two"
          className="w-full h-12 pl-11 pr-14 rounded-full bg-white border border-primary-200 shadow-soft text-[16px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 transition-shadow"
        />
        <button
          type="submit"
          aria-label="Ask"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-full bg-primary-900 hover:bg-accent-600 text-white cursor-pointer transition-colors"
        >
          <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
        </button>
      </form>
      {!compact && (
        <div className="mt-2.5 flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => openPanel(ex)}
              className="shrink-0 h-8 px-3 rounded-full bg-primary-100 hover:bg-primary-200 text-[13px] text-primary-700 whitespace-nowrap cursor-pointer transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
