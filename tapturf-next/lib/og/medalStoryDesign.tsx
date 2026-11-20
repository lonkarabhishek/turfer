import type { ReactNode } from "react";
import { ImageResponse } from "next/og";
import { medalDrawing } from "../profile/medalDrawing";
import type { MedalArt } from "../profile/medals";
import { MEDAL_GLYPHS, MEDAL_TONES } from "../profile/medalShapes";
import { fitSize, textEm } from "./gameCard";
import { HEAVY, NIGHT, SEMI, T, bands, mix, spread } from "./gameCardDesigns";
import { MEDAL_STORY_SIZE, STORY_SAFE, storyRows, type MedalStoryFacts, type StoryMedal } from "./medalStory";

/**
 * A player's medals as an Instagram story, 1080 x 1920: the night turf of
 * the game's share card (design a, lib/og/gameCardDesigns.tsx) stood on
 * its end. From the top: who it is (initials on the top medal's colour,
 * the name, the username), their best medal large in its own glow with
 * its name and what it was for, the brag line and the best streak, the
 * other earned medals as a grid with their names ("+N more" when there
 * are more than it holds), and at the foot the profile's address as text
 * with "Earn yours on TapTurf". What it says is lib/og/medalStory.ts's.
 *
 * - The medals are the site's own drawing (lib/profile/medalDrawing.tsx).
 * - Nothing third-party, as the game card: text only in the font next/og
 *   bundles (the facts are drawable already), the app icon handed in as a
 *   data URL, no photo. Bold is a stroke; every text has a size that fits
 *   its box.
 * - Instagram covers the top and the foot of a story with its own
 *   controls (STORY_SAFE): only turf and pitch lines are drawn there.
 * - Relative imports only, so a script can draw it without the app.
 */

const { width: W, height: H } = MEDAL_STORY_SIZE;
const PAD = 72;
const COL = W - 2 * PAD;

