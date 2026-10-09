"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Play, Square } from "lucide-react";

type Progress = { total: number; reviewed: number; flagged: number; configured?: boolean };
type Row = { id: string; name: string; cover: string | null; changed: boolean; flagged: number; broken: number };

/**
 * Admin: run the AI cover-photo pass. One click processes turfs in
 * small batches until every active turf with photos has been
 * reviewed. Stop any time; the next run picks up where it left off.
 */
export function CoverPhotoTool() {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const refresh = async () => {
    try {
      const r = await fetch("/api/admin/covers");
      if (r.ok) setProgress((await r.json()) as Progress);
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    stopRef.current = false;
    try {
      for (;;) {
        if (stopRef.current) break;
        const r = await fetch("/api/admin/covers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 4 }) });
        const data = (await r.json()) as { results?: Row[]; progress?: Progress; error?: string };
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
            <ImageIcon className="w-4 h-4 text-accent-600" /> Cover photos by Claude
          </h3>
          <p className="text-[13px] text-primary-500 mt-1">
            Picks the photo that best shows the ground for each turf and hides logos, screenshots and blur. Haiku 5.5, about half a paisa per photo.
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
            <Play className="w-3.5 h-3.5" /> {remaining === 0 ? "All reviewed" : remaining != null && remaining < (progress?.total ?? 0) ? "Continue" : "Run"}
          </button>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[12px] text-primary-500 mb-1.5">
          <span>
            {progress ? `${progress.reviewed} of ${progress.total} turfs reviewed` : "Loading"}
            {progress && progress.flagged > 0 ? ` · ${progress.flagged} photos hidden` : ""}
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
              {r.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.cover} alt="" className="w-14 h-10 rounded-md object-cover bg-primary-100" referrerPolicy="no-referrer" loading="lazy" />
              ) : (
                <div className="w-14 h-10 rounded-md bg-primary-100" />
              )}
              <div className="min-w-0 flex-1">
                <a href={`/turf/${r.id}`} target="_blank" rel="noreferrer" className="text-[14px] font-medium text-primary-900 hover:text-accent-600 truncate block">
                  {r.name}
                </a>
                <p className="text-[12px] text-primary-500">
                  {r.cover ? (r.changed ? "New cover" : "Cover kept") : "No usable photo"}
                  {r.flagged ? ` · ${r.flagged} hidden` : ""}
                  {r.broken ? ` · ${r.broken} dead link${r.broken === 1 ? "" : "s"}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
