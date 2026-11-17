import type { CSSProperties, ReactNode } from "react";
import { ImageResponse } from "next/og";
import { CARD_DESIGN, GAME_CARD_SHAPES, cardDayParts, fitSize, textEm, type GameCardDesign, type GameCardFacts, type GameCardShape, type GameCardSpots } from "./gameCard";
import { Ball, Field, Rupee, Tick, hasBall } from "./gameCardArt";

/**
 * A game's share card as a PNG: the designs (CARD_DESIGN in gameCard.ts
 * picks the live one) and the one function that draws them. What the card
 * says is lib/og/gameCard.ts's; the sport's pitch and ball are
 * lib/og/gameCardArt.tsx's.
 *
 * - Nothing third-party: text only in the font next/og bundles (every
 *   line is made drawable by ogText first, so it never fetches a font or
 *   an emoji), the app icon handed in as a data URL.
 * - That font has one weight, so bold is a stroke in the text's own colour
 *   (T's `weight`) and a slant is a skew. Capitals come from the facts,
 *   never textTransform.
 * - Every text has a box and a size that fits it (fitSize); what still
 *   does not fit wraps and is clamped, never drawn off the card. A row of
 *   small facts drops its last ones rather than run over (fitRow).
 * - Kept quick to draw, since a share preview waits only a few seconds
 *   (0.3 to 0.8 s a card where a first draft took 3 to 5): nothing is
 *   clipped (overflow hidden on the card alone doubled the time), no
 *   shadow is blurred, mown stripes are one gradient with hard stops
 *   (bands) and faint lines are solid colours, never a see-through layer.
 * - All three shapes are laid out, not cropped: each design says where
 *   its pitch, ball and words go at 1200x630, 4:3 and 1:1.
 * - Relative imports only, so a script can draw the cards without the app.
 */

type CardProps = { f: GameCardFacts; shape: GameCardShape; icon: string };

/** Bold as a stroke, in em: the one bundled weight, made semi-bold or heavy. */
const SEMI = 0.032;
const HEAVY = 0.058;

/** What a stroke of `weight` and letter spacing of `track` (both em) add to each character's width. */
const spread = (weight: number, track = 0) => weight * 0.6 + track;

// next/og draws "r," kerned but measures it unkerned, which leaves a double gap after it ("Rane Nagar,  Nashik"):
// a zero-width space (in the font) before the comma or stop keeps the pair apart, so drawn and measured agree.
const unkern = (s: string) => s.replace(/([,.]) /g, "\u200b$1 ");

/** One text: `weight` em of stroke for bold, `track` em of letter spacing, `lines` to clamp a wrapping text to. */
function T({ children, size, color, weight = 0, track = 0, lines, style }: { children: string; size: number; color: string; weight?: number; track?: number; lines?: number; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: lines ? "block" : "flex",
        flexShrink: 0,
        fontSize: size,
        lineHeight: 1.12,
        color,
        letterSpacing: size * spread(weight, track),
        ...(weight ? { WebkitTextStroke: `${(size * weight).toFixed(2)}px ${color}` } : null),
        ...(lines ? { lineClamp: lines, wordBreak: "break-word" } : { whiteSpace: "nowrap" }),
        ...style,
      }}
    >
      {unkern(children)}
    </div>
  );
}

/** "Baner, Pune · Hosted by Asha", or the place alone when both do not fit `width` at `size`: the host's name is left off, never cut. */
function whereLine(f: GameCardFacts, size: number, width: number): string | null {
  const both = [f.place, f.host && `Hosted by ${f.host}`].filter(Boolean).join(" \u00b7 ");
  return (textEm(both) * size <= width ? both : f.place) || null;
}

/**
 * A venue name's size and lines in a box `width` wide: one line down to
 * `min`, else two lines when that lets it be bigger. A name that is one
 * long word gains nothing from a second line, so it stays on one, smaller.
 */
function titleFit(title: string, width: number, max: number, min: number): { size: number; lines: number } {
  const track = spread(SEMI);
  const one = fitSize(title, { width, max, min: 1, track });
  if (one >= min) return { size: one, lines: 1 };
  const two = fitSize(title, { width, max: min, min: 1, lines: 2, track });
  const floor = Math.round(min * 0.6);
  return two > one ? { size: Math.max(two, floor), lines: 2 } : { size: Math.max(one, floor), lines: 1 };
}

