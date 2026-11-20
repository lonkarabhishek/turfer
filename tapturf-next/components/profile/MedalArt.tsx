import type { MedalArt as Art } from "@/lib/profile/medals";
import { medalDrawing } from "@/lib/profile/medalDrawing";

/**
 * A medal, drawn in code: a rim and a face in the medal's tone, a shine,
 * and its glyph. Locked ones are grey with a lock. Decorative: the medal's
 * name is always written next to it. No ids, so any number can share a page.
 * The drawing itself is lib/profile/medalDrawing.tsx, which the story
 * picture (GET /api/og/medals/<username>) draws from too.
 */
export function MedalArt({ art, locked = false, size = 64, className = "" }: { art: Art; locked?: boolean; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden focusable="false">
      {medalDrawing(art, locked)}
    </svg>
  );
}
