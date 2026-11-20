import type { CSSProperties, ReactNode } from "react";
import { badgeLabel, medalOf, type PlayerBadge } from "@/lib/profile/playerBadge";
import { MedalArt } from "./MedalArt";

/**
 * A player's best medal on the lower right of their picture, wherever
 * other players see them: a game's lineup and host card, the Me tab's
 * Played with (lib/profile/playerBadge.ts). The real medal art, small, on
 * a white disc so it reads on any photo. It sits over the picture's edge
 * and takes no room of its own, so a chip with a badge is as wide as one
 * without. It says its name ("Turf Veteran medal, 7 medals earned") to a
 * screen reader and as a tooltip. No badge, or a medal this build doesn't
 * know: the picture alone, exactly as before.
 *
 * `size` is the medal's own size in CSS pixels (14 to 20: about half of a
 * small picture, less of a big one).
 */
export function WithMedal({ badge, size = 16, children }: { badge: Pick<PlayerBadge, "medal" | "medals"> | null | undefined; size?: number; children: ReactNode }) {
  const medal = badge ? medalOf(badge.medal) : null;
  if (!badge || !medal) return <>{children}</>;
  const label = badgeLabel(badge);
  // The disc is a hair bigger than the medal. A third of it hangs past the picture's right edge and a fifth below it,
  // so it covers as little of a face (or of initials) as it can and still stays inside a 44 px chip.
  const disc = size + 2;
  const box: CSSProperties = { width: disc, height: disc, right: -Math.round(disc / 3), bottom: -Math.round(disc / 5) };
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span
        role="img"
        aria-label={label}
        title={label}
        data-medal-badge={medal.id}
        className="absolute grid place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.18)]"
        style={box}
      >
        <MedalArt art={medal.art} size={size} />
      </span>
    </span>
  );
}