/** The spots as dots, one a player (filled: in), `dot` px or smaller to fit `width`; a bar for a game too big for dots; nothing for a cancelled game. */
function Meter({ s, width, dot, on, off }: { s: GameCardSpots; width: number; dot: number; on: string; off: string }) {
  if (!s.max || s.kind === "cancelled") return null;
  if (s.max > 24) {
    return (
      <div style={{ display: "flex", width, height: Math.round(dot * 0.6), borderRadius: dot, background: off }}>
        <div style={{ display: "flex", width: Math.round((width * s.in) / s.max), height: "100%", borderRadius: dot, background: on }} />
      </div>
    );
  }
  const gap = Math.round(dot * 0.3);
  const d = Math.max(8, Math.min(dot, Math.floor((width + gap) / s.max) - gap));
  const ring = Math.max(2, Math.round(d * 0.13));
  return (
    <div style={{ display: "flex" }}>
      {Array.from({ length: s.max }, (_, i) => (
        <div
          key={i}
          style={{ display: "flex", width: d, height: d, borderRadius: d, marginRight: i < s.max - 1 ? gap : 0, background: i < s.in ? on : "transparent", border: `${ring}px solid ${i < s.in ? on : off}` }}
        />
      ))}
    </div>
  );
}

type Tone = { text: string; strong: string; pillBg: string; pillText: string; closedBg: string; closedText: string };

/** A filled pill with a word in it ("Almost full", "Full", "Cancelled"). */
function Pill({ children, size, bg, color }: { children: string; size: number; bg: string; color: string }) {
  return (
    <div style={{ display: "flex", flexShrink: 0, alignItems: "center", height: Math.round(size * 1.7), padding: `0 ${Math.round(size * 0.7)}px`, borderRadius: size, background: bg }}>
      <T size={size} color={color} weight={SEMI}>
        {children}
      </T>
    </div>
  );
}

/** "11 of 14 in · 3 spots left" and "Almost full" when it is; a game that is full, played or cancelled says so in a pill (red for cancelled). */
function SpotsWords({ s, size, tone, note = true }: { s: GameCardSpots; size: number; tone: Tone; note?: boolean }) {
  const gap = Math.round(size * 0.45);
  const [bg, color] = s.kind === "cancelled" ? ["#DC2626", "#FFFFFF"] : s.kind === "closed" ? [tone.closedBg, tone.closedText] : [tone.pillBg, tone.pillText];
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {s.count && (
        <T size={size} color={tone.text} style={{ marginRight: gap }}>
          {s.kind === "open" ? `${s.count} \u00b7` : s.count}
        </T>
      )}
      {s.kind === "open" ? (
        <T size={size} color={tone.strong} weight={SEMI} style={{ marginRight: gap }}>
          {s.text}
        </T>
      ) : (
        <Pill size={Math.round(size * 0.9)} bg={bg} color={color}>
          {s.text}
        </Pill>
      )}
      {note && s.note && (
        <Pill size={Math.round(size * 0.8)} bg={tone.pillBg} color={tone.pillText}>
          {s.note}
        </Pill>
      )}
    </div>
  );
}

/** How wide SpotsWords draws these spots at `size`, without the note. */
function spotsWordsWidth(s: GameCardSpots, size: number): number {
  const gap = Math.round(size * 0.45);
  const count = s.count ? textEm(s.kind === "open" ? `${s.count} \u00b7` : s.count) * size + gap : 0;
  const state = s.kind === "open" ? textEm(s.text, spread(SEMI)) * size + gap : (textEm(s.text, spread(SEMI)) + 1.4) * Math.round(size * 0.9);
  return Math.ceil(count + state);
}

/** Whether the game can still be joined or is only full: its day and time are drawn at full strength (a played or cancelled game's are dimmed). */
const live = (f: GameCardFacts) => f.spots.kind === "open" || f.spots.kind === "full";

type Extra = { key: string; node: ReactNode; width: number };

