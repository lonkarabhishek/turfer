import { MedalArt } from "@/components/profile/MedalArt";
import { crownAngles, crownLabel, crownPoint } from "@/lib/profile/crown";
import type { MedalDef } from "@/lib/profile/medals";

/** The photo is 96 px; its white ring is 4 more. A medal's disc is DISC wide and its centre RADIUS from the photo's. */
const DISC = 34;
const ART = 28;
const RADIUS = 72;
/** The arc's box: wide enough for six, and as tall as the top one's reach above the photo's centre. */
const WIDTH = 2 * (RADIUS + DISC / 2) + 4;
const HEIGHT = RADIUS + DISC / 2 + 2;

/**
 * The player's best medals in an arc over their photo, on the Me card's
 * green band (lib/profile/crown.ts says which and where). One button, as
 * wide as the arc and as tall as the band, so the tap is never a 34 px
 * target: it opens the Passport's medals. Placed by its parent at the
 * photo's centre (it must sit inside the photo's `relative` box, drawn
 * before the photo so the photo's own button stays on top). Nothing for
 * someone with no medal.
 */
export function MedalCrown({ medals, onOpen }: { medals: readonly MedalDef[]; onOpen: () => void }) {
  if (medals.length === 0) return null;
  const angles = crownAngles(medals.length);
  const label = crownLabel(medals);
  return (
    <button
      type="button"
      data-medal-crown={medals.length}
      onClick={onOpen}
      aria-label={label}
      title={label}
      className="absolute left-1/2 bottom-1/2 -translate-x-1/2 rounded-t-full focus-neon"
      style={{ width: WIDTH, height: HEIGHT }}
    >
      {medals.map((m, i) => {
        const p = crownPoint(angles[i], RADIUS);
        return (
          <span
            key={m.id}
            aria-hidden
            className="absolute grid place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_6px_rgba(6,40,20,0.35)]"
            style={{ width: DISC, height: DISC, left: WIDTH / 2 + p.x - DISC / 2, bottom: p.y - DISC / 2 }}
          >
            <MedalArt art={m.art} size={ART} />
          </span>
        );
      })}
    </button>
  );
}
