"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { getCityPref } from "@/lib/city";
import type { GamePrefill } from "@/lib/ai/gameDraft";

const EXAMPLES = [
  "Box cricket Saturday 7pm at Hindu Gymkhana, 10 players, 150 each",
  "Football kal 8 baje Royal MultiSports, 14 log, 100 per head",
  "Badminton tomorrow morning 7, 4 players, beginners welcome",
];

/**
 * One line in, the wizard filled out. Sits above the sport grid on
 * step one. Also fires on its own when the page is opened with
 * ?draft=... (the Ask chat sends people here that way).
 */
export function GameDraftBox({ userId, initial, onPrefill }: { userId: string; initial?: string | null; onPrefill: (p: GamePrefill) => void }) {
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [example, setExample] = useState(0);
  const fired = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, []);

  const run = async (q: string) => {
    const v = q.trim();
    if (v.length < 4 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/games/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: v, city: getCityPref(), uid: userId }),
      });
      const data = (await r.json()) as GamePrefill & { error?: string };
      if (!r.ok) throw new Error(data.error || "Couldn't read that. Try again.");
      onPrefill(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Arrived with a sentence already: draft it once.
  useEffect(() => {
    if (initial && !fired.current) {
      fired.current = true;
      void run(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  return (
    <div className="mb-6 rounded-2xl border-2 border-primary-200 bg-white p-3.5">
      <p className="text-[11px] font-semibold text-primary-500 mb-2 inline-flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-accent-500" /> Or just describe it
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(text);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void run(text);
            }
          }}
          rows={2}
          maxLength={240}
          placeholder={EXAMPLES[example]}
          className="flex-1 resize-none rounded-xl bg-primary-50 px-3 py-2.5 text-[15px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white transition-colors"
          aria-label="Describe your game"
        />
        <button
          type="submit"
          disabled={busy || text.trim().length < 4}
          className="h-11 px-4 shrink-0 rounded-full bg-primary-900 text-white text-[13px] font-bold hover:bg-accent-600 disabled:opacity-40 disabled:hover:bg-primary-900 transition-colors cursor-pointer"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Fill it in"}
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-hot-600">{error}</p>}
    </div>
  );
}
