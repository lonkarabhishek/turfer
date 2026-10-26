"use client";

import { useCallback, useState } from "react";
import { PhotoImg } from "./PhotoImg";

/**
 * Plain <img> for external photos (Google, turf sites) that hides
 * itself if the link is dead, so the parent's background shows instead
 * of a broken-image box. Usable from server components. Catches a link
 * that died before hydration too (see PhotoImg).
 */
export function HideOnErrorImg(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  const onBroken = useCallback(() => setFailed(true), []);
  if (failed) return null;
  return <PhotoImg {...props} onBroken={onBroken} />;
}
