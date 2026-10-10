"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { AskDigest as Digest } from "@/lib/ai/digest";

export type DigestRecord = { days: number; rows_seen: number; digest: Digest; created_at: string };

/**
 * Admin: the "where we fell short" summary of Ask chats. Shows the
 * cached digest for the window and a button to make a fresh one.
 */
export function AskDigestCard({ initial, days, configured }: { initial: DigestRecord | null; days: number; configured: boolean }) {
  const [rec, setRec] = useState<DigestRecord | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/asks/digest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days }) });
      const data = (await r.json()) as DigestRecord & { error?: string };
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setRec(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const made = rec ? new Date(rec.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null;

  return (
    <div className="rounded-2xl bg-white border border-primary-200 p-5 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-primary-900 inline-flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent-600" /> Where we fell short
          </h3>
          <p className="text-[13px] text-primary-500 mt-1">
            Claude groups the chats we could not serve in the last {days} days into themes, with examples and one action each.
            {made ? ` Last made ${made}, from ${rec!.rows_seen} messages.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={make}
          disabled={busy || !configured}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary-900 text-white text-xs font-bold px-4 py-2 hover:bg-primary-800 disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {rec ? "Make a fresh one" : "Summarise"}
        </button>
      </div>
      {!configured && <p className="mt-2 text-[13px] text-hot-600">ANTHROPIC_API_KEY is not set on the server.</p>}
      {error && <p className="mt-2 text-[13px] text-hot-600">{error}</p>}

      {rec && (
        <div className="mt-4">
          <p className="text-[15px] text-primary-900 font-medium">{rec.digest.headline}</p>
          <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {rec.digest.themes.map((t, i) => (
              <li key={i} className="rounded-xl border border-primary-200 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-primary-900 text-[14px]">{t.title}</p>
                  <span className="text-[12px] text-primary-500 tabular-nums shrink-0">{t.count} msg{t.count === 1 ? "" : "s"}</span>
                </div>
                <p className="text-[13px] text-primary-700 mt-1">{t.wanted}</p>
                {t.examples.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {t.examples.map((e, j) => (
                      <li key={j} className="text-[12px] text-primary-600 italic">&ldquo;{e}&rdquo;</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[13px] text-accent-800 bg-accent-50 rounded-lg px-2.5 py-1.5">
                  <span className="font-semibold">Do:</span> {t.action}
                </p>
              </li>
            ))}
          </ul>
          {rec.digest.wins.length > 0 && (
            <p className="mt-3 text-[13px] text-primary-600">
              <span className="font-semibold text-primary-800">Working well:</span> {rec.digest.wins.join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
