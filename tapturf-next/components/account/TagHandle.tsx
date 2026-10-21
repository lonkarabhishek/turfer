import Link from "next/link";
import type { Tag } from "@/lib/account/tag";

/**
 * A tagged player's @username. A link to their profile where it is not
 * inside another button (the follower page); plain text in the scorer,
 * whose names are buttons.
 */
export function TagHandle({ tag, link, className = "" }: { tag: Tag; link?: boolean; className?: string }) {
  if (!link) return <span className={className}>@{tag.u}</span>;
  return (
    <Link href={`/u/${tag.u}`} className={`underline underline-offset-2 ${className}`} aria-label={`TapTurf profile @${tag.u}`}>
      @{tag.u}
    </Link>
  );
}
