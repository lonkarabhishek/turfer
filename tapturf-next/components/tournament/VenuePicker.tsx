"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { cityInfo } from "@/lib/city";
import type { Venue } from "@/lib/tournament/types";

type Hit = { id: string; slug: string | null; name: string; area: string | null; city: string | null };

/**
 * The tournament's ground, picked from TapTurf's turfs by name (the
 * listing's own search, GET /api/turfs/list?q=), so its page links to the
 * turf. Optional; none picked is fine.
 */
export function VenuePicker({ value, onChange }: { value: Venue | null; onChange: (v: Venue | null) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(() => {
      setBusy(true);
      fetch(`/api/turfs/list?q=${encodeURIComponent(term)}&limit=6`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { items?: { turf?: Record<string, unknown> }[] } | null) => {
          if (n !== seq.current) return;
          const s = (x: unknown) => (typeof x === "string" && x ? x : null);
          setHits(
            (j?.items ?? [])
              .map((i) => i.turf ?? {})
              .filter((t) => typeof t.id === "string" && typeof t.name === "string")
              .map((t) => ({ id: t.id as string, slug: s(t.slug), name: t.name as string, area: s(t.area), city: s(t.city) ? cityInfo(t.city as string).label : null })),
          );
        })
        .catch(() => n === seq.current && setHits([]))
        .finally(() => n === seq.current && setBusy(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-accent-500/40 bg-accent-50 px-3 py-2.5">
        <MapPin className="w-4 h-4 text-accent-700 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-primary-900 truncate">{value.name}</span>
          {value.area && <span className="block text-[12px] text-primary-500 truncate">{value.area}</span>}
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label="Remove the venue" className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-full text-primary-500 hover:bg-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const term = q.trim();
  return (
    <div>
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 60))}
          placeholder="Search TapTurf turfs by name"
          aria-label="Search for the venue"
          autoComplete="off"
          className="w-full h-12 pl-10 pr-10 rounded-xl bg-primary-50 border border-primary-200 text-[16px] text-primary-900 placeholder:text-primary-300 focus:outline-none focus:ring-2 focus:ring-accent-500/40 focus:bg-white"
        />
        {busy && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400 motion-safe:animate-spin" aria-hidden />}
      </div>
      {term.length >= 2 && hits && (
        <ul className="mt-2 rounded-xl border border-primary-200 divide-y divide-primary-100 overflow-hidden bg-white" aria-label="Turfs found">
          {hits.length === 0 && !busy && <li className="px-3 py-3 text-[14px] text-primary-500">No turf by that name on TapTurf yet.</li>}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ id: h.id, slug: h.slug, name: h.name.slice(0, 80), area: [h.area, h.city].filter(Boolean).join(", ").slice(0, 60) || null });
                  setQ("");
                  setHits(null);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-primary-50 flex items-center gap-3 min-h-[48px]"
              >
                <MapPin className="w-4 h-4 text-primary-400 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-primary-900 truncate">{h.name}</span>
                  <span className="block text-[12px] text-primary-500 truncate">{[h.area, h.city].filter(Boolean).join(", ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
