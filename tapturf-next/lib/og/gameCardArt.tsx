import type { ReactNode } from "react";
import type { GameCardArt } from "./gameCard";

/**
 * The share card's drawings (lib/og/gameCardDesigns.tsx lays them out):
 * each sport's pitch or court seen from above, its ball, and the two signs
 * the bundled font lacks (a rupee sign, a tick). All inline SVG that
 * next/og rasterises itself: no font, no emoji, no picture is fetched.
 */

/** The pitch or court from above, in a 600 x 380 box (to scale along its length), lines only. */
function fieldLines(art: GameCardArt, c: string): ReactNode {
  switch (art) {
    case "football":
      return (
        <g>
          <rect x="6" y="6" width="588" height="368" />
          <path d="M300 6V374M6 80h92v220H6M594 80h-92v220h92M6 140h31v100H6M594 140h-31v100h31" />
          <path d="M98 151A50 50 0 0 1 98 229M502 151A50 50 0 0 0 502 229M6 18A12 12 0 0 0 18 6M582 6A12 12 0 0 0 594 18M594 362A12 12 0 0 0 582 374M18 374A12 12 0 0 0 6 362" />
          <circle cx="300" cy="190" r="50" />
          <circle cx="300" cy="190" r="5" fill={c} />
          <circle cx="67" cy="190" r="4" fill={c} />
          <circle cx="533" cy="190" r="4" fill={c} />
        </g>
      );
    case "cricket":
      return (
        <g>
          <ellipse cx="300" cy="190" rx="292" ry="182" />
          <ellipse cx="300" cy="190" rx="178" ry="112" strokeDasharray="4 14" strokeLinecap="round" />
          <rect x="236" y="170" width="128" height="40" fill={c} fillOpacity="0.22" />
          <path d="M256 158V222M344 158V222" />
          {[183, 190, 197].map((y) => (
            <g key={y} fill={c} stroke="none">
              <circle cx="243" cy={y} r="3.2" />
              <circle cx="357" cy={y} r="3.2" />
            </g>
          ))}
        </g>
      );
    case "badminton":
      return (
        <g>
          <rect x="6" y="56" width="588" height="268" />
          <path d="M6 76H594M6 304H594M39 56V324M561 56V324M213 56V324M387 56V324M6 190H213M387 190H594" />
          <path d="M300 40V340" strokeDasharray="7 7" />
        </g>
      );
    case "tennis":
      return (
        <g>
          <rect x="6" y="54" width="588" height="272" />
          <path d="M6 88H594M6 292H594M142 88V292M458 88V292M142 190H458M6 190h12M594 190h-12" />
          <path d="M300 38V342" strokeDasharray="7 7" />
        </g>
      );
    case "pickleball":
      return (
        <g>
          <rect x="207" y="56" width="186" height="268" fill={c} fillOpacity="0.2" stroke="none" />
          <rect x="6" y="56" width="588" height="268" />
          <path d="M207 56V324M393 56V324M6 190H207M393 190H594" />
          <path d="M300 40V340" strokeDasharray="7 7" />
        </g>
      );
    case "volleyball":
      return (
        <g>
          <rect x="6" y="43" width="588" height="294" />
          <path d="M202 43V337M398 43V337" />
          <path d="M300 27V353" strokeDasharray="7 7" />
        </g>
      );
    case "basketball":
      return (
        <g>
          <rect x="6" y="32" width="588" height="316" />
          <path d="M300 32V348M6 138h122v104H6M594 138h-122v104h122M128 152A38 38 0 0 1 128 228M472 152A38 38 0 0 0 472 228" />
          <path d="M6 51H68A142 142 0 0 1 68 329H6M594 51H532A142 142 0 0 0 532 329H594M31 176V204M569 176V204" />
          <circle cx="300" cy="190" r="38" />
          <circle cx="40" cy="190" r="7" />
          <circle cx="560" cy="190" r="7" />
        </g>
      );
    default:
      return (
        <g>
          {[55, 153, 251, 349, 447].map((x) => (
            <rect key={x} x={x} y="6" width="49" height="368" fill={c} fillOpacity="0.14" stroke="none" />
          ))}
          <rect x="6" y="6" width="588" height="368" rx="14" />
          <path d="M300 6V374" />
          <circle cx="300" cy="190" r="50" />
        </g>
      );
  }
}

/**
 * The sport's pitch or court, `width` px wide (its box is 600 x 380), drawn in `color`; `upright` stands it on its
 * end (380 x 600). Faint lines are a solid colour mixed by the caller, not an opacity: a see-through picture costs
 * the renderer a layer of its own.
 */
export function Field({ art, width, color, stroke = 3, upright = false }: { art: GameCardArt; width: number; color: string; stroke?: number; upright?: boolean }) {
  const [vw, vh] = upright ? [380, 600] : [600, 380];
  return (
    <svg width={width} height={Math.round((width * vh) / vw)} viewBox={`0 0 ${vw} ${vh}`}>
      <g
        // Always a real transform: next/og writes an absent one out as "undefined", and the lines vanish.
        transform={upright ? "translate(380 0) rotate(90)" : "translate(0 0)"}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinejoin="round"
      >
        {fieldLines(art, color)}
      </g>
    </svg>
  );
}