/** "#rrggbb" as an rgba() of that strength. */
function rgba(hex: string, a: number): string {
  const ch = (i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${a})`;
}

function Medal({ art, size }: { art: MedalArt; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      {medalDrawing(art)}
    </svg>
  );
}

/** A four-point sparkle, `size` px, centred at (x, y) in its parent. */
function Sparkle({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" style={{ position: "absolute", left: Math.round(x - size / 2), top: Math.round(y - size / 2) }}>
      <path d="M0 -10 Q0 0 10 0 Q0 0 0 10 Q0 0 -10 0 Q0 0 0 -10 Z" fill={color} />
    </svg>
  );
}

/** The pitch from above, as faint lines: a penalty box at each end (under Instagram's controls) and the corners. */
function Pitch() {
  const end = (key: string, transform?: string): ReactNode => (
    <g key={key} {...(transform ? { transform } : null)}>
      <path d="M250 44 V190 H830 V44 M410 44 V100 H670 V44" />
      <path d="M465 190 A90 90 0 0 0 615 190" />
      <path d="M44 74 A30 30 0 0 0 74 44 M1006 44 A30 30 0 0 0 1036 74" />
    </g>
  );
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
      <g fill="none" stroke={NIGHT.line} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <rect x="44" y="44" width={W - 88} height={H - 88} />
        {end("top")}
        {end("foot", `translate(0 ${H}) scale(1 -1)`)}
      </g>
    </svg>
  );
}

/** How much wider than the medal its ring is: the box the best medal takes. */
const RING = 1.34;

/** The best medal, `size` px, on its own light: a glow in its colour, a ring, the logo's two arcs and a few sparkles. Its box is the ring's. */
function Hero({ medal, size }: { medal: StoryMedal; size: number }) {
  const [, face, ring] = MEDAL_TONES[medal.art.tone];
  const box = Math.round(size * RING);
  const glow = Math.round(size * 2.1);
  const c = box / 2;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", width: box, height: box }}>
      <div
        style={{
          position: "absolute",
          display: "flex",
          left: Math.round(c - glow / 2),
          top: Math.round(c - glow / 2),
          width: glow,
          height: glow,
          borderRadius: glow,
          backgroundImage: `radial-gradient(circle, ${rgba(ring, 0.5)} 0%, ${rgba(face, 0.3)} 34%, ${rgba(face, 0.1)} 54%, ${rgba(face, 0)} 70%)`,
        }}
      />
      <svg width={box} height={box} viewBox="0 0 134 134" style={{ position: "absolute", left: 0, top: 0 }}>
        <circle cx="67" cy="67" r="64" fill="none" stroke={mix(NIGHT.bg, ring, 0.3)} strokeWidth="1.1" />
        <path d="M12.3 101.1A64 64 0 0 1 67 3" fill="none" stroke={NIGHT.lime} strokeWidth="2.6" strokeLinecap="round" />
        <path d="M121.7 32.9A64 64 0 0 1 67 131" fill="none" stroke={ring} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <Sparkle x={c + size * 0.6} y={c - size * 0.5} size={Math.round(size * 0.13)} color={NIGHT.white} />
      <Sparkle x={c - size * 0.74} y={c - size * 0.2} size={Math.round(size * 0.08)} color={NIGHT.lime} />
      <Sparkle x={c + size * 0.78} y={c + size * 0.28} size={Math.round(size * 0.07)} color={ring} />
      <Sparkle x={c - size * 0.6} y={c + size * 0.54} size={Math.round(size * 0.1)} color={NIGHT.white} />
      <Medal art={medal.art} size={size} />
    </div>
  );
}

/** Initials on the top medal's colour, then the name and the username. */
function Identity({ f, z }: { f: MedalStoryFacts; z: Sizes }) {
  const [, face, ring, ink] = MEDAL_TONES[f.top.art.tone];
  const av = z.avatar;
  const gap = 26;
  const room = COL - av - gap;
  const track = spread(SEMI);
  const one = fitSize(f.title, { width: room, max: z.title, min: 1, track });
  // One line down to 42 px; a longer name takes two.
  const two = one < 42;
  const size = two ? Math.max(36, fitSize(f.title, { width: room, max: 44, min: 1, lines: 2, track })) : one;
  const width = two ? room : Math.min(room, Math.ceil(textEm(f.title, track) * size) + 6);
  const letters = fitSize(f.initials, { width: av - 40, max: Math.round(av * 0.44), min: 24, track: spread(HEAVY) });
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: av, height: av, borderRadius: av, marginRight: gap, background: face, border: `6px solid ${ring}` }}>
        <T size={letters} color={ink} weight={HEAVY}>
          {f.initials}
        </T>
      </div>
      <div style={{ display: "flex", flexDirection: "column", width }}>
        <T size={size} color={NIGHT.white} weight={SEMI} lines={two ? 2 : 1} style={{ width }}>
          {f.title}
        </T>
        {f.handle && (
          <T size={z.handle} color={NIGHT.soft} style={{ marginTop: 2 }}>
            {f.handle}
          </T>
        )}
      </div>
    </div>
  );
}

/** A flame (the streak medals' own glyph), `size` px. */
function Flame({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <g fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {MEDAL_GLYPHS.flame.map((s, i) => ("d" in s ? <path key={i} d={s.d} /> : null))}
      </g>
    </svg>
  );
}

/** The grid's cells: how wide each is, its medal and its name's size, and the gap between two rows. */
type GridSpec = { cell: number; medal: number; name: number; gapY: number };

/** Every size that depends on how many rows of other medals there are (none, one or two): the more medals, the smaller the rest. */
type Sizes = { avatar: number; title: number; handle: number; hero: number; label: number; name: number; blurb: number; brag: number; streak: number; gap: number; count: number; pill: number; address: number; invite: number };
const SIZES: readonly Sizes[] = [
  { avatar: 112, title: 62, handle: 34, hero: 440, label: 30, name: 100, blurb: 40, brag: 44, streak: 34, gap: 34, count: 30, pill: 92, address: 42, invite: 34 },
  { avatar: 112, title: 62, handle: 34, hero: 300, label: 30, name: 92, blurb: 38, brag: 42, streak: 32, gap: 28, count: 30, pill: 92, address: 42, invite: 34 },
  { avatar: 96, title: 54, handle: 30, hero: 256, label: 28, name: 76, blurb: 34, brag: 40, streak: 30, gap: 20, count: 28, pill: 84, address: 40, invite: 32 },
];

/** One medal of the grid: its drawing and its name under it, on one line when it fits, else two. */
function Cell({ m, g }: { m: StoryMedal; g: GridSpec }) {
  const width = g.cell - 14;
  const one = fitSize(m.name, { width, max: g.name, min: 1, track: spread(SEMI) });
  const fits = one >= g.name * 0.86;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: g.cell }}>
      <Medal art={m.art} size={g.medal} />
      <T size={fits ? one : g.name} color={NIGHT.white} weight={SEMI} lines={fits ? undefined : 2} style={{ marginTop: 10, ...(fits ? null : { width, textAlign: "center" }) }}>
        {m.name}
      </T>
    </div>
  );
}

/** The grid's last cell when there are more medals than it holds: "+6" in a ring, "more" under it. */
function More({ text, g }: { text: string; g: GridSpec }) {
  const [n, word = ""] = text.split(" ");
  const d = Math.round(g.medal * 0.8);
  const pad = Math.round((g.medal - d) / 2);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: g.cell }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: d, height: d, margin: `${pad}px 0`, borderRadius: d, background: mix(NIGHT.bg, NIGHT.white, 0.08), border: `3px solid ${NIGHT.ring}` }}>
        <T size={fitSize(n, { width: d - 30, max: Math.round(d * 0.4), min: 20, track: spread(HEAVY) })} color={NIGHT.lime} weight={HEAVY}>
          {n}
        </T>
      </div>
      <T size={g.name} color={NIGHT.soft} style={{ marginTop: 10 }}>
        {word}
      </T>
    </div>
  );
}

function MedalStory({ f, icon }: { f: MedalStoryFacts; icon: string }) {
  const rows = storyRows(f.others.length + (f.more ? 1 : 0));
  const z = SIZES[rows.length];
  const g: GridSpec = rows.length <= 1 ? { cell: 228, medal: 164, name: 29, gapY: 0 } : rows[0] === 5 ? { cell: 186, medal: 112, name: 24, gapY: 18 } : { cell: 228, medal: 120, name: 26, gapY: 18 };
  const cells: ReactNode[] = f.others.map((m) => <Cell key={m.id} m={m} g={g} />);
  if (f.more) cells.push(<More key="more" text={f.more} g={g} />);
  const starts = rows.map((_, r) => rows.slice(0, r).reduce((a, n) => a + n, 0));
  const name = fitSize(f.top.name, { width: COL, max: z.name, min: 54, track: spread(HEAVY) });
  const brag = f.brag ? fitSize(f.brag, { width: COL, max: z.brag, min: 28, track: spread(SEMI) }) : 0;
  const address = fitSize(f.address, { width: COL - 150, max: z.address, min: 26, track: spread(HEAVY) });
  const mark = z.pill - 28;
  // Mown stripes across, lit where the best medal stands and dark towards both ends.
  const turf = bands(180, 16, (i) => mix(mix(NIGHT.bg, NIGHT.lit, 0.5 * Math.max(0, 1 - Math.abs(i - 4.5) / 8) ** 1.5), NIGHT.white, i % 2 ? 0 : 0.035));
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", backgroundColor: NIGHT.bg, backgroundImage: turf }}>
      <Pitch />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", flexGrow: 1, padding: `${STORY_SAFE.top}px ${PAD}px ${STORY_SAFE.bottom}px` }}>
        <Identity f={f} z={z} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Hero medal={f.top} size={z.hero} />
          <T size={z.label} color={NIGHT.lime} weight={SEMI} track={0.2} style={{ marginTop: 8 }}>
            {f.topLabel}
          </T>
          <T size={name} color={NIGHT.white} weight={HEAVY}>
            {f.top.name}
          </T>
          <T size={z.blurb} color={NIGHT.soft} style={{ marginTop: 8 }}>
            {f.top.blurb}
          </T>
          {f.brag && (
            <T size={brag} color={NIGHT.white} weight={SEMI} style={{ marginTop: z.gap }}>
              {f.brag}
            </T>
          )}
          {f.streak && (
            <div style={{ display: "flex", alignItems: "center", marginTop: f.brag ? 12 : z.gap }}>
              <Flame size={z.streak + 2} color="#FFB238" />
              <T size={z.streak} color={NIGHT.soft} style={{ marginLeft: 10 }}>
                {f.streak}
              </T>
            </div>
          )}
        </div>

        {rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: COL }}>
            <div style={{ display: "flex", alignItems: "center", width: COL, marginBottom: z.gap }}>
              <div style={{ display: "flex", flexGrow: 1, height: 2, background: NIGHT.line }} />
              <T size={z.count} color={NIGHT.lime} weight={SEMI} style={{ margin: "0 22px" }}>
                {f.count}
              </T>
              <div style={{ display: "flex", flexGrow: 1, height: 2, background: NIGHT.line }} />
            </div>
            {rows.map((n, r) => (
              <div key={r} style={{ display: "flex", justifyContent: "center", marginTop: r ? g.gapY : 0 }}>
                {cells.slice(starts[r], starts[r] + n)}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", height: z.pill, padding: `0 ${Math.round(z.pill * 0.42)}px 0 14px`, borderRadius: z.pill, background: NIGHT.lime }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={icon} alt="" width={mark} height={mark} style={{ borderRadius: mark }} />
            <T size={address} color={NIGHT.bg} weight={HEAVY} style={{ marginLeft: 16 }}>
              {f.address}
            </T>
          </div>
          <T size={z.invite} color={NIGHT.white} weight={SEMI} style={{ marginTop: 14 }}>
            {f.invite}
          </T>
        </div>
      </div>
    </div>
  );
}

/** The PNG for these facts with the app icon (a data URL). */
export function medalStoryPng(f: MedalStoryFacts, icon: string, headers?: HeadersInit): Response {
  return new ImageResponse(<MedalStory f={f} icon={icon} />, { ...MEDAL_STORY_SIZE, headers });
}
