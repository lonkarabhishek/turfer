"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Play, Square } from "lucide-react";

export type BatchProgress = { total: number; reviewed: number; flagged: number; configured?: boolean };
/** One processed row: what to show in the list under the bar. */
export type BatchRow = { id: string; name: string; line: string; image?: string | null; href?: string; tone?: "ok" | "warn" };

/**
 * Admin: run one of the AI passes (covers, listing checks, review
 * summaries). One click processes rows in small batches until the
 * endpoint says it is done. Stop any time; the next run picks up where
 * it left off. GET on the endpoint returns progress, POST runs a batch.
 */
export function BatchTool({
  title,
  icon,
  blurb,
  endpoint,
  unit = "turfs",
  flaggedLabel,
  limit = 4,
  link,
}: {
  title: string;
  icon: ReactNode;
  blurb: string;
  endpoint: string;
  unit?: string;
  /** Label for the flagged count, e.g. "photos hidden". Hidden when absent. */
  flaggedLabel?: string;
  limit?: number;
  /** Where the results live, e.g. the Listing checks view. */
  link?: { href: string; label: string };
}) {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const refresh = async () => {
    try {
      const r = await fetch(endpoint);
      if (r.ok) setProgress((await r.json()) as BatchProgress);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const run = async () => {
    setRunning(true);
    setError(null);
    stopRef.current = false;
    try {
      for (;;) {
        if (stopRef.current) break;
        const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit }) });
        const data = (await r.json()) as { results?: BatchRow[]; progress?: BatchProgress; error?: string };
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setRows((prev) => [...(data.results ?? []), ...prev].slice(0, 40));
        if (data.progress) setProgress((p) => ({ ...(p ?? { total: 0, reviewed: 0, flagged: 0 }), ...data.progress }));
        const done = (data.progress?.reviewed ?? 0) >= (data.progress?.total ?? 1);
        if (!data.results?.length || done) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      void refresh();
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.reviewed / progress.total) * 100) : 0;
  const remaining = progress ? Math.max(0, progress.total - progress.reviewed) : null;

  return (
    <div className="rounded-2xl bg-white border border-primary-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-primary-900 inline-flex items-center gap-2">
            {icon} {title}
          </h3>
          <p className="text-[13px] text-primary-500 mt-1">
            {blurb}
            {link && (
              <>
                {" "}
                <Link href={link.href} className="text-accent-700 font-semibold hover:underline">
                  {link.label}
                </Link>
              </>
            )}
          </p>
        </div>
        {running ? (
          <button
            type="button"
            onClick={() => {
              stopRef.current = true;
            }}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-primary-200 text-primary-800 text-xs font-bold px-4 py-2 hover:bg-primary-50"
          >
            <Square className="w-3.5 h-3.5" /> Stop after this batch
          </button>
        ) : (
          <button
            type="button"
            onClick={run}
            disabled={progress?.configured === false || remaining === 0}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary-900 text-white text-xs font-bold px-4 py-2 hover:bg-primary-800 disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" /> {remaining === 0 ? "All done" : remaining != null && remaining < (progress?.total ?? 0) ? "Continue" : "Run"}
          </button>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[12px] text-primary-500 mb-1.5">
          <span>
            {progress ? `${progress.reviewed} of ${progress.total} ${unit} done` : "Loading"}
            {flaggedLabel && progress && progress.flagged > 0 ? ` · ${progress.flagged} ${flaggedLabel}` : ""}
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-primary-100 overflow-hidden">
          <div className="h-full bg-accent-500 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        {progress?.configured === false && <p className="mt-2 text-[13px] text-hot-600">ANTHROPIC_API_KEY is not set on the server.</p>}
        {error && <p className="mt-2 text-[13px] text-hot-600">{error}</p>}
        {running && (
          <p className="mt-2 text-[13px] text-primary-500 inline-flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Working through the next batch
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-primary-100">
          {rows.map((r) => (
            <li key={r.id} className="py-2 flex items-center gap-3">
              {r.image !== undefined &&
                (r.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt="" className="w-14 h-10 rounded-md object-cover bg-primary-100" referrerPolicy="no-referrer" loading="lazy" />
                ) : (
                  <div className="w-14 h-10 rounded-md bg-primary-100" />
                ))}
              <div className="min-w-0 flex-1">
                <a href={r.href ?? `/turf/${r.id}`} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-primary-900 hover:text-accent-600 truncate block">
                  {r.name}
                </a>
                <p className={`text-[12px] ${r.tone === "warn" ? "text-amber-700" : "text-primary-500"}`}>{r.line}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