/**
 * The small facts, each one piece with its width: the price each, "Turf
 * booked" with its tick, the level, "Hosted by Asha" (unless `host` is
 * false). In that order, so a row short of room (fitRow) loses the last.
 */
function extras(f: GameCardFacts, size: number, color: string, o: { tick: string; tickInk: string; host?: boolean; weight?: number }): Extra[] {
  const w = o.weight ?? 0;
  const row: CSSProperties = { display: "flex", alignItems: "center", flexShrink: 0 };
  const wide = (text: string) => Math.ceil(textEm(text, spread(w)) * size);
  const words = (key: string, text: string): Extra => ({
    key,
    width: wide(text),
    node: (
      <T key={key} size={size} color={color} weight={w}>
        {text}
      </T>
    ),
  });
  const out: Extra[] = [];
  if (f.price === "Free") out.push(words("price", "Free"));
  else if (f.price) {
    const text = `${f.price} each`;
    out.push({
      key: "price",
      width: wide(text) + Math.round(size * 0.55),
      node: (
        <div key="price" style={row}>
          <Rupee size={size} color={color} weight={w ? 1.25 : 1} />
          <T size={size} color={color} weight={w}>
            {text}
          </T>
        </div>
      ),
    });
  }
  if (f.booked) {
    out.push({
      key: "booked",
      width: wide(f.booked) + Math.round(size * 1.22),
      node: (
        <div key="booked" style={row}>
          <Tick size={Math.round(size * 0.92)} color={o.tick} ink={o.tickInk} />
          <T size={size} color={color} weight={w} style={{ marginLeft: Math.round(size * 0.3) }}>
            {f.booked}
          </T>
        </div>
      ),
    });
  }
  if (f.skill) out.push(words("skill", f.skill));
  if (f.host && o.host !== false) out.push(words("host", `Hosted by ${f.host}`));
  return out;
}

/** The first of `items` that fit `room` px side by side, each `around` px wider (its padding and the gap after it). */
function fitRow(items: Extra[], room: number, around: number): Extra[] {
  let used = 0;
  return items.filter((it) => (used += it.width + around) <= room);
}

/** The footer's words: an open game asks to join; any other says where games are. */
const CTA: Record<GameCardSpots["kind"], string> = {
  open: "Join on tapturf.in",
  full: "See it on tapturf.in",
  closed: "Find a game on tapturf.in",
  cancelled: "Find a game on tapturf.in",
};

const scale = (shape: GameCardShape, x4x3: number, x1x1: number) => (shape === "og" ? 1 : shape === "4x3" ? x4x3 : x1x1);

