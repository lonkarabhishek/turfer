"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Stamp } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { answerPlayed } from "@/lib/queries/games";
import { PLAYED_COPY, taggedView, taggedWords, type TaggedGame } from "@/lib/games/played";
import { gamePath } from "@/lib/utils/gamePath";

/**
 * "You were tagged in these games. Did you play?" at the top of the
 * Passport (lib/games/played.ts): games that are over where a host tagged
 * this person and they never answered. "Yes, I played" makes them a
 * player of that game, so it counts in everything below from then on, on
 * the game's own day; "No, I didn't" takes them off its lineup. Each row
 * keeps what was answered until the tab is opened again; onChanged reads
 * the passport again so the numbers follow. Nothing when there is none.
 */
export function TaggedGames({ games, onChanged }: { games: readonly TaggedGame[]; onChanged: () => void }) {
  const { getToken } = useAuth();
  const [now] = useState(() => Date.now());
  // The list as it was when the card opened: a row stays, with its answer, after the passport is read again.
  const [list] = useState(() => [...games]);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, { text: string; done: boolean; ok: boolean }>>({});
  if (list.length === 0) return null;
  const { shown, more } = taggedView(list, all);

  const answer = async (g: TaggedGame, played: boolean) => {
    setBusy(g.gameId);
    const r = await answerPlayed(getToken, g.gameId, played);
    setBusy(null);
    setSaid((s) => ({ ...s, [g.gameId]: { text: r.text, done: r.done, ok: r.ok && played } }));
    if (r.done) onChanged();
  };

  return (
    <section aria-labelledby="pp-tagged" className="mb-8 rounded-2xl border border-accent-500/40 bg-accent-50 p-4">
      <h2 id="pp-tagged" className="flex items-start gap-2 text-[16px] font-bold leading-snug text-primary-900">
        <Stamp className="mt-0.5 w-5 h-5 shrink-0 text-accent-700" aria-hidden />
        {PLAYED_COPY.title}
      </h2>
      <p className="mt-1 text-[13px] leading-snug text-primary-700">{PLAYED_COPY.hint}</p>
      <ul id="pp-tagged-list" className="mt-3 space-y-2">
        {shown.map((g) => {
          const w = taggedWords(g, now);
          const a = said[g.gameId];
          return (
            <li key={g.gameId} className="rounded-xl border border-primary-200 bg-white p-3">
              <Link href={gamePath({ id: g.gameId })} className="block text-[15px] font-semibold text-primary-900 hover:underline underline-offset-2 [overflow-wrap:anywhere]">
                {w.title}
              </Link>
              <p className="mt-0.5 text-[13px] text-primary-600">
                {w.when} · {w.by}
              </p>
              {a?.done ? (
                <p role="status" className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold text-primary-900">
                  {a.ok && <Check className="w-4 h-4 text-accent-700" aria-hidden />}
                  {a.text}
                </p>
              ) : (
                <>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy === g.gameId}
                      onClick={() => answer(g, true)}
                      className="h-11 rounded-full bg-accent-600 hover:bg-accent-700 px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                    >
                      {PLAYED_COPY.yes}
                    </button>
                    <button
                      type="button"
                      disabled={busy === g.gameId}
                      onClick={() => answer(g, false)}
                      className="h-11 rounded-full border border-primary-300 bg-white px-4 text-[14px] font-semibold text-primary-900 hover:bg-primary-50 disabled:opacity-60"
                    >
                      {PLAYED_COPY.no}
                    </button>
                  </div>
                  {a && <p role="alert" className="mt-2 text-[13px] text-hot-600">{a.text}</p>}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {(more > 0 || all) && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          aria-controls="pp-tagged-list"
          className="mt-1 h-11 text-[14px] font-semibold text-accent-800 hover:underline underline-offset-2"
        >
          {all ? "Show fewer" : `Show ${more} more`}
        </button>
      )}
    </section>
  );
}
