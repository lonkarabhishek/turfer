import { Binoculars, CalendarCheck, Compass, Crown, Flag, Flame, Footprints, Lock, MapPin, Megaphone, PenLine, Plane, Star, Target, Trophy, Users, Volleyball, type LucideIcon } from "lucide-react";
import type { MedalArt as Art, MedalGlyph } from "@/lib/profile/medals";

/**
 * A medal, drawn in code: a rim and a face in the medal's tone, a shine,
 * and its glyph. Locked ones are grey with a lock. Decorative: the medal's
 * name is always written next to it. No ids, so any number can share a page.
 */

const GLYPHS: Record<MedalGlyph, LucideIcon> = {
  flag: Flag,
  ball: Volleyball,
  boot: Footprints,
  trophy: Trophy,
  crown: Crown,
  megaphone: Megaphone,
  people: Users,
  pin: MapPin,
  compass: Compass,
  plane: Plane,
  target: Target,
  pen: PenLine,
  binoculars: Binoculars,
  star: Star,
  flame: Flame,
  calendar: CalendarCheck,
};

// rim, face, inner ring, glyph
const TONES: Record<Art["tone"] | "locked", [string, string, string, string]> = {
  bronze: ["#8F5428", "#C27D45", "#E3AE80", "#FFFFFF"],
  silver: ["#5F6B79", "#A5AFBB", "#D9DFE6", "#26313D"],
  gold: ["#9A6C05", "#E0B12C", "#F8DE84", "#4A3300"],
  teal: ["#0E6E66", "#149C8E", "#62D9C8", "#FFFFFF"],
  coral: ["#A61E36", "#EC4D67", "#FFA3B2", "#FFFFFF"],
  violet: ["#53309F", "#8565EA", "#C8BBFC", "#FFFFFF"],
  sky: ["#0A6396", "#2797D0", "#97D3F3", "#FFFFFF"],
  locked: ["#D1D5DB", "#E9EBEE", "#F5F6F7", "#9CA3AF"],
};

// A scalloped rim: 24 points between two radii.
const ROSETTE = Array.from({ length: 24 }, (_, i) => {
  const a = (Math.PI * 2 * i) / 24 - Math.PI / 2;
  const r = i % 2 ? 29 : 33;
  return `${(40 + r * Math.cos(a)).toFixed(2)},${(40 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

const hex = (r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(40 + r * Math.cos(a)).toFixed(2)},${(40 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

function Rim({ shape, fill }: { shape: Art["shape"]; fill: string }) {
  if (shape === "shield") return <path d="M40 6 L67 15 V38 C67 55 55 67 40 74 C25 67 13 55 13 38 V15 Z" fill={fill} />;
  if (shape === "hex") return <polygon points={hex(33)} fill={fill} />;
  if (shape === "rosette") return <polygon points={ROSETTE} fill={fill} />;
  return <circle cx="40" cy="40" r="32" fill={fill} />;
}

function Face({ shape, fill }: { shape: Art["shape"]; fill: string }) {
  if (shape === "shield") return <path d="M40 12 L61 19 V38 C61 51 52 61 40 67 C28 61 19 51 19 38 V19 Z" fill={fill} />;
  if (shape === "hex") return <polygon points={hex(27)} fill={fill} />;
  return <circle cx="40" cy="40" r={shape === "rosette" ? 24 : 26} fill={fill} />;
}

export function MedalArt({ art, locked = false, size = 64, className = "" }: { art: Art; locked?: boolean; size?: number; className?: string }) {
  const [rim, face, ring, ink] = TONES[locked ? "locked" : art.tone];
  const Glyph = GLYPHS[art.glyph];
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className={`shrink-0 ${className}`} aria-hidden focusable="false">
      {/* Ribbon tails behind the rosettes. */}
      {art.shape === "rosette" && (
        <g fill={rim}>
          <path d="M27 58 L19 78 L27 74 L31 80 L37 62 Z" opacity={locked ? 1 : 0.9} />
          <path d="M53 58 L61 78 L53 74 L49 80 L43 62 Z" opacity={locked ? 1 : 0.9} />
        </g>
      )}
      <Rim shape={art.shape} fill={rim} />
      <Face shape={art.shape} fill={face} />
      {art.shape !== "shield" && art.shape !== "hex" && <circle cx="40" cy="40" r={art.shape === "rosette" ? 20.5 : 22} fill="none" stroke={ring} strokeWidth="1.5" opacity="0.8" />}
      {/* The shine. */}
      {!locked && <path d="M22 30 A20 20 0 0 1 46 18" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.35" />}
      <Glyph x={27} y={27} width={26} height={26} color={ink} strokeWidth={2.25} />
      {locked && (
        <g>
          <circle cx="62" cy="62" r="11" fill="#FFFFFF" />
          <circle cx="62" cy="62" r="9" fill="#6E6E73" />
          <Lock x={56.5} y={56.5} width={11} height={11} color="#FFFFFF" strokeWidth={2.75} />
        </g>
      )}
    </svg>
  );
}
