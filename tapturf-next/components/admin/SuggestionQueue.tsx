"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import type { PendingSuggestion, Proposed, SuggestionReview } from "@/lib/ai/suggestions";

type Row = PendingSuggestion;

const FIELD_LABEL: Record<string, string> = {
  owner_phone: "Call number",
  whatsapp_phone: "WhatsApp number",
  morning_price: "Morning rate",
  afternoon_price: "Afternoon rate",
  evening_price: "Evening rate",
  weekend_evening_price: "Weekend evening rate",
  opening_hours_daily: "Hours",
  sports_add: "Add sports",
  amenities_add: "Add facilities",
};

const VERDICT_STYLE: Record<SuggestionReview["verdict"], string> = {
  apply: "bg-accent-100 text-accent-800",
  check: "bg-amber-100 text-amber-800",
  reject: "bg-red-100 text-red-800",
};

function proposedEntries(p: Proposed): [keyof Proposed, string][] {
  const out: [keyof Proposed, string][] = [];
  for (const k of Object.keys(FIELD_LABEL) as (keyof Proposed)[]) {
    const v = p[k];
    if (v == null || (Array.isArray(v) && v.length === 0)) continue;
    out.push([k, Array.isArray(v) ? v.join(", ") : typeof v === "number" ? `₹${v}` : String(v)]);
  }
  return out;
}

function currentValue(s: Row, k: keyof Proposed): string {
  const c = s.current;
  switch (k) {
    case "owner_phone":
      return c.owner_phone ? "listed" : "none";
    case "whatsapp_phone":
      return c.whatsapp_phone ? "listed" : "none";
    case "morning_price":
    case "afternoon_price":
    case "evening_price":
    case "weekend_evening_price":
      return c[k] != null ? `₹${c[k]}` : "none";
    case "opening_hours_daily":
      return c.is_24x7 ? "Open 24 hours" : c.opening_hours ? JSON.stringify(c.opening_hours) : c.start_time && c.end_time ? `${c.start_time} – ${c.end_time}` : "none";
    case "sports_add":
      return c.sports.join(", ") || "none";
    case "amenities_add":
      return c.amenities.join(", ") || "none";
  }
}

/**
 * Admin moderation queue. Claude reviews each pending suggestion and
 * proposes exact column changes; the admin ticks what to apply and
 * approves, or rejects. Nothing changes on a turf until Approve.
 */