/** "#rrggbb" `t` of the way from `a` to `b`: what a see-through `b` over `a` looks like, as a solid colour. */
function mix(a: string, b: string, t: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Mown stripes as one gradient: `n` equal bands along `deg`, band i in the colour `at(i)` gives, with hard edges. */
function bands(deg: number, n: number, at: (i: number) => string): string {
  const pct = (i: number) => `${((i / n) * 100).toFixed(2)}%`;
  return `linear-gradient(${deg}deg, ${Array.from({ length: n }, (_, i) => `${at(i)} ${pct(i)}, ${at(i)} ${pct(i + 1)}`).join(", ")})`;
}

/** A flat dark disc a little under a ball: its shadow on the turf, without a blur. */
function BallShadow({ size, color }: { size: number; color: string }) {
  return <div style={{ position: "absolute", display: "flex", left: Math.round(size * 0.03), top: Math.round(size * 0.09), width: size, height: size, borderRadius: size, background: color }} />;
}

// ─── a: night turf ─────────────────────────────────────────────────────────
// Deep green under floodlights: the sport's pitch in white lines and its ball on the right, lime for what matters.

const NIGHT = { bg: "#04261A", lit: "#2C5C22", lime: "#B8F23E", white: "#FFFFFF", soft: "#C3CFC8", dim: "#9DB3A6", ring: "#62796D", line: "#4A675A", lineOnly: "#6A8377", shade: "#031C13" };

function NightTurf({ f, shape, icon }: CardProps) {
  const W = GAME_CARD_SHAPES[shape].width;
  const k = scale(shape, 1.2, 1.3);
  const px = (n: number) => Math.round(n * k);
  const wide = shape === "og";
  const tall = shape === "1x1";
  const padX = px(56);
  // 1:1: the pitch is a band across the top and the words run the card's width; else the words keep clear of the ball on the right.
  const band = tall ? 300 : 0;
  const col = tall ? W - 2 * padX : W - padX - px(wide ? 390 : 365);
  const ball = px(wide ? 200 : 210);
  const whenMax = px(96);
  const whenSize = Math.min(
    fitSize(f.day, { width: col, max: whenMax, min: px(48), track: spread(HEAVY) }),
    fitSize(f.time, { width: col, max: whenMax, min: px(48), track: spread(HEAVY) }),
  );
  const whenColor = live(f) ? NIGHT.white : NIGHT.dim;
  const title = titleFit(f.title, col, px(50), px(40));
  const where = whereLine(f, px(29), col);
  const tone: Tone = { text: NIGHT.soft, strong: NIGHT.lime, pillBg: NIGHT.lime, pillText: NIGHT.bg, closedBg: "#3B5549", closedText: NIGHT.white };
  const cta = px(36);
  // 1200x630: the small facts are in the footer, beside the words; the taller shapes have a row for them.
  const small = wide
    ? fitRow(extras(f, 27, NIGHT.bg, { tick: NIGHT.bg, tickInk: NIGHT.lime, host: false, weight: SEMI }), W - 2 * padX - 100 - textEm(CTA[f.spots.kind], spread(HEAVY)) * cta, 26)
    : fitRow(extras(f, px(28), NIGHT.white, { tick: NIGHT.lime, tickInk: NIGHT.bg, host: false }), col, px(30));
  // Mown stripes, lit from the ball's side: each a shade lighter towards the right, every other one lighter again.
  const turf = bands(90, 16, (i) => mix(mix(NIGHT.bg, NIGHT.lit, 0.62 * (i / 15) ** 1.6), NIGHT.white, i % 2 ? 0 : 0.04));
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", backgroundColor: NIGHT.bg, backgroundImage: turf }}>
      <div
        style={{
          position: "absolute",
          display: "flex",
          transform: `rotate(${tall ? -8 : -12}deg)`,
          ...(tall ? { left: 250, top: -190 } : { left: W - px(wide ? 520 : 440), top: wide ? 24 : 170 }),
        }}
      >
        <Field art={f.art} width={tall ? 1000 : px(wide ? 700 : 640)} color={hasBall(f.art) ? NIGHT.line : NIGHT.lineOnly} stroke={2.6} />
      </div>
      {hasBall(f.art) && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            ...(tall ? { left: W - padX - ball - 70, top: 60 } : { left: W - px(wide ? 300 : 290), top: wide ? 150 : 290 }),
          }}
        >
          {f.art !== "badminton" && <BallShadow size={ball} color={NIGHT.shade} />}
          {/* Two arcs round the ball, as the logo's swooshes go round its pitch. */}
          <svg width={Math.round(ball * 1.5)} height={Math.round(ball * 1.5)} viewBox="0 0 150 150" style={{ position: "absolute", left: -Math.round(ball * 0.25), top: -Math.round(ball * 0.25) }}>
            <path d="M22 108A62 62 0 0 1 75 13" fill="none" stroke={NIGHT.lime} strokeWidth="4" strokeLinecap="round" />
            <path d="M128 42A62 62 0 0 1 75 137" fill="none" stroke={NIGHT.dim} strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <Ball art={f.art} size={ball} ink={NIGHT.bg} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center", padding: `${band}px ${padX}px 0` }}>
        <T
          size={fitSize(f.label, { width: col, max: px(66), min: px(40), track: spread(HEAVY, 0.03) })}
          color={NIGHT.lime}
          weight={HEAVY}
          track={0.03}
          lines={2}
          style={{ transform: "skewX(-10deg)", width: col, marginLeft: px(6) }}
        >
          {f.label}
        </T>
        <T size={whenSize} color={whenColor} weight={HEAVY} style={{ marginTop: px(6), lineHeight: 1.06 }}>
          {f.day}
        </T>
        <T size={whenSize} color={whenColor} weight={HEAVY} style={{ lineHeight: 1.06 }}>
          {f.time}
        </T>
        <T size={title.size} color={NIGHT.white} weight={SEMI} lines={title.lines} style={{ marginTop: px(16), width: col }}>
          {f.title}
        </T>
        {where && (
          <T size={px(29)} color={NIGHT.soft} lines={1} style={{ marginTop: px(4), width: col }}>
            {where}
          </T>
        )}
        <div style={{ display: "flex", flexDirection: wide ? "row" : "column", alignItems: wide ? "center" : "flex-start", marginTop: px(20) }}>
          <div style={{ display: "flex", marginRight: px(20), marginBottom: wide ? 0 : px(14) }}>
            <Meter s={f.spots} width={wide ? 470 : col} dot={px(wide ? 26 : 30)} on={NIGHT.lime} off={NIGHT.ring} />
          </div>
          <SpotsWords s={f.spots} size={px(32)} tone={tone} />
        </div>
        {!wide && small.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", marginTop: px(18) }}>
            {small.map((it) => (
              <div key={it.key} style={{ display: "flex", alignItems: "center", marginRight: px(30) }}>
                {it.node}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", flexShrink: 0, height: px(84), padding: `0 ${padX}px`, background: NIGHT.lime }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={px(54)} height={px(54)} style={{ borderRadius: px(13) }} />
        <T size={cta} color={NIGHT.bg} weight={HEAVY} style={{ marginLeft: px(18) }}>
          {CTA[f.spots.kind]}
        </T>
        {wide && (
          <div style={{ display: "flex", alignItems: "center", marginLeft: "auto" }}>
            {small.map((it, i) => (
              <div key={it.key} style={{ display: "flex", alignItems: "center", marginLeft: i ? 26 : 0 }}>
                {it.node}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── b: match ticket ───────────────────────────────────────────────────────
// A ticket on white paper: a green stub with the pitch, the ball and the sport, then the game in dark type.

const TICKET = { paper: "#F5FAF2", ink: "#0A1F13", green: "#16A34A", deep: "#15803D", dark: "#14532D", mute: "#4A6355", rule: "#BFD3C4", white: "#FFFFFF", line: "#EAF6EE" };

function MatchTicket({ f, shape, icon }: CardProps) {
  const { width: W, height: H } = GAME_CARD_SHAPES[shape];
  const k = scale(shape, 1.08, 1.3);
  const px = (n: number) => Math.round(n * k);
  const wide = shape === "og";
  // 1200x630: the stub is on the left; the taller shapes have it across the top.
  const stub = wide ? 372 : shape === "4x3" ? 250 : 400;
  const padX = px(wide ? 58 : 60);
  const col = (wide ? W - stub : W) - 2 * padX;
  const fieldW = wide ? 268 : Math.round(((stub - 56) * 600) / 380);
  const ball = wide ? 150 : Math.round(stub * 0.46);
  const labelBox = wide ? stub - 64 : W - 2 * padX - fieldW - 40;
  const label = fitSize(f.label, { width: labelBox, max: px(wide ? 60 : 70), min: px(34), lines: 2, track: spread(HEAVY, 0.02) });
  const title = titleFit(f.title, col, px(48), px(38));
  const where = whereLine(f, px(28), col);
  const tone: Tone = { text: TICKET.ink, strong: TICKET.deep, pillBg: TICKET.ink, pillText: TICKET.white, closedBg: "#DDE6DF", closedText: TICKET.ink };
  const chip = px(24);
  const small = fitRow(extras(f, chip, TICKET.ink, { tick: TICKET.green, tickInk: TICKET.white, host: false, weight: SEMI }), col, px(36) + 4 + px(12));
  const notch = 26;
  const holes = Math.floor(((wide ? H : W) - 2 * notch - 20) / 26);
  const stripes = Math.round((wide ? H : W) / 42);
  const whenColor = live(f) ? TICKET.ink : TICKET.mute;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: wide ? "row" : "column", position: "relative", backgroundColor: TICKET.paper }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          flexShrink: 0,
          position: "relative",
          width: wide ? stub : W,
          height: wide ? H : stub,
          padding: wide ? "0 32px 40px" : `0 ${padX}px ${px(24)}px`,
          backgroundColor: TICKET.green,
          // Mown stripes, darker towards the sport's name (the stub's foot, or its left when it lies across the top).
          backgroundImage: bands(wide ? 180 : 270, stripes, (i) => mix(mix(TICKET.green, TICKET.dark, 0.8 * (i / (stripes - 1))), TICKET.white, i % 2 ? 0 : 0.07)),
        }}
      >
        <div style={{ position: "absolute", display: "flex", ...(wide ? { left: 52, top: 30 } : { left: W - padX - fieldW, top: 28 }) }}>
          <Field art={f.art} width={fieldW} color={TICKET.line} stroke={wide ? 4 : 3.2} upright={wide} />
        </div>
        {hasBall(f.art) && (
          <div style={{ position: "absolute", display: "flex", ...(wide ? { left: 196, top: 300 } : { left: W - padX - ball + 24, top: stub - ball - 14 }) }}>
            <Ball art={f.art} size={ball} ink="#0B3B1E" />
          </div>
        )}
        <T size={label} color={TICKET.white} weight={HEAVY} track={0.02} lines={2} style={{ transform: "skewX(-10deg)", width: labelBox, lineHeight: 1.04 }}>
          {f.label}
        </T>
      </div>

      {/* The tear line: a notch at each end and a row of holes between. */}
      <div
        style={{
          position: "absolute",
          display: "flex",
          flexDirection: wide ? "column" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          ...(wide ? { left: stub - notch, top: -notch, width: 2 * notch, height: H + 2 * notch } : { left: -notch, top: stub - notch, width: W + 2 * notch, height: 2 * notch }),
        }}
      >
        <div style={{ display: "flex", flexShrink: 0, width: 2 * notch, height: 2 * notch, borderRadius: notch, background: TICKET.ink }} />
        {Array.from({ length: holes }, (_, i) => (
          <div key={i} style={{ display: "flex", flexShrink: 0, width: 10, height: 10, borderRadius: 5, background: TICKET.paper }} />
        ))}
        <div style={{ display: "flex", flexShrink: 0, width: 2 * notch, height: 2 * notch, borderRadius: notch, background: TICKET.ink }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "space-between", padding: `${px(wide ? 28 : 36)}px ${padX}px ${px(wide ? 22 : 30)}px` }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <T size={fitSize(f.day, { width: col, max: px(54), min: px(34), track: spread(HEAVY) })} color={live(f) ? TICKET.deep : TICKET.mute} weight={HEAVY}>
              {f.day}
            </T>
            <T size={fitSize(f.time, { width: col, max: px(118), min: px(56), track: spread(HEAVY) })} color={whenColor} weight={HEAVY} style={{ lineHeight: 1.08, marginLeft: -px(4) }}>
              {f.time}
            </T>
            <T size={title.size} color={TICKET.ink} weight={SEMI} lines={title.lines} style={{ marginTop: px(6), width: col }}>
              {f.title}
            </T>
            {where && (
              <T size={px(28)} color={TICKET.mute} lines={1} style={{ marginTop: px(4), width: col }}>
                {where}
              </T>
            )}
            <div style={{ display: "flex", alignItems: "center", marginTop: px(14) }}>
              {small.map((it) => (
                <div key={it.key} style={{ display: "flex", alignItems: "center", flexShrink: 0, height: px(44), marginRight: px(12), padding: `0 ${px(18)}px`, borderRadius: px(22), border: `2px solid ${TICKET.rule}`, background: TICKET.white }}>
                  {it.node}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Meter s={f.spots} width={col} dot={px(wide ? 24 : 30)} on={TICKET.green} off={TICKET.rule} />
            <div style={{ display: "flex", marginTop: px(10) }}>
              <SpotsWords s={f.spots} size={px(wide ? 28 : 31)} tone={tone} />
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0, height: px(wide ? 78 : 84), padding: `0 ${padX}px`, background: TICKET.ink }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt="" width={px(50)} height={px(50)} style={{ borderRadius: px(12) }} />
          <T size={px(wide ? 32 : 34)} color={TICKET.white} weight={HEAVY} style={{ marginLeft: px(16) }}>
            {CTA[f.spots.kind]}
          </T>
        </div>
      </div>
    </div>
  );
}

// ─── c: matchday poster ────────────────────────────────────────────────────
// Bright turf, black type, the day on a calendar tile: loud, like a poster on the turf's gate.

const POSTER = { turf: "#22C55E", ink: "#06140B", white: "#FFFFFF", soft: "#0C371B", lime: "#B8F23E", dim: "#12692F", off: "#5D6660", shade: "#1BA44D" };

function MatchdayPoster({ f, shape, icon }: CardProps) {
  const { width: W, height: H } = GAME_CARD_SHAPES[shape];
  const k = scale(shape, 1.16, 1.34);
  const px = (n: number) => Math.round(n * k);
  const wide = shape === "og";
  const padX = px(52);
  const strip = px(100);
  const ball = hasBall(f.art) ? (wide ? 200 : shape === "4x3" ? 200 : 310) : 0;
  const day = cardDayParts(f.day);
  const tile = px(186);
  // 1200x630: the ball sits right of the time; the taller shapes have it lower, over the pitch.
  const side = W - 2 * padX - (day ? tile + px(30) : 0) - (wide && ball ? ball + 30 : 0);
  const label = fitSize(f.label, { width: W - 2 * padX - px(20), max: px(112), min: px(52), track: spread(HEAVY, 0.01) });
  const title = titleFit(f.title, side, px(46), px(36));
  const tone: Tone = { text: POSTER.white, strong: POSTER.lime, pillBg: POSTER.lime, pillText: POSTER.ink, closedBg: "#414B45", closedText: POSTER.white };
  const small = fitRow(extras(f, px(26), POSTER.ink, { tick: POSTER.ink, tickInk: POSTER.white, weight: SEMI }), W - 2 * padX, px(48));
  const words = px(28);
  // The strip's right side: what the spots' words beside it leave, so "Find a game on tapturf.in" never runs into "Joining closed".
  const cta = fitSize(CTA[f.spots.kind], { width: W - 2 * padX - spotsWordsWidth(f.spots, words) - px(54 + 16 + 30), max: px(wide ? 33 : 30), min: px(20), track: spread(HEAVY) });
  const note = px(20);
  // What the strip's left side may take: the card less the words and icon on its right, and the note beside the dots.
  const meter = Math.min(Math.round(W * 0.4), W - 2 * padX - Math.ceil(textEm(CTA[f.spots.kind], spread(HEAVY)) * cta) - px(54 + 16 + 40) - (f.spots.note ? Math.ceil(textEm(f.spots.note, spread(SEMI)) * note) + px(42) : 0));
  const whenColor = live(f) ? POSTER.ink : POSTER.dim;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: POSTER.turf,
        // Mown stripes on the slant, about 90 px each.
        backgroundImage: bands(105, Math.round((W * 0.966 + H * 0.259) / 90), (i) => (i % 2 ? POSTER.turf : mix(POSTER.turf, POSTER.ink, 0.06))),
      }}
    >
      <div style={{ position: "absolute", display: "flex", transform: "rotate(-8deg)", ...(wide ? { left: 520, top: 90 } : { left: 140, top: H - strip - (shape === "4x3" ? 330 : 500) }) }}>
        <Field art={f.art} width={wide ? 900 : 1160} color={mix(POSTER.turf, POSTER.white, wide ? 0.34 : 0.5)} stroke={2.6} />
      </div>
      {ball > 0 && (
        <div
          style={{
            position: "absolute",
            display: "flex",
            left: W - padX - ball,
            top: wide ? 176 : H - strip - ball - (shape === "4x3" ? 34 : 90),
            transform: "rotate(12deg)",
          }}
        >
          {f.art !== "badminton" && <BallShadow size={ball} color={POSTER.shade} />}
          <Ball art={f.art} size={ball} ink={POSTER.ink} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: `${px(24)}px ${padX}px 0` }}>
        <T size={label} color={POSTER.ink} weight={HEAVY} track={0.01} style={{ transform: "skewX(-10deg)", marginLeft: px(10), lineHeight: 1.1 }}>
          {f.label}
        </T>
        <div style={{ display: "flex", alignItems: "center", marginTop: px(wide ? 14 : 22) }}>
          {day && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, position: "relative", width: tile, marginRight: px(30), borderRadius: px(22), background: POSTER.white }}>
              {/* The tile's shadow: the same shape a little lower, behind it. */}
              <div style={{ position: "absolute", display: "flex", left: 0, top: px(10), width: tile, height: "100%", borderRadius: px(22), background: POSTER.shade }} />
              <div style={{ position: "absolute", display: "flex", left: 0, top: 0, width: tile, height: "100%", borderRadius: px(22), background: POSTER.white }} />
              <div style={{ display: "flex", justifyContent: "center", width: "100%", padding: `${px(7)}px 0 ${px(9)}px`, borderTopLeftRadius: px(22), borderTopRightRadius: px(22), background: POSTER.ink }}>
                <T size={px(32)} color={POSTER.white} weight={HEAVY} track={0.08}>
                  {day.weekday}
                </T>
              </div>
              <T size={px(98)} color={POSTER.ink} weight={HEAVY} style={{ lineHeight: 1.08 }}>
                {day.dom}
              </T>
              <T size={fitSize(day.month, { width: tile - px(24), max: px(30), min: px(18), track: spread(HEAVY, 0.08) })} color={POSTER.ink} weight={HEAVY} track={0.08} style={{ marginBottom: px(12) }}>
                {day.month}
              </T>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {!day && f.day && (
              <T size={fitSize(f.day, { width: side, max: px(56), min: px(34), track: spread(HEAVY) })} color={whenColor} weight={HEAVY}>
                {f.day}
              </T>
            )}
            <T size={fitSize(f.time, { width: side, max: px(104), min: px(52), track: spread(HEAVY) })} color={whenColor} weight={HEAVY} style={{ lineHeight: 1.06, marginLeft: -px(4) }}>
              {f.time}
            </T>
            <T size={title.size} color={POSTER.ink} weight={SEMI} lines={title.lines} style={{ marginTop: px(6), width: side }}>
              {f.title}
            </T>
            {f.place && (
              <T size={px(29)} color={POSTER.soft} lines={1} style={{ marginTop: px(2), width: side }}>
                {f.place}
              </T>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: px(wide ? 22 : 28) }}>
          {small.map((it) => (
            <div key={it.key} style={{ display: "flex", alignItems: "center", flexShrink: 0, height: px(46), marginRight: px(12), padding: `0 ${px(18)}px`, borderRadius: px(23), background: POSTER.white }}>
              {it.node}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, height: strip, padding: `0 ${padX}px`, background: POSTER.ink }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Meter s={f.spots} width={meter} dot={px(20)} on={POSTER.lime} off={POSTER.off} />
            {f.spots.note && (
              <div style={{ display: "flex", marginLeft: px(14) }}>
                <Pill size={note} bg={POSTER.lime} color={POSTER.ink}>
                  {f.spots.note}
                </Pill>
              </div>
            )}
          </div>
          <div style={{ display: "flex", marginTop: px(8) }}>
            <SpotsWords s={f.spots} size={words} tone={tone} note={false} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <T size={cta} color={POSTER.lime} weight={HEAVY} style={{ marginRight: px(16) }}>
            {CTA[f.spots.kind]}
          </T>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} alt="" width={px(54)} height={px(54)} style={{ borderRadius: px(13) }} />
        </div>
      </div>
    </div>
  );
}

const DESIGNS: Record<GameCardDesign, (p: CardProps) => ReactNode> = { a: NightTurf, b: MatchTicket, c: MatchdayPoster };

/** The PNG for these facts with the app icon (a data URL), in the live design unless another is asked for (the scratch renders ask for each). */
export function gameCardPng(f: GameCardFacts, shape: GameCardShape, icon: string, headers?: HeadersInit, design: GameCardDesign = CARD_DESIGN): Response {
  const Card = DESIGNS[design];
  return new ImageResponse(<Card f={f} shape={shape} icon={icon} />, { ...GAME_CARD_SHAPES[shape], headers });
}
