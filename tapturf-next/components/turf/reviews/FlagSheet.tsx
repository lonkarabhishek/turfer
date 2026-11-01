"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import { flagReview } from "@/lib/reviews/client";
import { FLAG_DETAIL_MAX, FLAG_REASONS, flagAnswerText, type FlagReason } from "@/lib/reviews/flags";
import type { FlagResponse } from "@/lib/reviews/types";
import type { TokenCheck } from "@/lib/account/client";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";

/**
 * "Report this review": why (a short list), an optional line, Send. The
 * review stays up while TapTurf looks, and its author is never told who
 * reported it. The X, Escape and a tap outside close it.
 */
export function FlagSheet({
  reviewId,
  author,
  getToken,
  onClose,
  onSent,
}: {
  reviewId: string;
  author: string;
  getToken: () => Promise<TokenCheck>;
  onClose: () => void;
  /** It went (or was in already): the card says Reported. */
  onSent: (id: string) => void;
}) {
  const [reason, setReason] = useState<FlagReason | null>(null);
  const [detail, setDetail] = useState("");
  const [sending, setSending] = useState(false);
  const [answer, setAnswer] = useState<{ ok: boolean; text: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeFn = useRef(onClose);
  useEffect(() => {
    closeFn.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeFn.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const send = async () => {
    if (!reason || sending) return;
    setSending(true);
    setAnswer(null);
    const t = await getToken();
    if (!("token" in t)) {
      setSending(false);
      setAnswer({ ok: false, text: flagAnswerText({ ok: false, error: "sign_in" }) });
      return;
    }
    const a = await flagReview(t.token, reviewId, reason, detail.trim() || null);
    setSending(false);
    const b = a.body as FlagResponse;
    if ("r" in b && b.r === "ok") {
      setAnswer({ ok: true, text: flagAnswerText({ ok: true, already: b.already }) });
      onSent(reviewId);
      return;
    }
    const e = "error" in b ? b : { error: "unavailable", reason: undefined };
    setAnswer({ ok: false, text: flagAnswerText({ ok: false, error: a.status === 0 ? null : e.error, reason: e.reason }) });
  };

  const sheet = (
    <ViewportOverlay className="z-[75] flex items-end sm:items-center justify-center" data-modal-open="true">
      <div className="fixed inset-0 bg-primary-900/40 animate-fade-in" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flag-title"
        tabIndex={-1}
        className="relative w-full sm:max-w-md max-h-[calc(var(--vv-h,100dvh)*0.9)] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-elevated animate-slide-up overflow-hidden outline-none"
      >
        <div className="flex items-start gap-3 px-5 pt-4">
          <div className="min-w-0 flex-1">
            <h2 id="flag-title" className="text-[19px] font-bold text-primary-900 leading-tight">
              Report this review
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-primary-500">By {author}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="press-tight -mr-2 -mt-1 w-11 h-11 rounded-full flex items-center justify-center text-primary-500 hover:bg-primary-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 pt-3" style={{ paddingBottom: "max(1rem, var(--safe-b, env(safe-area-inset-bottom)))" }}>
          {answer?.ok ? (
            <div className="pb-2">
              <p role="status" className="flex items-start gap-2 rounded-xl bg-accent-50 px-4 py-3 text-[14px] text-accent-800">
                <Check className="mt-0.5 w-4 h-4 shrink-0" aria-hidden /> {answer.text}
              </p>
              <button type="button" onClick={onClose} className="press-tight mt-4 w-full min-h-12 rounded-full bg-primary-900 text-white text-[16px] font-semibold">
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-[13px] text-primary-600">What&apos;s wrong with it? TapTurf looks at every report. The review stays up while we do, and its author isn&apos;t told who reported it.</p>
              <div role="radiogroup" aria-label="Why" className="mt-3 space-y-2">
                {FLAG_REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={reason === r.id}
                    onClick={() => setReason(r.id)}
                    className={`press-tight w-full min-h-12 rounded-xl border px-4 text-left text-[15px] font-medium transition-colors ${
                      reason === r.id ? "border-primary-900 bg-primary-900 text-white" : "border-primary-200 bg-white text-primary-900 hover:border-primary-400"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <label htmlFor="flag-detail" className="mt-4 block text-[14px] font-semibold text-primary-900">
                Anything to add? <span className="font-normal text-primary-500">Optional</span>
              </label>
              <textarea
                id="flag-detail"
                rows={2}
                value={detail}
                maxLength={FLAG_DETAIL_MAX}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Only TapTurf sees this."
                className="mt-1.5 w-full resize-none rounded-xl bg-primary-100 px-4 py-3 text-[16px] leading-6 text-primary-900 placeholder:text-primary-500 focus:outline-none focus:ring-2 focus:ring-accent-500/40"
              />
              {detail.length >= FLAG_DETAIL_MAX - 50 && (
                <p className="text-right text-[12px] tabular-nums text-primary-500">
                  {detail.length}/{FLAG_DETAIL_MAX}
                </p>
              )}
              {answer && (
                <p role="alert" className="mt-2 rounded-xl bg-hot-500/10 px-4 py-3 text-[14px] text-hot-600">
                  {answer.text}
                </p>
              )}
              <button
                type="button"
                onClick={() => void send()}
                disabled={!reason || sending}
                className="press-tight mt-4 w-full min-h-12 rounded-full bg-primary-900 hover:bg-primary-700 text-white text-[16px] font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                {sending ? "Sending…" : "Send report"}
              </button>
            </>
          )}
        </div>
      </div>
    </ViewportOverlay>
  );
  return createPortal(sheet, document.body);
}
