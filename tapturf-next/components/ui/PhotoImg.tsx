"use client";

import { useCallback, useEffect, useRef } from "react";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  /** Called when the photo fails to load, including before hydration. */
  onBroken: () => void;
};

/**
 * Plain <img> for turf photos that reports a dead link however early it
 * died. React 19 starts listening for an image's error event only when
 * it hydrates the element and does not replay one that fired before, so
 * a Google link that answered 403 while the page was still loading (the
 * eager first card on /pune, a gallery's first photo, a home tile) never
 * reached onError and stayed a broken-image icon.
 *
 * On mount, a photo the browser reports as complete with no pixels is
 * either broken or (in some browsers) a lazy photo not fetched yet.
 * decode() tells them apart: it rejects for a photo that failed and
 * waits for one that hasn't loaded, so a lazy card further down is never
 * dropped by mistake. `onBroken` may run twice (this check and the
 * event); callers dedupe.
 */
export function PhotoImg({ onBroken, ...props }: Props) {
  // The ref callback stays the same across renders, so the check runs
  // once per element; the latest handler is read when it fires.
  const latest = useRef(onBroken);
  useEffect(() => {
    latest.current = onBroken;
  });
  const check = useCallback((img: HTMLImageElement | null) => {
    if (!img || !img.complete || img.naturalWidth > 0) return;
    const src = img.getAttribute("src");
    if (!src || typeof img.decode !== "function") return;
    img.decode().catch(() => {
      if (img.getAttribute("src") === src) latest.current();
    });
  }, []);
  return (
    /* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */
    <img referrerPolicy="no-referrer" {...props} ref={check} onError={onBroken} />
  );
}
