import type { ReactNode } from "react";
import type { MedalArt } from "./medals";
import { MEDAL_GLYPHS, MEDAL_GLYPH_AT, MEDAL_LOCK_AT, MEDAL_RIBBONS, MEDAL_SHAPES, MEDAL_SHINE, MEDAL_TONES, type GlyphStroke, type MedalOutline } from "./medalShapes";

/**
 * What goes inside a medal's <svg viewBox="0 0 80 80">: a rim and a face
 * in the medal's tone, a shine and its glyph; a locked one is grey with a
 * lock. The one drawing behind the site's medals
 * (components/profile/MedalArt.tsx) and the story picture's
 * (lib/og/medalStoryDesign.tsx), from lib/profile/medalShapes.ts.
 *
 * Plain SVG elements only, never a component: next/og turns an <svg> into
 * a picture by writing its elements out as text, and a component in there
 * would be written as nonsense. No ids, so any number can share a page.
 * Relative imports only.
 */

function outline(o: MedalOutline, fill: string, key: string): ReactNode {
  if ("circle" in o) return <circle key={key} cx="40" cy="40" r={o.circle} fill={fill} />;
  if ("points" in o) return <polygon key={key} points={o.points} fill={fill} />;
  return <path key={key} d={o.d} fill={fill} />;
}

function stroke(s: GlyphStroke, i: number): ReactNode {
  if ("d" in s) return <path key={i} d={s.d} />;
  if ("circle" in s) return <circle key={i} cx={s.circle[0]} cy={s.circle[1]} r={s.circle[2]} />;
  const [x, y, width, height, rx] = s.rect;
  return <rect key={i} x={x} y={y} width={width} height={height} rx={rx} />;
}

/** A glyph's strokes (a 24 x 24 box) drawn `at.size` wide at (at.x, at.y), round-ended. */
function glyph(strokes: readonly GlyphStroke[], at: { x: number; y: number; size: number; stroke: number }, color: string, key: string): ReactNode {
  return (
    <g key={key} transform={`translate(${at.x} ${at.y}) scale(${(at.size / 24).toFixed(4)})`} fill="none" stroke={color} strokeWidth={at.stroke} strokeLinecap="round" strokeLinejoin="round">
      {strokes.map(stroke)}
    </g>
  );
}

export function medalDrawing(art: MedalArt, locked = false): ReactNode[] {
  const [rim, face, ring, ink] = MEDAL_TONES[locked ? "locked" : art.tone];
  const shape = MEDAL_SHAPES[art.shape];
  const L = MEDAL_LOCK_AT;
  return [
    // Ribbon tails behind the rosettes.
    art.shape === "rosette" ? (
      <g key="ribbons" fill={rim} opacity={locked ? 1 : 0.9}>
        {MEDAL_RIBBONS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    ) : null,
    outline(shape.rim, rim, "rim"),
    outline(shape.face, face, "face"),
    shape.ring ? <circle key="ring" cx="40" cy="40" r={shape.ring} fill="none" stroke={ring} strokeWidth="1.5" opacity="0.8" /> : null,
    locked ? null : <path key="shine" d={MEDAL_SHINE} fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.35" />,
    glyph(MEDAL_GLYPHS[art.glyph], MEDAL_GLYPH_AT, ink, "glyph"),
    locked ? (
      <g key="lock">
        <circle cx={L.cx} cy={L.cy} r={L.outer} fill="#FFFFFF" />
        <circle cx={L.cx} cy={L.cy} r={L.inner} fill={L.fill} />
        {glyph(MEDAL_GLYPHS.lock, L, "#FFFFFF", "glyph")}
      </g>
    ) : null,
  ];
}
