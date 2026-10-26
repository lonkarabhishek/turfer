"use client";

import { useState } from "react";
import { Clock, EyeOff, Loader2 } from "lucide-react";
import type { ReviewWithUser } from "@/types/review";
import type { Mine } from "./ReportSheet";
import { ReviewRow } from "./ReviewRow";

/**
 * The reviews: the viewer's own report first (with Edit and Remove, and a
 * chip if TapTurf hid it), then the other TapTurf reports, then Google's.
 */
export function ReviewList({
  reviews,
  mine,
  voted,
  hydrated,
  turfSports,
  onVote,
  onEdit,
  onRemove,
}: {
  reviews: ReviewWithUser[];
  mine: Mine | null;
  voted: Set<string>;
  hydrated: boolean;
  turfSports: readonly string[];
  onVote: (id: string) => void;
  onEdit: () => void;
  /** Resolves to whether it worked. */
  onRemove: () => Promise<boolean>;
}) {
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);
  const own = mine && mine.status !== "removed" ? mine : null;
  const others = reviews.filter((r) => r.id !== own?.id);
  if (!own && !others.length) return null;

  const remove = async () => {
    setRemoving(true);
    setFailed(false);
    const ok = await onRemove();
    setRemoving(false);
    setFailed(!ok);
    if (ok) setConfirm(false);
  };

  return (
    <ul className="mt-6 space-y-4">
      {own && (
        <li>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-primary-500">Your report</p>
          <ReviewRow
            r={{ ...own, booking_id: null, updated_at: null, source: null, viewer_has_upvoted: false }}
            turfSports={turfSports}
            hydrated={hydrated}
            mine
            footer={
              <div className="mt-3 border-t border-primary-100 pt-3">
                {own.status === "hidden" && (
                  <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 text-[12px] font-semibold text-primary-700">
                    <EyeOff className="w-3.5 h-3.5" aria-hidden /> Hidden by TapTurf for breaking the review rules
                  </p>
                )}
                {own.status === "held" && (
                  <p className="mb-2 text-[13px] text-primary-600">
                    <span className="mr-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-3 py-1 text-[12px] font-semibold text-primary-700">
                      <Clock className="w-3.5 h-3.5" aria-hidden /> Under review
                    </span>
                    Only you see it until it&apos;s checked.
                  </p>
                )}
                {!confirm ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={onEdit} className="press-tight min-h-11 px-4 rounded-full bg-primary-100 hover:bg-primary-200 text-[14px] font-semibold text-primary-900">
                      Edit
                    </button>
                    <button type="button" onClick={() => setConfirm(true)} className="press-tight min-h-11 px-4 rounded-full text-[14px] font-semibold text-primary-600 hover:text-hot-600">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div role="alertdialog" aria-labelledby="remove-title" className="rounded-xl bg-primary-50 p-3 report-chips-in">
                    <p id="remove-title" className="text-[15px] font-semibold text-primary-900">Remove your report?</p>
                    <p className="text-[13px] text-primary-600">It comes off the turf page. You can rate again later.</p>
                    {failed && <p className="mt-1 text-[13px] text-hot-600">Couldn&apos;t remove it just now. Try again in a minute.</p>}
                    <div className="mt-2.5 flex gap-2">
                      <button type="button" onClick={remove} disabled={removing} className="press-tight min-h-11 px-4 rounded-full bg-hot-600 text-white text-[14px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                        {removing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Remove
                      </button>
                      <button type="button" autoFocus onClick={() => setConfirm(false)} className="press-tight min-h-11 px-4 rounded-full bg-white border border-primary-200 text-[14px] font-semibold text-primary-900">
                        Keep it
                      </button>
                    </div>
                  </div>
                )}
              </div>
            }
          />
        </li>
      )}
      {others.map((r) => (
        <li key={r.id}>
          <ReviewRow r={r} turfSports={turfSports} hydrated={hydrated} voted={voted.has(r.id)} onVote={onVote} />
        </li>
      ))}
    </ul>
  );
}