export function SuggestionQueue({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, setBusy] = useState<string | "review" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, Set<string>>>({});

  const unreviewed = useMemo(() => rows.filter((r) => !r.reviewed_at).length, [rows]);

  const review = async (ids?: string[]) => {
    setBusy("review");
    setError(null);
    try {
      for (;;) {
        const r = await fetch("/api/admin/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review", ids }) });
        const data = (await r.json()) as { results?: { id: string; ok: boolean; review?: SuggestionReview }[]; remaining?: number; error?: string };
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setRows((prev) =>
          prev.map((row) => {
            const hit = data.results?.find((x) => x.id === row.id && x.ok && x.review);
            return hit ? { ...row, ai_review: hit.review!, reviewed_at: new Date().toISOString() } : row;
          }),
        );
        if (ids || !data.results?.length || (data.remaining ?? 0) === 0) break;
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const moderate = async (row: Row, decision: "approve" | "reject") => {
    setBusy(row.id);
    setError(null);
    try {
      const p = row.ai_review?.proposed;
      const chosen = ticks[row.id] ?? new Set(p ? proposedEntries(p).map(([k]) => k) : []);
      const apply: Record<string, unknown> = {};
      if (decision === "approve" && p) {
        for (const k of chosen) {
          const v = p[k as keyof Proposed];
          if (v == null || (Array.isArray(v) && v.length === 0)) continue;
          if (k === "opening_hours_daily") apply.opening_hours = { daily: v };
          else apply[k] = v;
        }
      }
      const r = await fetch("/api/admin/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "moderate", id: row.id, decision, apply }) });
      const data = (await r.json()) as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setRows((prev) => prev.filter((x) => x.id !== row.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggle = (id: string, key: string, all: string[]) =>
    setTicks((prev) => {
      const cur = new Set(prev[id] ?? all);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...prev, [id]: cur };
    });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-[14px] text-primary-500">
          {rows.length} pending{unreviewed ? `, ${unreviewed} not yet checked by Claude` : ""}
        </p>
        <button
          type="button"
          onClick={() => void review()}
          disabled={busy !== null || unreviewed === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary-900 text-white text-xs font-bold px-4 py-2 hover:bg-primary-800 disabled:opacity-40"
        >
          {busy === "review" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Check all with Claude
        </button>
      </div>
      {error && <p className="mb-3 text-[13px] text-hot-600">{error}</p>}
      {rows.length === 0 && <p className="text-primary-500 text-sm">Nothing pending. Nice.</p>}

      <ul className="space-y-4">
        {rows.map((s) => {
          const r = s.ai_review;
          const entries = r ? proposedEntries(r.proposed) : [];
          const allKeys = entries.map(([k]) => k as string);
          const chosen = ticks[s.id] ?? new Set(allKeys);
          return (
            <li key={s.id} className="rounded-2xl bg-white border border-primary-200 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/turf/${s.turf_id}`} target="_blank" className="font-semibold text-primary-900 hover:text-accent-600">
                    {s.turf_name}
                  </Link>
                  <p className="text-[13px] text-primary-500">
                    {s.submitter_name || "Anonymous"} · {s.relationship}
                    {s.edit_count ? ` · edited ${s.edit_count}x` : ""} ·{" "}
                    {new Date(s.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
                  </p>
                </div>
                {r && (
                  <span className={`shrink-0 h-7 px-3 inline-flex items-center rounded-full text-[12px] font-bold uppercase tracking-wide ${VERDICT_STYLE[r.verdict]}`}>
                    {r.verdict} · {Math.round(r.confidence * 100)}%
                  </span>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
                {s.contact_phone && <Field k="Call" v={s.contact_phone} />}
                {s.whatsapp_phone && <Field k="WhatsApp" v={s.whatsapp_phone} />}
                {(s.price_min != null || s.price_max != null) && <Field k="Price" v={`₹${s.price_min ?? "?"} to ₹${s.price_max ?? "?"}`} />}
                {s.price_notes && <Field k="Price notes" v={s.price_notes} />}
                {s.opening_hours && <Field k="Hours" v={s.opening_hours} />}
                {s.sports.length > 0 && <Field k="Sports" v={s.sports.join(", ")} />}
                {s.amenities.length > 0 && <Field k="Facilities" v={s.amenities.join(", ")} />}
                {s.notes && <Field k="Notes" v={s.notes} wide />}
              </dl>

              {r ? (
                <div className="mt-4 rounded-xl bg-primary-50 p-4">
                  <p className="text-[14px] text-primary-900">{r.summary}</p>
                  {r.issues.length > 0 && (
                    <ul className="mt-2 text-[13px] text-amber-800 list-disc pl-5 space-y-0.5">
                      {r.issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  )}
                  {entries.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {entries.map(([k, v]) => (
                        <li key={k} className="flex items-start gap-2 text-[13px]">
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-accent-600"
                            checked={chosen.has(k)}
                            onChange={() => toggle(s.id, k, allKeys)}
                            id={`${s.id}-${k}`}
                          />
                          <label htmlFor={`${s.id}-${k}`} className="cursor-pointer">
                            <span className="font-medium text-primary-900">{FIELD_LABEL[k]}:</span> <span className="text-primary-900">{v}</span>
                            <span className="text-primary-400"> (now {currentValue(s, k)})</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] text-primary-500">Nothing to apply to the listing.</p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void review([s.id])}
                  disabled={busy !== null}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary-200 text-primary-800 text-xs font-bold px-3 py-1.5 hover:bg-primary-50 disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Check with Claude
                </button>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void moderate(s, "approve")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent-600 text-white text-xs font-bold px-4 py-2 hover:bg-accent-700 disabled:opacity-40"
                >
                  {busy === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {entries.length && chosen.size ? `Approve and apply ${chosen.size}` : "Approve (no changes)"}
                </button>
                <button
                  type="button"
                  onClick={() => void moderate(s, "reject")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary-200 text-primary-800 text-xs font-bold px-4 py-2 hover:bg-primary-50 disabled:opacity-40"
                >
                  <X className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Field({ k, v, wide = false }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="inline text-primary-500">{k}: </dt>
      <dd className="inline text-primary-900">{v}</dd>
    </div>
  );
}
