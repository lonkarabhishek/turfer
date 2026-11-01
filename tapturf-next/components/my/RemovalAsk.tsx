"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { ownerRpc } from "@/lib/my/client";
import { askErrorText, ownerRemovalLine, parseRemovalAsk, REMOVAL_DETAIL_MAX, REMOVAL_REASONS, toOwnerRemovals, type OwnerRemoval, type RemovalReason } from "@/lib/reviews/removal";
import { Pill } from "@/components/turf/reviews/ui";

/**
 * This owner's requests to take a report on the turf off (owner_review_removals,
 * 20261101_reviews_policy.sql). undefined while it loads; null when there is no
 * answer (a database from before requests, or a sign-in without a claim of its
 * own here, like the site owner's): then nothing offers to ask.
 */
export function useOwnerRemovals(turfId: string) {
  const [removals, setRemovals] = useState<Map<string, OwnerRemoval> | null | undefined>(undefined);
  const load = useCallback(async () => {
    try {
      setRemovals(toOwnerRemovals(await ownerRpc<unknown>("owner_review_removals", { p_turf_id: turfId })));
    } catch {
      setRemovals(null);
    }
  }, [turfId]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  const mark = useCallback((reviewId: string, r: OwnerRemoval) => setRemovals((m) => (m ? new Map(m).set(reviewId, r) : m)), []);
  return { removals, mark };
}

/**
 * Under one of the latest reports on /my: "Ask TapTurf to remove", a reason from
 * the short list and an optional line. TapTurf decides; the report stays up
 * meanwhile, and the player is never told who asked.
 */
export function RemovalAsk({ reviewId, existing, onAsked }: { reviewId: string; existing: OwnerRemoval | undefined; onAsked: (r: OwnerRemoval) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RemovalReason | null>(null);
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (existing && existing.status !== "kept" && !open) {
    return <p className="mt-2 text-[12px] font-medium text-primary-600">{ownerRemovalLine(existing.status)}</p>;
  }

  const send = async () => {
    const p = parseRemovalAsk(reason, detail);
    if ("bad" in p) return setError(askErrorText("bad"));
    setSending(true);
    setError(null);
    let r: { ok?: boolean; error?: string } | null = null;
    try {
      r = await ownerRpc<{ ok?: boolean; error?: string }>("owner_review_removal_ask", { p_review_id: reviewId, p_reason: p.ok.reason, p_detail: p.ok.detail });
    } catch {
      r = null;
    }
    setSending(false);
    if (r?.ok) {
      setOpen(false);
      onAsked({ status: "open", reason: p.ok.reason, at: new Date().toISOString() });
      return;
    }
    setError(askErrorText(r?.error));
  };

  if (!open) {
    return (
      <div className="mt-2">
        {existing?.status === "kept" && <p className="text-[12px] font-medium text-primary-600">{ownerRemovalLine("kept")}</p>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press-tight -ml-1 mt-0.5 min-h-9 px-1 inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-600 hover:text-primary-900"
        >
          <Flag className="w-3.5 h-3.5" aria-hidden /> {existing?.status === "kept" ? "Ask again" : "Ask TapTurf to remove"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50 p-3">
      <fieldset>
        <legend className="text-[14px] font-semibold text-primary-900">Why should TapTurf remove it?</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REMOVAL_REASONS.map((x) => (
            <Pill key={x.id} on={reason === x.id} onClick={() => setReason(reason === x.id ? null : x.id)} className="px-3.5 text-[13px] min-h-10">
              {x.label}
            </Pill>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block text-[13px] font-medium text-primary-700">
        Anything TapTurf should know? <span className="font-normal text-primary-500">(optional)</span>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={REMOVAL_DETAIL_MAX}
          rows={2}
          className="mt-1 block w-full rounded-xl border border-primary-200 bg-white px-3 py-2 text-[14px] text-primary-900 placeholder:text-primary-400 focus:outline-none focus:border-primary-500"
          placeholder="For example: no game on that day in our register"
        />
      </label>
      <p className="mt-2 text-[12px] text-primary-500">
        TapTurf checks it against the rules. The report stays up meanwhile, the player is never told who asked, and a report isn&apos;t removed for being negative.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-hot-600">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void send()}
          disabled={!reason || sending}
          className="press-tight min-h-10 px-4 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[13px] font-semibold disabled:opacity-40 inline-flex items-center gap-1.5"
        >
          {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
          Send to TapTurf
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="press-tight min-h-10 px-4 rounded-full bg-white border border-primary-200 text-primary-900 text-[13px] font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