const pt = (r: number, deg: number) => `${(50 + r * Math.cos((deg * Math.PI) / 180)).toFixed(1)} ${(50 + r * Math.sin((deg * Math.PI) / 180)).toFixed(1)}`;

/** The sport's ball in a 100 x 100 box, or null for a sport with none drawn (plain turf). `ink`: its outline and markings. */
function ballShapes(art: GameCardArt, ink: string): ReactNode {
  switch (art) {
    case "football": {
      const spokes = [-90, -18, 54, 126, 198];
      return (
        <g>
          <circle cx="50" cy="50" r="46" fill="#FFFFFF" stroke={ink} strokeWidth="4" />
          <path d={`M${spokes.map((a) => pt(17, a)).join("L")}Z`} fill={ink} />
          {spokes.map((a) => (
            <g key={a}>
              <path d={`M${pt(17, a)}L${pt(33, a)}`} stroke={ink} strokeWidth="3.5" />
              <path d={`M${pt(33, a)}L${pt(46, a - 21)}A46 46 0 0 1 ${pt(46, a + 21)}Z`} fill={ink} />
            </g>
          ))}
        </g>
      );
    }
    case "cricket":
      return (
        <g>
          <circle cx="50" cy="50" r="46" fill="#D92D20" stroke={ink} strokeWidth="4" />
          <path d="M33 9C44 34 44 66 33 91M53 5C64 34 64 66 53 95" fill="none" stroke="#FFFFFF" strokeWidth="2.6" />
          <path d="M43 7C54 34 54 66 43 93" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeDasharray="2.2 5" />
        </g>
      );
    case "badminton":
      return (
        <g transform="rotate(32 50 50)">
          <path d="M37 70L16 12H84L63 70Z" fill="#FFFFFF" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
          <path d="M44 70L36 12M50 70V12M56 70L64 12M29 48H71M23 30H77" fill="none" stroke={ink} strokeWidth="2.6" />
          <path d="M36 70H64V78A14 14 0 0 1 36 78Z" fill="#FFFFFF" stroke={ink} strokeWidth="4" strokeLinejoin="round" />
        </g>
      );
    case "tennis":
      return (
        <g>
          <circle cx="50" cy="50" r="46" fill="#D7F23A" stroke={ink} strokeWidth="4" />
          <path d="M13 24C38 38 38 62 13 76M87 24C62 38 62 62 87 76" fill="none" stroke="#FFFFFF" strokeWidth="5" />
        </g>
      );
    case "pickleball":
      return (
        <g>
          <circle cx="50" cy="50" r="46" fill="#FACC15" stroke={ink} strokeWidth="4" />
          {[
            [50, 50], [50, 24], [50, 76], [27, 37], [73, 37], [27, 63], [73, 63],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="6.5" fill={ink} fillOpacity="0.78" />
          ))}
        </g>
      );
    case "volleyball":
      return (
        <g>
          <circle cx="50" cy="50" r="46" fill="#FFFFFF" stroke={ink} strokeWidth="4" />
          <path d="M50 50C50 30 62 14 78 13M50 50C67 60 75 78 68 92M50 50C33 60 13 58 5 44M30 9C44 18 50 32 50 50M94 60C80 62 62 60 50 50M22 86C24 70 36 56 50 50" fill="none" stroke={ink} strokeWidth="3.2" />
        </g>
      );
    case "basketball":
      return (
        <g>
          <circle cx="50" cy="50" r="46" fill="#F97316" stroke={ink} strokeWidth="4" />
          <path d="M50 4V96M4 50H96M18 17C36 32 36 68 18 83M82 17C64 32 64 68 82 83" fill="none" stroke={ink} strokeWidth="3.2" />
        </g>
      );
    default:
      return null;
  }
}

/** Whether the sport has a ball drawn (plain turf has none). */
export const hasBall = (art: GameCardArt) => art !== "turf";

/** The sport's ball (a shuttle for badminton), `size` px; nothing for plain turf. */
export function Ball({ art, size, ink = "#052E16" }: { art: GameCardArt; size: number; ink?: string }) {
  const shapes = ballShapes(art, ink);
  if (!shapes) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {shapes}
    </svg>
  );
}

/** A rupee sign as tall as a capital at `size` px type (the bundled font has none), in `color`. */
export function Rupee({ size, color, weight = 1 }: { size: number; color: string; weight?: number }) {
  const h = Math.round(size * 0.72);
  return (
    <svg width={Math.round(h * 0.68)} height={h} viewBox="0 0 68 100" style={{ marginRight: Math.round(size * 0.04) }}>
      <path d="M8 8H62M8 32H62M8 8H28A24 24 0 0 1 28 56H8L46 96" fill="none" stroke={color} strokeWidth={10 * weight} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A tick in a filled circle, `size` px across (the bundled font has no tick). */
export function Tick({ size, color, ink }: { size: number; color: string; ink: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill={color} />
      <path d="M27 52L43 68L74 34" fill="none" stroke={ink} strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
