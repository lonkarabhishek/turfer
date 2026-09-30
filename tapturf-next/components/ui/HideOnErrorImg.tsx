"use client";

import { useState } from "react";

/**
 * Plain <img> for external photos (Google, turf sites) that hides
 * itself if the link is dead, so the parent's background shows instead
 * of a broken-image box. Usable from server components.
 */
export function HideOnErrorImg(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    /* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */
    <img referrerPolicy="no-referrer" {...props} onError={() => setFailed(true)} />
  );
}
