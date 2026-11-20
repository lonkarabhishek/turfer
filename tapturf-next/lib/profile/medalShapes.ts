import type { MedalArt, MedalGlyph } from "./medals";

/**
 * A medal's drawing as data, in an 80 x 80 box: its tones, the outline of
 * each shape (rim and face), the rosette's ribbon tails, the shine, and
 * each glyph's strokes in a 24 x 24 box. One copy for the site
 * (components/profile/MedalArt.tsx) and for the story picture
 * (lib/og/medalStoryDesign.tsx), both through lib/profile/medalDrawing.tsx,
 * so a medal looks the same wherever it is drawn. Pure data, relative
 * imports only (npm run test:profile).
 *
 * The glyphs' outlines are Lucide's (lucide.dev, as lucide-react 0.574
 * draws them), kept here as plain numbers because next/og draws only
 * plain SVG elements, never a React component inside an <svg>.
 * Lucide is ISC licensed: Copyright (c) for portions of Lucide are held by
 * Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c)
 * for Lucide are held by Lucide Contributors 2026. Permission to use,
 * copy, modify, and/or distribute this software for any purpose with or
 * without fee is hereby granted, provided that the above copyright notice
 * and this permission notice appear in all copies.
 */

export type MedalTone = MedalArt["tone"] | "locked";

/** rim, face, inner ring, glyph. */
export const MEDAL_TONES: Record<MedalTone, readonly [rim: string, face: string, ring: string, ink: string]> = {
  bronze: ["#8F5428", "#C27D45", "#E3AE80", "#FFFFFF"],
  silver: ["#5F6B79", "#A5AFBB", "#D9DFE6", "#26313D"],
  gold: ["#9A6C05", "#E0B12C", "#F8DE84", "#4A3300"],
  teal: ["#0E6E66", "#149C8E", "#62D9C8", "#FFFFFF"],
  coral: ["#A61E36", "#EC4D67", "#FFA3B2", "#FFFFFF"],
  violet: ["#53309F", "#8565EA", "#C8BBFC", "#FFFFFF"],
  sky: ["#0A6396", "#2797D0", "#97D3F3", "#FFFFFF"],
  locked: ["#D1D5DB", "#E9EBEE", "#F5F6F7", "#9CA3AF"],
};

/** The medal's box, and its centre. */
export const MEDAL_BOX = 80;
const C = MEDAL_BOX / 2;

