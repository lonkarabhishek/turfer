"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { reviewPhotoUrl } from "@/lib/reviews/photos";
import type { ReviewPhoto } from "@/lib/reviews/types";

/**
 * A report's photos full size, one at a time, over the page: opened by
 * tapping a thumbnail. The big file loads only now. Close (the X, Escape,
 * a tap on the dark around it) puts the focus back on the thumbnail;
 * arrows or the side buttons go through them.
 */
export function PhotoViewer({ photos, start, who, onClose }: { photos: ReviewPhoto[]; start: number; who: string; onClose: () => void }) {
  const [i, setI] = useState(Math.min(Math.max(0, start), photos.length - 1));
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = photos.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  // The latest onClose, so a parent's new function never re-runs the open below.
  const closeFn = useRef(onClose);
  useEffect(() => {
    closeFn.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeFn.current();
      } else if (e.key === "ArrowRight" && n > 1) go(1);
      else if (e.key === "ArrowLeft" && n > 1) go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      back?.focus?.({ preventScroll: true });
    };
  }, [go, n]);

  const p = photos[i];
  if (!p) return null;
  const btn = "press-tight w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center";
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Photos from ${who}'s game`} className="fixed inset-0 z-[80] flex flex-col bg-black animate-fade-in">
      <div className="flex items-center justify-between gap-3 px-4 pt-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <p className="text-[13px] text-white/80 tabular-nums" aria-live="polite">
          {n > 1 ? `${i + 1} of ${n}` : ""}
        </p>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close photos" className={btn}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 py-3" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={p.id}
          src={reviewPhotoUrl(p.path)}
          alt={`Photo ${i + 1} from ${who}'s game`}
          width={p.w}
          height={p.h}
          decoding="async"
          className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg bg-white/5"
          style={{ aspectRatio: `${p.w} / ${p.h}` }}
        />
        {n > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`}>
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`}>
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