const around = (n: number, start: number, r: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n + start;
    return `${(C + r(i) * Math.cos(a)).toFixed(2)},${(C + r(i) * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

/** Six corners, one up. */
const hex = (r: number) => around(6, -Math.PI / 2, () => r);

/** A filled outline: a circle, a polygon's points or a path. */
export type MedalOutline = { circle: number } | { points: string } | { d: string };

/** Each shape's rim and face, and the radius of the thin ring on a round face (none on a shield or a hex). */
export const MEDAL_SHAPES: Record<MedalArt["shape"], { rim: MedalOutline; face: MedalOutline; ring: number | null }> = {
  round: { rim: { circle: 32 }, face: { circle: 26 }, ring: 22 },
  shield: {
    rim: { d: "M40 6 L67 15 V38 C67 55 55 67 40 74 C25 67 13 55 13 38 V15 Z" },
    face: { d: "M40 12 L61 19 V38 C61 51 52 61 40 67 C28 61 19 51 19 38 V19 Z" },
    ring: null,
  },
  hex: { rim: { points: hex(33) }, face: { points: hex(27) }, ring: null },
  // A scalloped rim: 24 points between two radii.
  rosette: { rim: { points: around(24, -Math.PI / 2, (i) => (i % 2 ? 29 : 33)) }, face: { circle: 24 }, ring: 20.5 },
};

/** The ribbon tails behind a rosette. */
export const MEDAL_RIBBONS: readonly string[] = ["M27 58 L19 78 L27 74 L31 80 L37 62 Z", "M53 58 L61 78 L53 74 L49 80 L43 62 Z"];

/** The shine: an arc across the top left. */
export const MEDAL_SHINE = "M22 30 A20 20 0 0 1 46 18";

/** Where the glyph goes (its 24 x 24 box, drawn 26 wide at 27, 27) and how thick its strokes are, in its own units. */
export const MEDAL_GLYPH_AT = { x: 27, y: 27, size: 26, stroke: 2.25 } as const;

/** A locked medal's badge: a white disc, a grey one on it, and the lock (11 wide at 56.5, 56.5, strokes 2.75). */
export const MEDAL_LOCK_AT = { cx: 62, cy: 62, outer: 11, inner: 9, fill: "#6E6E73", x: 56.5, y: 56.5, size: 11, stroke: 2.75 } as const;

/** One stroke of a glyph, in a 24 x 24 box: a path, a circle (cx, cy, r) or a rounded rectangle (x, y, width, height, corner). */
export type GlyphStroke = { d: string } | { circle: readonly [number, number, number] } | { rect: readonly [number, number, number, number, number] };

export const MEDAL_GLYPHS: Record<MedalGlyph | "lock", readonly GlyphStroke[]> = {
  // lucide: flag
  flag: [
    { d: "M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" },
  ],
  // lucide: volleyball
  ball: [
    { d: "M11.1 7.1a16.55 16.55 0 0 1 10.9 4" },
    { d: "M12 12a12.6 12.6 0 0 1-8.7 5" },
    { d: "M16.8 13.6a16.55 16.55 0 0 1-9 7.5" },
    { d: "M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10" },
    { d: "M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5" },
    { circle: [12, 12, 10] },
  ],
  // lucide: footprints
  boot: [
    { d: "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" },
    { d: "M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" },
    { d: "M16 17h4" },
    { d: "M4 13h4" },
  ],
  // lucide: trophy
  trophy: [
    { d: "M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978" },
    { d: "M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978" },
    { d: "M18 9h1.5a1 1 0 0 0 0-5H18" },
    { d: "M4 22h16" },
    { d: "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" },
    { d: "M6 9H4.5a1 1 0 0 1 0-5H6" },
  ],
  // lucide: crown
  crown: [
    { d: "M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" },
    { d: "M5 21h14" },
  ],
  // lucide: megaphone
  megaphone: [
    { d: "M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" },
    { d: "M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14" },
    { d: "M8 6v8" },
  ],
  // lucide: users
  people: [
    { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" },
    { d: "M16 3.128a4 4 0 0 1 0 7.744" },
    { d: "M22 21v-2a4 4 0 0 0-3-3.87" },
    { circle: [9, 7, 4] },
  ],
  // lucide: map-pin
  pin: [
    { d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" },
    { circle: [12, 10, 3] },
  ],
  // lucide: compass
  compass: [
    { circle: [12, 12, 10] },
    { d: "m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" },
  ],
  // lucide: plane
  plane: [
    { d: "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" },
  ],
  // lucide: target
  target: [
    { circle: [12, 12, 10] },
    { circle: [12, 12, 6] },
    { circle: [12, 12, 2] },
  ],
  // lucide: pen-line
  pen: [
    { d: "M13 21h8" },
    { d: "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" },
  ],
  // lucide: binoculars
  binoculars: [
    { d: "M10 10h4" },
    { d: "M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3" },
    { d: "M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z" },
    { d: "M 22 16 L 2 16" },
    { d: "M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z" },
    { d: "M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3" },
  ],
  // lucide: star
  star: [
    { d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" },
  ],
  // lucide: flame
  flame: [
    { d: "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" },
  ],
  // lucide: calendar-check
  calendar: [
    { d: "M8 2v4" },
    { d: "M16 2v4" },
    { rect: [3, 4, 18, 18, 2] },
    { d: "M3 10h18" },
    { d: "m9 16 2 2 4-4" },
  ],
  // The tool medals' glyphs.
  // lucide: tally-5
  tally: [
    { d: "M4 4v16" },
    { d: "M9 4v16" },
    { d: "M14 4v16" },
    { d: "M19 4v16" },
    { d: "M22 6 2 18" },
  ],
  // lucide: tv
  tv: [
    { d: "m17 2-5 5-5-5" },
    { rect: [2, 7, 20, 15, 2] },
  ],
  // lucide: file-text
  sheet: [
    { d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" },
    { d: "M14 2v5a1 1 0 0 0 1 1h5" },
    { d: "M10 9H8" },
    { d: "M16 13H8" },
    { d: "M16 17H8" },
  ],
  // lucide: newspaper
  newspaper: [
    { d: "M15 18h-5" },
    { d: "M18 14h-8" },
    { d: "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2" },
    { rect: [10, 6, 8, 4, 1] },
  ],
  // lucide: coins
  coins: [
    { d: "M13.744 17.736a6 6 0 1 1-7.48-7.48" },
    { d: "M15 6h1v4" },
    { d: "m6.134 14.768.866-.5 2 3.464" },
    { circle: [16, 8, 6] },
  ],
  // lucide: clover
  clover: [
    { d: "M16.17 7.83 2 22" },
    { d: "M4.02 12a2.827 2.827 0 1 1 3.81-4.17A2.827 2.827 0 1 1 12 4.02a2.827 2.827 0 1 1 4.17 3.81A2.827 2.827 0 1 1 19.98 12a2.827 2.827 0 1 1-3.81 4.17A2.827 2.827 0 1 1 12 19.98a2.827 2.827 0 1 1-4.17-3.81A1 1 0 1 1 4 12" },
    { d: "m7.83 7.83 8.34 8.34" },
  ],
  // lucide: clipboard-list
  clipboard: [
    { rect: [8, 2, 8, 4, 1] },
    { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" },
    { d: "M12 11h4" },
    { d: "M12 16h4" },
    { d: "M8 11h.01" },
    { d: "M8 16h.01" },
  ],
  // lucide: chart-no-axes-column (the tallest in the middle: a podium)
  podium: [
    { d: "M5 21v-6" },
    { d: "M12 21V3" },
    { d: "M19 21V9" },
  ],
  // lucide: radio
  radio: [
    { d: "M16.247 7.761a6 6 0 0 1 0 8.478" },
    { d: "M19.075 4.933a10 10 0 0 1 0 14.134" },
    { d: "M4.925 19.067a10 10 0 0 1 0-14.134" },
    { d: "M7.753 16.239a6 6 0 0 1 0-8.478" },
    { circle: [12, 12, 2] },
  ],
  // lucide: backpack
  bag: [
    { d: "M4 10a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" },
    { d: "M8 10h8" },
    { d: "M8 18h8" },
    { d: "M8 22v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6" },
    { d: "M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" },
  ],
  // lucide: shirt
  shirt: [
    { d: "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" },
  ],
  // lucide: lock
  lock: [
    { rect: [3, 11, 18, 11, 2] },
    { d: "M7 11V7a5 5 0 0 1 10 0v4" },
  ],
};

/** "#rrggbb" `t` of the way from `a` to `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** "#rrggbb" as an rgba() of that strength. */
export function hexAlpha(hex: string, a: number): string {
  const ch = (i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${a})`;
}

/**
 * A medal's tone as the colours a page can dress in (the public profile's
 * hero is keyed to its top medal): the medal's own rim, face and ring; a
 * soft and a softer tint of the face for backgrounds on white; `text`, the
 * rim darkened until small print in it reads on either tint (4.5:1 or
 * more, checked by the tests); and `glow`, the face see-through, for a
 * shadow.
 */
export type MedalLook = { rim: string; face: string; ring: string; soft: string; wash: string; text: string; glow: string };

export function medalLook(tone: MedalArt["tone"]): MedalLook {
  const [rim, face, ring] = MEDAL_TONES[tone];
  return { rim, face, ring, soft: mixHex("#FFFFFF", face, 0.16), wash: mixHex("#FFFFFF", face, 0.08), text: mixHex(rim, "#000000", 0.3), glow: hexAlpha(face, 0.45) };
}
