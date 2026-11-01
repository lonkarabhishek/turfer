import { AVATAR_PRESETS, avatarLabel, type AvatarPresetId } from "./avatar";

/**
 * The avatars, drawn here as SVG (64 x 64, a full square: every place
 * shows it in a circle): players, head and shoulders, in one flat style.
 * Every player has the same head and shoulders, and their own skin, hair,
 * face, kit and gear, so the gear and the kit's colour say the role at
 * 24 px and the face is the fun at 160. Faces are friendly (a grin, a
 * laugh, a shout; never gritted teeth) and poses vary (gear in either
 * hand, both hands, arms crossed, on the run). Gear sits inside the circle
 * with room to spare, and never in its bottom right (x > 40, y > 41), where
 * the profile page puts its camera button. Kits keep clear of team colours.
 * Served at /avatars/<id>.svg by app/avatars/[file]/route.ts, so any <img>
 * of a profile picture shows one with no special case. Static markup
 * only: no scripts, links, text or outside references. Relative imports
 * only (npm run test:account).
 */

type Skin = { base: string; shade: string };

/** Five skin tones, light to deep; shade: the neck, nose and the edge of an arm. */
const SKIN: Skin[] = [
  { base: "#F6D2B0", shade: "#E4B28C" },
  { base: "#E9B78D", shade: "#D39B70" },
  { base: "#C98F62", shade: "#B0774D" },
  { base: "#A66B42", shade: "#8C5633" },
  { base: "#7A4B2D", shade: "#643B22" },
];

const HAIR = { black: "#241B17", brown: "#5A3622", grey: "#A9A39E", silver: "#D9D4CF" };
const EYE = "#2A1C15";
const MOUTH = "#8E3324";
const INK = "#1D1D1F";
/** The one outline: white and pale gear (a football, a shuttle, a batting glove) gets a thin edge a shade darker. */
const EDGE = ` stroke="#B8C0CC" stroke-width=".8"`;

const r1 = (n: number) => Math.round(n * 10) / 10;
const path = (d: string, fill: string, more = "") => `<path d="${d}" fill="${fill}"${more}/>`;
const line = (d: string, stroke: string, w: number, more = "") =>
  `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${more}/>`;
/** The same, left for right. */
const flip = (s: string) => `<g transform="matrix(-1 0 0 1 64 0)">${s}</g>`;
const both = (s: string) => s + flip(s);
/** The head, its hair and face, 8% bigger about the chin, so a face carries at 32 px. */
const HEAD = "matrix(1.08 0 0 1.08 -2.56 -3.2)";

/* ------------------------------------------------------------------ */
/* The head and face                                                   */
/* ------------------------------------------------------------------ */

type Face = {
  /** grin: open, teeth showing; smile: closed; smirk: lopsided; laugh: wide open; shout: a joyful "yes!"; tongue: out at the side, concentrating. */
  mouth?: keyof typeof MOUTHS;
  /** happy: shut, laughing; wink: the left one shut. */
  eyes?: "open" | "happy" | "wink";
  /** The brows' colour; none under a cap's peak. */
  brows?: string;
  /** focus: a little low at the middle, game face; arch: the left one up, sure of it; up: both up, delighted. */
  brow?: "focus" | "arch" | "up";
  beard?: "full" | "short";
  moustache?: boolean;
  beardColor?: string;
  glasses?: boolean;
};

const TONGUE = "#E8737A";

/** Every mouth is open and curved or a smile: intensity is a shout or a grin, never gritted teeth. */
const MOUTHS = {
  grin: path("M28.6 33.1Q32 34.2 35.4 33.1Q35 37.3 32 37.3T28.6 33.1Z", MOUTH) + path("M29.3 33.4Q32 34.3 34.7 33.4L34.5 34.4Q32 35.1 29.5 34.4Z", "#fff"),
  smile: line("M28.9 33.6Q32 36.4 35.1 33.6", MOUTH, 1.3),
  smirk: line("M29.2 34.5Q32.8 36.2 35.4 33.2", MOUTH, 1.3),
  laugh:
    path("M28.1 32.7Q32 33.8 35.9 32.7Q35.7 37.6 32 37.6T28.1 32.7Z", MOUTH) +
    path("M28.8 33Q32 33.9 35.2 33L35 34.2Q32 34.9 29 34.2Z", "#fff") +
    `<ellipse cx="32" cy="36.4" rx="1.9" ry=".9" fill="${TONGUE}"/>`,
  shout:
    path("M29 32.6Q32 33.4 35 32.6Q35.6 38.8 32 38.8T29 32.6Z", MOUTH) +
    path("M29.5 32.9Q32 33.6 34.5 32.9L34.5 33.9Q32 34.5 29.5 33.9Z", "#fff") +
    `<ellipse cx="32" cy="37.4" rx="1.8" ry="1" fill="${TONGUE}"/>`,
  tongue:
    `<ellipse cx="34.1" cy="35.5" rx="1.3" ry="1.6" fill="${TONGUE}" transform="rotate(-24 34.1 35.5)"/>` +
    line("M34.3 35.1l-.2 1.2", "#C9525A", 0.5) +
    line("M28.9 33.5Q31.8 36.1 35.1 33.5", MOUTH, 1.3),
};

/** The left brow (the right one is its mirror), by mood. */
const BROWS = {
  plain: ["M25.9 24.9q2-1.2 4-.3", "M38.1 24.9q-2-1.2-4-.3"],
  focus: ["M25.8 24.2q2.2-.2 4.3.9", "M38.2 24.2q-2.2-.2-4.3.9"],
  arch: ["M25.9 24q1.8-1.9 4-.7", "M38.2 24.4q-2.2-.2-4.3.8"],
  up: ["M25.9 24.1q2-1.6 4-.6", "M38.1 24.1q-2-1.6-4-.6"],
};

const neck = (s: Skin) => path("M27.5 33h9v13.5h-9z", s.shade);

function head(s: Skin, ears: boolean): string {
  return (ears ? both(`<ellipse cx="21.7" cy="28.4" rx="2.2" ry="2.9" fill="${s.base}"/>`) : "") + `<ellipse cx="32" cy="27" rx="10.4" ry="11.4" fill="${s.base}"/>`;
}

function face(s: Skin, f: Face): string {
  const hair = f.beardColor ?? HAIR.black;
  let out = "";
  if (!f.beard) out += `<g fill="#EE6A5A" fill-opacity=".28"><ellipse cx="25.8" cy="32.4" rx="2" ry="1.3"/><ellipse cx="38.2" cy="32.4" rx="2" ry="1.3"/></g>`;
  out += line("M32.4 28.7q-1.3 2.6.1 3.1", s.shade, 1.1);
  if (f.beard) {
    const chin = f.beard === "full" ? 42.4 : 40.4;
    out += path(`M21.6 27C21.4 36 25.4 ${chin} 32 ${chin}S42.6 36 42.4 27C41.6 31.4 39.8 33.8 37.4 34.4 35.8 31.8 33.6 31.2 32 31.8 30.4 31.2 28.2 31.8 26.6 34.4 24.2 33.8 22.4 31.4 21.6 27Z`, hair);
  }
  if (f.moustache) out += path("M27.4 34C28.2 31.6 30.6 31.4 32 32.5 33.4 31.4 35.8 31.6 36.6 34 34.9 33.3 33.2 33.5 32 34.2 30.8 33.5 29.1 33.3 27.4 34Z", hair);
  out += `<g${f.moustache ? ` transform="translate(0 1.3)"` : ""}>${MOUTHS[f.mouth ?? "grin"]}</g>`;
  const open = (x: number) => `<ellipse cx="${x}" cy="28.2" rx="1.3" ry="1.55" fill="${EYE}"/><circle cx="${x + 0.45}" cy="27.6" r=".45" fill="#fff"/>`;
  const shut = (x: number) => line(`M${x - 1.4} 28.7q1.4-1.6 2.8 0`, EYE, 1.2);
  out += f.eyes === "happy" ? shut(28) + shut(36) : (f.eyes === "wink" ? shut(28) : open(28)) + open(36);
  if (f.brows) out += line(BROWS[f.brow ?? "plain"].join(""), f.brows, f.brow === "focus" ? 1.3 : 1.15);
  if (f.glasses) out += `<g fill="none" stroke="#3B3633" stroke-width=".9"><circle cx="28" cy="28.3" r="2.9"/><circle cx="36" cy="28.3" r="2.9"/><path d="M30.9 28q1.1-.8 2.2 0M25.1 27.7l-3.4-.8M38.9 27.7l3.4-.8"/></g>`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Kit                                                                 */
/* ------------------------------------------------------------------ */

/** Numbers for a shirt, drawn (no font): each 4 wide, 6 tall. */
const DIGIT: Record<string, string> = {
  "0": "M2 0C.8 0 0 1 0 2.4v1.2C0 5 .8 6 2 6s2-1 2-2.4V2.4C4 1 3.2 0 2 0Z",
  "1": "M.8 1.4 2.4 0v6",
  "7": "M0 0h4L1.6 6",
  "9": "M4 2.2C4 3.4 3.1 4.3 2 4.3S0 3.4 0 2.2.9 0 2 0s2 1 2 2.2v1.6C4 5.1 3.2 6 2 6 1.2 6 .6 5.6.3 5",
};

function shirtNumber(n: string, color: string, y = 52.6): string {
  const w = n.length * 4 + (n.length - 1) * 1.8;
  return [...n]
    .map((c, i) => `<path transform="translate(${r1(32 - w / 2 + i * 5.8)} ${y})" d="${DIGIT[c]}" fill="none" stroke="${color}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/>`)
    .join("");
}

type Kit = {
  trim?: string;
  neck?: "round" | "v" | "polo" | "zip";
  num?: string;
  numColor?: string;
  /** A child's narrower shoulders. */
  kid?: boolean;
};

/** A shirt from the shoulders down, its neck, trim and number. */
function kit(color: string, k: Kit = {}): string {
  const v = k.neck === "v";
  const top = k.kid ? 46 : 43.7;
  const neckD = v ? `L32 ${top + 5.4}L${36.6} ${top}` : `Q32 ${top + 4.2} 36.6 ${top}`;
  const body = k.kid
    ? `M9 64C9.5 54 15 48 23.4 46.6L27.4 ${top}${neckD}L40.6 46.6C49 48 54.5 54 55 64Z`
    : `M5 64C5.5 52 13 45.6 23.4 44.3L27.4 ${top}${neckD}L40.6 44.3C51 45.6 58.5 52 59 64Z`;
  let out = path(body, color);
  // The sleeves' seams, a shade darker.
  out += both(line(k.kid ? "M16.4 52.6Q18.6 58 18 64" : "M13.6 51Q16.4 57 15.8 64", "#000", 1.1, ` stroke-opacity=".12"`));
  const trim = k.trim ?? "#fff";
  if (k.neck === "polo") {
    out += both(path(`M27.4 ${top}L32 ${top + 3.6}L29.4 ${top + 6.6}L25.4 ${top + 1.2}Z`, trim));
    out += line(`M32 ${top + 3.6}v5.6`, "#000", 0.9, ` stroke-opacity=".2"`);
  } else if (k.neck === "zip") {
    out += path(`M26.8 ${top - 1}L27.6 ${top + 3}Q32 ${top + 5.6} 36.4 ${top + 3}L37.2 ${top - 1}Q32 ${top + 2.2} 26.8 ${top - 1}Z`, color);
    out += line(`M26.8 ${top - 1}Q32 ${top + 2.2} 37.2 ${top - 1}`, trim, 1);
    out += line(`M32 ${top + 4.4}V64`, trim, 1.1);
  } else {
    out += line(`M27.4 ${top}${neckD}`, trim, 1.7);
  }
  if (k.num) out += shirtNumber(k.num, k.numColor ?? trim, k.kid ? 54 : 52.6);
  return out;
}

/** Bare shoulders (a tank top's arms, a swimmer). */
const shoulders = (s: Skin) => path("M5 64C5.5 52 13 45.6 23.4 44.3Q27.4 43.4 28.6 41.4H35.4Q36.6 43.4 40.6 44.3C51 45.6 58.5 52 59 64Z", s.base);

/** A tank top over bare shoulders. */
function tank(color: string, trim: string, num: string, s: Skin): string {
  return (
    shoulders(s) +
    path("M15.8 64C16.6 56 18.6 49.4 22.2 45.4L26.2 44.4Q32 52 37.8 44.4L41.8 45.4C45.4 49.4 47.4 56 48.2 64Z", color) +
    line("M26.2 44.4Q32 52 37.8 44.4M22.2 45.4C18.6 49.4 16.6 56 15.8 64M41.8 45.4C45.4 49.4 47.4 56 48.2 64", trim, 1.5) +
    shirtNumber(num, trim, 54.4)
  );
}

/* ------------------------------------------------------------------ */
/* Arms and hands                                                      */
/* ------------------------------------------------------------------ */

type Arm = {
  /** How far out to the side the elbow, below the frame, is from the wrist. */
  lean?: number;
  /** The shirt's colour: its short sleeve, where the arm leaves the frame. */
  sleeve?: string;
  /** A long sleeve: the whole forearm this colour. */
  cover?: string;
  /** A band or cuff at the wrist. */
  band?: string;
};

/**
 * A forearm raised to a wrist at (x, y) from an elbow below the frame: it
 * tapers to the wrist and leans in, its edge on the body's side a shade
 * darker, so it reads as a bent arm in front of the chest.
 */
function arm(x: number, y: number, s: Skin, o: Arm = {}): string {
  const ex = x + (o.lean ?? 5);
  const len = Math.hypot(ex - x, 68 - y);
  const ux = (ex - x) / len;
  const uy = (68 - y) / len;
  // A point t along the arm from the wrist and w across it (+: the body's side).
  const at = (t: number, w: number) => `${r1(x + ux * t - uy * w)} ${r1(y + uy * t + ux * w)}`;
  const quad = (t0: number, t1: number, w0: number, w1: number) => `M${at(t0, -w0)}L${at(t1, -w1)}L${at(t1, w1)}L${at(t0, w0)}Z`;
  let out = path(quad(0, len, 3.1, 4.6), o.cover ?? s.base);
  out += line(`M${at(2, 3.2)}L${at(len, 4.6)}`, o.cover ? "#000" : s.shade, 0.9, o.cover ? ` stroke-opacity=".18"` : "");
  if (o.sleeve) {
    const t0 = 12 / uy;
    const hem = `M${at(t0, -5)}Q${at(t0 - 1.8, 0)} ${at(t0, 5)}`;
    out += path(`${hem}L${at(len, 5.6)}L${at(len, -5.6)}Z`, o.sleeve) + line(`${hem}L${at(len, 5.6)}`, "#000", 0.9, ` stroke-opacity=".18"`);
  }
  if (o.band) out += path(quad(0.4, 3, 3.3, 3.5), o.band);
  return out;
}

/** A fist at (x, y), its knuckles to the front. */
function fist(x: number, y: number, s: Skin): string {
  return `<rect x="${r1(x - 3.8)}" y="${r1(y - 3.4)}" width="7.6" height="7" rx="2.8" fill="${s.base}"/>` + line(`M${r1(x - 1.2)} ${r1(y - 3.2)}v2.4M${r1(x + 1.3)} ${r1(y - 3.2)}v2.4`, s.shade, 0.8);
}

/** A hand from below holding something up at (x, y): the palm, the thumb at the side. */
function palm(x: number, y: number, s: Skin): string {
  return `<ellipse cx="${x}" cy="${y}" rx="4" ry="3.3" fill="${s.base}"/>` + `<ellipse cx="${r1(x - 3.4)}" cy="${r1(y - 1.6)}" rx="1.4" ry="2.2" fill="${s.base}" transform="rotate(-24 ${r1(x - 3.4)} ${r1(y - 1.6)})"/>`;
}

/** A fist at (x, y) with the forefinger up `len`, on the thumb's side, and the thumb's crease. */
function pointer(x: number, y: number, s: Skin, len: number): string {
  return (
    `<rect x="${r1(x - 3.6)}" y="${r1(y - 4.3 - len)}" width="3.4" height="${r1(len + 5)}" rx="1.7" fill="${s.base}"/>` +
    `<rect x="${r1(x - 4.2)}" y="${r1(y - 4.3)}" width="8.4" height="8.6" rx="3" fill="${s.base}"/>` +
    line(`M${r1(x - 3.8)} ${r1(y - 0.5)}h3.4`, s.shade, 0.8)
  );
}

/** A thumbs up at (x, y): the fist side on, its fingers curled, the thumb up. */
function thumbsUp(x: number, y: number, s: Skin): string {
  return (
    `<rect x="${r1(x - 3.6)}" y="${r1(y - 9)}" width="3.6" height="7.4" rx="1.8" fill="${s.base}"/>` +
    `<rect x="${r1(x - 4)}" y="${r1(y - 3.6)}" width="8" height="7.4" rx="2.8" fill="${s.base}"/>` +
    line(`M${r1(x - 0.4)} ${r1(y - 1.3)}h3.4M${r1(x - 0.4)} ${r1(y + 0.9)}h3.4M${r1(x - 0.4)} ${r1(y + 3)}h2.8`, s.shade, 0.8)
  );
}

/** An open hand waving, its palm's middle at (x, y). */
function wave(x: number, y: number, s: Skin): string {
  const fingers = [
    [-2.85, 4],
    [-0.95, 4.9],
    [0.95, 4.7],
    [2.85, 3.8],
  ]
    .map(([dx, h]) => `<rect x="${r1(x + dx - 0.75)}" y="${r1(y - 2.4 - h)}" width="1.5" height="${r1(h + 2)}" rx=".75"/>`)
    .join("");
  return `<g fill="${s.base}">${fingers}<rect x="${r1(x - 3.6)}" y="${r1(y - 3)}" width="7.2" height="6.4" rx="2.6"/><ellipse cx="${r1(x - 4)}" cy="${r1(y + 0.6)}" rx="1.3" ry="2.4" transform="rotate(-35 ${r1(x - 4)} ${r1(y + 0.6)})"/></g>`;
}

/* ------------------------------------------------------------------ */
/* Balls                                                               */
/* ------------------------------------------------------------------ */

/** A regular polygon's points: n corners at radius r around (cx, cy), the first at angle a0 (degrees, 0 = right, clockwise). */
function poly(cx: number, cy: number, r: number, n: number, a0: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((a0 + (360 / n) * i) * Math.PI) / 180;
    pts.push(`${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`);
  }
  return pts.join(" ");
}

/** A football at (cx, cy): a black pentagon in the middle, five more at the edge. */
function football(cx: number, cy: number, r: number): string {
  const rad = (a: number) => (a * Math.PI) / 180;
  const edge = [-90, -18, 54, 126, 198]
    .map((a) => `<polygon points="${poly(cx + r * 1.02 * Math.cos(rad(a)), cy + r * 1.02 * Math.sin(rad(a)), r * 0.4, 5, a + 180)}"/>`)
    .join("");
  return (
    `<defs><clipPath id="fb"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>` +
    `<g clip-path="url(#fb)" fill="${INK}"><polygon points="${poly(cx, cy, r * 0.36, 5, -90)}"/>${edge}</g>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"${EDGE}/>`
  );
}

/** A red leather cricket ball, its seam across, or turned `tilt` degrees. */
function cricketBall(cx: number, cy: number, r: number, tilt = 0): string {
  const a = r * 0.95;
  const seam =
    line(`M${r1(cx - a)} ${r1(cy - r * 0.35)}Q${cx} ${r1(cy + r * 0.3)} ${r1(cx + a)} ${r1(cy - r * 0.35)}`, "#F7E6C4", r1(r * 0.13)) +
    line(`M${r1(cx - a)} ${r1(cy + r * 0.05)}Q${cx} ${r1(cy + r * 0.7)} ${r1(cx + a)} ${r1(cy + r * 0.05)}`, "#F7E6C4", r1(r * 0.13));
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#D22B2B"/>` +
    (tilt ? `<g transform="rotate(${tilt} ${cx} ${cy})">${seam}</g>` : seam) +
    `<ellipse cx="${r1(cx - r * 0.38)}" cy="${r1(cy - r * 0.45)}" rx="${r1(r * 0.3)}" ry="${r1(r * 0.18)}" fill="#fff" fill-opacity=".4"/>`
  );
}

/** A tennis ball (also padel's). */
function tennisBall(cx: number, cy: number, r: number): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#D4EC3D"/>` +
    line(`M${r1(cx - r * 0.7)} ${r1(cy - r * 0.72)}Q${r1(cx - r * 0.05)} ${cy} ${r1(cx - r * 0.7)} ${r1(cy + r * 0.72)}M${r1(cx + r * 0.7)} ${r1(cy - r * 0.72)}Q${r1(cx + r * 0.05)} ${cy} ${r1(cx + r * 0.7)} ${r1(cy + r * 0.72)}`, "#fff", r1(r * 0.17))
  );
}

/* ------------------------------------------------------------------ */
/* Hair and headwear                                                   */
/* ------------------------------------------------------------------ */

/** Tight curls round the top of the head. */
function curls(c: string, r = 3.3, from = 196, to = 344, n = 9, rad = 10.6, cy = 25.4): string {
  let out = path("M21.6 26C21.4 18.4 26 14.6 32 14.6S42.6 18.4 42.4 26C38 22 26 22 21.6 26Z", c);
  for (let i = 0; i < n; i++) {
    const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    out += `<circle cx="${r1(32 + rad * Math.cos(a))}" cy="${r1(cy + rad * 1.04 * Math.sin(a))}" r="${r}" fill="${c}"/>`;
  }
  return out;
}

/** Circles of one colour: hair in curls, a braid. */
const dots = (c: string, r: number, pts: number[][], more = "") => `<g fill="${c}"${more}>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`;

/**
 * A plait (a choti) from (x0, y0) to (x1, y1), w0 wide tapering to w1: one
 * solid shape, so it reads as hair at 32 px, its weave in chevrons a shade
 * lighter, a tie and a tuft at the end.
 */
function plait(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, c: string, weave: string, tie: string): string {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const deg = r1((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI - 90);
  const n = 5;
  const seg = len / n;
  const w = (y: number) => (w0 + ((w1 - w0) * y) / len) / 2;
  // Each strand bulges a little and pinches where the next crosses it.
  let side = `M${r1(-w(0))} 0`;
  for (let i = 0; i < n; i++) side += `Q${r1(-w(seg * (i + 0.5)) - 0.5)} ${r1(seg * (i + 0.5))} ${r1(-w(seg * (i + 1)) + 0.2)} ${r1(seg * (i + 1))}`;
  let back = "";
  for (let i = n - 1; i >= 0; i--) back += `Q${r1(w(seg * (i + 0.5)) + 0.5)} ${r1(seg * (i + 0.5))} ${r1(w(seg * i) - (i ? 0.2 : 0))} ${r1(seg * i)}`;
  let chevrons = "";
  for (let i = 0; i < n; i++) {
    const y = seg * i;
    chevrons += `M${r1(-w(y) + 0.4)} ${r1(y + seg * 0.15)}Q${r1(-w(y) * 0.2)} ${r1(y + seg * 0.5)} ${r1(w(y) * 0.35)} ${r1(y + seg * 0.95)}`;
    if (i < n - 1) chevrons += `M${r1(w(y) - 0.4)} ${r1(y + seg * 0.65)}Q${r1(w(y) * 0.2)} ${r1(y + seg)} ${r1(-w(y) * 0.35)} ${r1(y + seg * 1.45)}`;
  }
  const end = r1(len);
  return (
    `<g transform="translate(${x0} ${y0}) rotate(${deg})">` +
    path(`${side}L${r1(w(len) - 0.2)} ${end}${back}Z`, c) +
    line(chevrons, weave, 0.7) +
    path(`M${r1(-w1 / 2 + 0.2)} ${r1(end + 1.6)}Q0 ${r1(end + 5.6)} ${r1(w1 / 2 - 0.2)} ${r1(end + 1.6)}Z`, c) +
    `<rect x="${r1(-w1 / 2 - 0.5)}" y="${r1(end - 0.4)}" width="${r1(w1 + 1)}" height="2" rx=".8" fill="${tie}"/>` +
    `</g>`
  );
}

/** A sports headband across the forehead. */
const headband = (c: string, stripe?: string) =>
  path("M21.4 22.4Q32 16 42.6 22.4L42.8 25Q32 18.8 21.2 25Z", c) + (stripe ? line("M21.6 23.8Q32 17.6 42.4 23.8", stripe, 0.7) : "");

/** A cricket cap from the front: the crown, its peak over the brows. */
function cap(c: string, peak: string, badge?: string): string {
  return (
    path("M20.6 25C20.2 16.2 25.4 12.4 32 12.4S43.8 16.2 43.4 25Z", c) +
    line("M32 12.6v11.6M26 13.8q-2.6 4.6-2.4 10.6M38 13.8q2.6 4.6 2.4 10.6", "#000", 0.7, ` stroke-opacity=".18"`) +
    path("M18.8 24.4Q32 20.4 45.2 24.4Q46 26.4 44.6 27Q32 23.8 19.4 27Q18 26.4 18.8 24.4Z", peak) +
    (badge ? `<circle cx="32" cy="18.6" r="2.1" fill="${badge}"/>` : "")
  );
}

/** Hair over the top of the head, parted to one side, down to the ears. */
const SWEPT = "M21.4 28C20.6 19 25.4 14.2 32 14.2S43.4 19 42.6 28C41.8 24 40 21.8 37 20.6 33.6 19.4 28.8 19.6 25.6 21.2 23.4 22.6 22 25 21.4 28Z";
/** The same, parted in the middle. */
const PARTED = "M21.4 28C20.4 19 25.2 14.4 32 14.4S43.6 19 42.6 28C42 23.6 40.2 21 36.6 19.8 33.4 18.8 30.6 18.8 27.4 19.8 23.8 21 22 23.6 21.4 28Z";

/* ------------------------------------------------------------------ */
/* The players                                                         */
/* ------------------------------------------------------------------ */

type Player = {
  bg: string;
  skin: Skin;
  /** Behind everything: chalk on the wall. */
  back?: string;
  /** Hair behind the head and shoulders (a ponytail, a bun, long hair), sized with the head. */
  hairBack?: string;
  /** From the shoulders down. */
  kit: string;
  /** Between the kit and the head: a bat on the shoulder. */
  mid?: string;
  /** false under a hijab or a swim cap. */
  ears?: boolean;
  face: Face;
  /** Hair and headwear, over the head. */
  top?: string;
  /** Hands and gear, in front of everything. */
  front?: string;
  /** The whole player (not the front) leaning this many degrees, on the move: negative, to the left. */
  lean?: number;
};

/** A cricket bat resting on the shoulder, its handle at (x, y), leaning `tilt` degrees. */
function bat(x: number, y: number, tilt: number, sticker: string): string {
  return (
    `<g transform="translate(${x} ${y}) rotate(${tilt})">` +
    `<rect x="-1.5" y="-15" width="3" height="15" rx="1" fill="#1F2937"/>` +
    line("M-1.4 -11.6h2.8M-1.4 -8.4h2.8M-1.4 -5.2h2.8", "#4B5563", 0.8) +
    path("M-1.5 -14.4-4.3-18h8.6L1.5-14.4Z", "#E2B66E") +
    `<rect x="-4.3" y="-39" width="8.6" height="22" rx="2.8" fill="#EDCB8C"/>` +
    `<rect x="1.8" y="-38.4" width="2.5" height="21" rx="1.2" fill="#D6AA62"/>` +
    `<rect x="-3.1" y="-34.6" width="4.6" height="4.2" rx=".8" fill="${sticker}"/>` +
    `</g>`
  );
}

/** A batting glove gripping the handle at (x, y). */
const battingGlove = (x: number, y: number, pad: string) =>
  `<rect x="${x - 5}" y="${y - 4.2}" width="10" height="8.6" rx="3.2" fill="#fff"${EDGE}/>` + line(`M${x - 2.5} ${y - 3.6}v7.4M${x} ${y - 3.6}v7.4M${x + 2.5} ${y - 3.6}v7.4`, pad, 1.1);

/** Sparkles (four-point stars) for something golden. */
const sparkle = (x: number, y: number, r: number, c: string) =>
  path(`M${x} ${r1(y - r)}Q${r1(x + r * 0.18)} ${r1(y - r * 0.18)} ${r1(x + r)} ${y}Q${r1(x + r * 0.18)} ${r1(y + r * 0.18)} ${x} ${r1(y + r)}Q${r1(x - r * 0.18)} ${r1(y + r * 0.18)} ${r1(x - r)} ${y}Q${r1(x - r * 0.18)} ${r1(y - r * 0.18)} ${x} ${r1(y - r)}Z`, c);

const PLAYERS: Record<AvatarPresetId, () => Player> = {
  batter: () => {
    const s = SKIN[2];
    const helmet = "#1E3A8A";
    return {
      bg: "#E3DCFB",
      skin: s,
      kit: kit("#0E9F8E", { trim: "#A3E635" }) + path("M41.6 49.6Q44.4 57 47.6 64H57.6Q54.6 55.4 50.6 48.8Z", "#0B8577"),
      mid: bat(46, 47.6, 9, "#16A34A"),
      face: { mouth: "grin" },
      top:
        path("M20.2 30.4C19.6 17.4 25 12 32 12S44.4 17.4 43.8 30.4L43.6 34.8C43.4 35.8 42.6 36.2 41.6 36L41.2 27.4C39 25 35.6 24 32 24S25 25 22.8 27.4L22.4 36C21.4 36.2 20.6 35.8 20.4 34.8Z", helmet) +
        path("M18.6 24.4C24 21 40 21 45.4 24.4L45 26.4C39 23.4 25 23.4 19 26.4Z", "#172554") +
        `<circle cx="32" cy="17.4" r="1.9" fill="#22C55E"/>` +
        // The grille, light and low: from the side flaps round under the chin, so the smile shows above it.
        line("M22.6 35.2Q32 41.6 41.4 35.2M23.4 37Q32 45 40.6 37M28 39.2V41.8M32 40V42.8M36 39.2V41.8", "#A9B4C2", 0.85, ` stroke-opacity=".9"`),
      front: battingGlove(46, 48.6, "#16A34A"),
    };
  },
  "fast-bowler": () => {
    const s = SKIN[1];
    const shirt = "#F2635F";
    const lime = "#A3E635";
    return {
      bg: "#FFE9B0",
      skin: s,
      hairBack: flip(path("M36 14.6C43.4 11.4 51 14.6 50.4 22.8 50 28.4 46.4 31.2 45.4 35.8 44.2 30 46.2 25 42.4 21Z", HAIR.black)),
      kit: kit(shirt, { trim: lime, neck: "v" }),
      face: { mouth: "grin", brows: HAIR.black, brow: "focus" },
      top: path(SWEPT, HAIR.black) + `<circle cx="25" cy="15.4" r="1.6" fill="${lime}"/>` + headband("#fff", lime),
      front:
        arm(50.4, 41, s, { sleeve: shirt, band: lime }) +
        // The seam grip: two fingers over the top either side of the seam, the thumb below.
        `<g fill="${s.base}"><rect x="47.4" y="23.4" width="2.6" height="8" rx="1.3"/><rect x="50.8" y="23.2" width="2.6" height="8" rx="1.3"/><ellipse cx="50.4" cy="37" rx="4.2" ry="4.4"/></g>` +
        cricketBall(50.4, 31, 5.2, 90) +
        `<ellipse cx="47.4" cy="35.8" rx="1.5" ry="2.3" fill="${s.base}" transform="rotate(-30 47.4 35.8)"/>`,
    };
  },
  spinner: () => {
    const s = SKIN[4];
    const teal = "#0F766E";
    return {
      bg: "#B9DFD0",
      skin: s,
      kit: kit("#F7F1E3", { trim: teal, neck: "v" }),
      face: { mouth: "smirk", beard: "full", beardColor: HAIR.grey },
      top: both(path("M21.4 27.6C21 25 21.2 23.6 21.8 22.6L24 23.2C23.2 24.6 22.8 26 22.6 27.8Z", HAIR.grey)) + cap(teal, "#0B5F58", "#F7F1E3"),
      front:
        arm(50.6, 41.4, s, { sleeve: "#F7F1E3" }) +
        palm(50.6, 40.2, s) +
        cricketBall(50.8, 33.8, 4.8, -40) +
        // Spin: one swirl round the ball's far side.
        path("M55.6 40.7A8.4 8.4 0 0 0 52.1 26.3A7.2 7.2 0 0 1 54.7 39.4Z", "#fff"),
    };
  },
  wicketkeeper: () => {
    const s = SKIN[0];
    const hijab = "#0F766E";
    const shirt = "#E9A23B";
    // Keeping gloves, palms to the front: big saddle-tan mitts, a darker palm, the thumb out to the side with the webbing to it.
    const tan = "#C98A4B";
    const glove = both(
      `<g transform="matrix(1.1 0 0 1.1 -1.2 -4.2)">` +
        path("M18.2 48.4 16.4 64H5.6L7.6 48.4Z", shirt) +
        path("M19.2 34.6C23.8 32.2 27.4 35.6 25.2 40L19.4 45.6Z", tan) +
        path("M19.4 36.4 23.4 37.8 19.4 42.6Z", "#6E4423") +
        path("M5.4 33.6C5.4 28.6 8.6 26.4 12.4 26.4S19.4 28.6 19.4 33.6V44.4C19.4 47.6 16.6 49.2 12.4 49.2S5.4 47.6 5.4 44.4Z", tan) +
        path("M7.4 37.4Q12.4 35 17.4 37.4V44Q12.4 46.8 7.4 44Z", "#8F5A2E") +
        line("M9.6 28v7M12.4 27.2v7.6M15.2 28v7", "#A86E39", 0.9) +
        `<rect x="6.2" y="46.4" width="12.4" height="3.6" rx="1.2" fill="#16A34A"/>` +
        `</g>`,
    );
    return {
      bg: "#FAD4DA",
      skin: s,
      ears: false,
      kit: kit(shirt, { trim: hijab }),
      face: { mouth: "laugh", eyes: "happy", brows: HAIR.brown },
      top:
        path("M32 12.4C22.4 12.4 18.6 19.6 18.6 27.6 18.6 34.4 19.8 39.6 22 43.8L15.6 50.4C20.6 47.4 26 46.6 32 46.6S43.4 47.4 48.4 50.4L42 43.8C44.2 39.6 45.4 34.4 45.4 27.6 45.4 19.6 41.6 12.4 32 12.4ZM32 17.6C26.2 17.6 22.4 21.4 22.4 27.8 22.4 34.6 26.4 39.4 32 39.4S41.6 34.6 41.6 27.8C41.6 21.4 37.8 17.6 32 17.6Z", hijab, ` fill-rule="evenodd"`) +
        line("M22.6 23.6Q32 15.6 41.4 23.6", "#0B5F58", 1.4) +
        line("M24.6 41.4Q32 45.4 39.4 41.4", "#0B5F58", 1),
      // A catch: the ball in the left glove.
      front: glove + cricketBall(12.4, 41, 3.9, -20),
    };
  },
  "all-rounder": () => {
    const s = SKIN[1];
    const turban = "#1E40AF";
    const shirt = "#15803D";
    return {
      bg: "#FFE3CC",
      skin: s,
      kit: kit(shirt, { trim: "#F97316", neck: "v" }) + flip(path("M41.6 49.6Q44.4 57 47.6 64H57.6Q54.6 55.4 50.6 48.8Z", "#126B33")),
      mid: flip(bat(46, 47.6, 9, "#F97316")),
      face: { mouth: "grin", brows: HAIR.black, beard: "full" },
      top:
        path("M20.6 26C19.8 15.4 25 10.2 32 10.2S44.2 15.4 43.4 26C41 23.6 37.6 21.4 32 23 26.4 21.4 23 23.6 20.6 26Z", turban) +
        line("M22.2 21.4C26 16.4 30 17.4 32 23M41.8 21.4C38 16.4 34 17.4 32 23M24 15.8C28.4 12.4 34.4 12.8 39 15.6", "#14307F", 1.2),
      front:
        flip(battingGlove(46, 48.6, shirt)) +
        arm(51, 41.6, s, { sleeve: shirt }) +
        palm(51, 40.4, s) +
        cricketBall(51.2, 34.2, 4.8) +
        sparkle(57.2, 26.4, 2.4, "#F59E0B") +
        sparkle(47.8, 24.4, 1.6, "#F59E0B"),
    };
  },
  captain: () => {
    const s = SKIN[3];
    const kitC = "#0E7490";
    const gold = "#F5B50A";
    return {
      bg: "#CDEFE6",
      skin: s,
      kit: kit(kitC, { neck: "v" }),
      ears: false,
      face: { mouth: "grin" },
      // A bob from under the cap to the jaw.
      top: both(path("M19.6 24.6C18.8 31 19.2 36.4 21 40 22.8 41 25 40.6 26.4 39.4 23.8 36.8 22.8 32.6 22.8 25.4Z", HAIR.black)) + cap(kitC, "#0A5A70", "#fff"),
      // The cup, held up by its base in her left hand.
      front: flip(
        arm(50, 40.4, s, { sleeve: kitC, lean: 4 }) +
          path("M44.8 18.4H55.2V22.4A5.2 5.2 0 0 1 44.8 22.4Z", gold) +
          line("M44.8 20H43A2.2 2.2 0 0 0 45 24.6M55.2 20H57A2.2 2.2 0 0 1 55 24.6", gold, 1.4) +
          path("M52.6 19.4H54.8V22Q54.6 25.2 53 26 52.6 23.6 52.6 19.4Z", "#fff", ` fill-opacity=".35"`) +
          `<rect x="48.7" y="27.4" width="2.6" height="3.2" fill="#D69A06"/>` +
          `<rect x="45.8" y="30.4" width="8.4" height="4.8" rx="1.2" fill="#B07D04"/>` +
          fist(50, 37.2, s),
      ),
    };
  },
  "gully-cricketer": () => {
    const s = SKIN[2];
    const tee = "#0EA5E9";
    return {
      bg: "#C9F0DF",
      skin: s,
      // Stumps chalked on the wall behind.
      back: flip(line("M8.4 23v19M12.2 23v19M16 23v19M7.8 21.4h4.4M11.6 21.4h4.6", "#C0612F", 1.3, ` stroke-opacity=".75"`)),
      kit: kit(tee) + line("M7.6 56.4Q32 51.6 56.4 56.4", "#fff", 1.6, ` stroke-opacity=".5"`),
      face: { mouth: "grin", eyes: "wink", brows: HAIR.black },
      top:
        both(`<circle cx="21.6" cy="24.4" r="2.6" fill="${HAIR.black}"/><circle cx="22.4" cy="20.6" r="2.4" fill="${HAIR.black}"/>`) +
        path("M20.8 24.4C20.4 16 25.4 12.6 32 12.6S43.6 16 43.2 24.4C40 22 36 21 32 21S24 22 20.8 24.4Z", "#DC2626") +
        path("M28.2 21.4Q32 15.6 35.8 21.4Z", HAIR.black) +
        line("M28.4 19.4h7.2", "#991B1B", 1.1) +
        line("M24 15.4Q32 9.6 40 15.4", "#B91C1C", 0.8),
      // A tennis ball with tape round it, the gully game's ball, up in his left hand.
      front: flip(
        arm(50.4, 41.4, s, { sleeve: tee }) +
          palm(50.4, 40.2, s) +
          `<circle cx="50.6" cy="33.8" r="5.2" fill="#D4EC3D"/>` +
          path("M45.5 32.6Q50.6 30 55.7 32.6L55.8 35.4Q50.6 32.8 45.4 35.4Z", "#DC2626") +
          line("M47.4 31.2 48 34M53.6 31.2 53.2 34", "#991B1B", 0.6),
      ),
    };
  },
  umpire: () => {
    const s = SKIN[1];
    return {
      bg: "#F9CF98",
      skin: s,
      kit:
        kit("#93C5FD", { neck: "polo", trim: "#DBEAFE" }) +
        path("M30.6 48.4H33.4L34 50 33.2 51 34.4 59.4 32 62 29.6 59.4 30.8 51 30 50Z", "#1E3A8A"),
      face: { mouth: "smile", brows: HAIR.grey, moustache: true, beardColor: HAIR.grey, glasses: true },
      top:
        both(path("M21.4 27C21 24.4 21.2 23 21.8 22L24 22.8C23.2 24.2 22.8 25.6 22.6 27.2Z", HAIR.silver)) +
        path("M23.4 20.6C23.2 13.2 27 10.6 32 10.6S40.8 13.2 40.6 20.6Z", "#FFFDF7") +
        `<rect x="23.2" y="17.6" width="17.6" height="3" fill="#1E3A8A"/>` +
        `<ellipse cx="32" cy="21" rx="16.6" ry="3.6" fill="#FFFDF7"/>` +
        line("M15.6 21.6Q32 26.2 48.4 21.6", "#000", 0.8, ` stroke-opacity=".12"`),
      // Out: the finger up.
      front: arm(49.2, 41.4, s, { cover: "#93C5FD", band: "#DBEAFE", lean: 4 }) + pointer(49.2, 37, s, 9),
    };
  },
  striker: () => {
    const s = SKIN[4];
    const red = "#DC2626";
    return {
      bg: "#CDE8FF",
      skin: s,
      kit: kit(red, { num: "9" }),
      face: { mouth: "laugh", eyes: "happy", brows: HAIR.black },
      // Short faded sides, tight curls on top.
      top:
        path("M21.5 27.4C20.9 19.6 25.2 15.4 32 15.4S43.1 19.6 42.5 27.4C41.7 23.6 39.6 21.6 36.4 21.2H27.6C24.4 21.6 22.3 23.6 21.5 27.4Z", HAIR.black, ` fill-opacity=".45"`) +
        dots(HAIR.black, 2.3, [
          [25.4, 19.2],
          [27.8, 16.4],
          [31, 15],
          [34.4, 15.2],
          [37.4, 16.8],
          [39, 19.6],
          [28.6, 19.4],
          [32, 18.2],
          [35.4, 19.4],
        ]),
      front: arm(50, 38.6, s, { sleeve: red }) + fist(50, 35.8, s) + football(14.6, 44.2, 6),
    };
  },
  midfielder: () => {
    const s = SKIN[2];
    const braid = plait(22, 33.4, 20.8, 51, 5.2, 3.2, HAIR.black, "#4A3D36", "#FACC15");
    return {
      bg: "#FCCFE3",
      skin: s,
      kit: kit("#16A34A", { num: "10" }),
      face: { mouth: "grin", brows: HAIR.black },
      top: path("M21.2 28.4C20.4 18.6 25.4 14 32 14S43.6 18.6 42.8 28.4L41.6 28C41.2 23.4 38.6 20.4 32.4 19.4H31.6C25.4 20.4 22.8 23.4 22.4 28Z", HAIR.black) + both(braid),
      // Keeping it up on her shoulder.
      front: football(14.6, 39.6, 6.2),
    };
  },
  defender: () => {
    const s = SKIN[3];
    const navy = "#1E3A8A";
    // An upper arm down his side in its sleeve, to the elbow.
    const upper = path("M23.4 44.4C17.4 45.2 12.6 48.6 10.4 54.4L11.4 57.6Q15.4 58.6 19.4 56.6L21.4 50Z", navy) + line("M11.4 57.6Q15.4 58.6 19.4 56.6", "#fff", 1.3);
    return {
      bg: "#A7F3D0",
      skin: s,
      kit: kit(navy) + both(upper),
      face: { mouth: "smirk", brows: HAIR.black, brow: "arch", moustache: true },
      top: path("M21.6 26.6C21 18.4 25.4 14.6 32 14.6S43 18.4 42.4 26.6C41.6 23 40 21 37.4 20.4 33.8 21.2 30.2 21.2 26.6 20.4 24 21 22.4 23 21.6 26.6Z", HAIR.black, ` fill-opacity=".85"`),
      // Arms crossed, the wall: the lower forearm from his left elbow, its fist on the right upper arm; the upper one over it, its fist on the left.
      front:
        line("M51.6 57.8 22 55.4", s.shade, 6.4) +
        line("M12.6 53.2 43 48.4", s.base, 6.4) +
        fist(44.4, 48.2, s) +
        fist(20.4, 55.6, { base: s.shade, shade: "#6E4228" }) +
        // Heading it clear.
        football(47, 14.6, 5) +
        line("M40.6 19.6l1.8-1.4M42.4 22.4l2.2-.8", "#fff", 1.2),
    };
  },
  goalkeeper: () => {
    const s = SKIN[1];
    const shirt = "#84CC16";
    const orange = "#F97316";
    return {
      bg: "#C9D3FB",
      skin: s,
      kit: kit(shirt, { trim: INK }) + both(path("M27.4 43.7 23.4 44.3C15.6 45.3 9.8 49.4 7 56.2L12.2 57.8C14.2 52.8 18.6 49.6 24.4 48.4Z", "#1F2937")),
      // Save!
      face: { mouth: "shout", brows: HAIR.black, brow: "up" },
      top: `<circle cx="32" cy="12.4" r="4.6" fill="${HAIR.black}"/>` + path(PARTED, HAIR.black),
      front:
        // Her left glove up, palm out; her right one has caught the ball beside her face.
        flip(arm(49.6, 46.4, s, { cover: shirt, lean: 4 })) +
        `<rect x="8.4" y="31" width="12" height="14.2" rx="4.4" fill="${orange}"/>` +
        `<rect x="10.6" y="38" width="7.6" height="5" rx="2" fill="#FDBA74"/>` +
        line("M11.6 31.8v5M14.4 31.4v5.4M17.2 31.8v5", "#C2410C", 0.8) +
        `<rect x="8.8" y="43.4" width="11.2" height="3.4" rx="1" fill="#fff"/>` +
        arm(50, 42.6, s, { cover: shirt, lean: 4 }) +
        `<rect x="42.8" y="21.6" width="14.4" height="17" rx="5" fill="${orange}"/>` +
        football(50, 30.2, 5.8) +
        `<g fill="${orange}">${[45.6, 48.4, 51.2, 54].map((x) => `<rect x="${x}" y="22.2" width="2.4" height="5.4" rx="1.2"/>`).join("")}</g>` +
        `<rect x="43.6" y="37.2" width="12.8" height="3.6" rx="1" fill="#fff"/>`,
    };
  },
  winger: () => {
    const s = SKIN[2];
    const shirt = "#7C3AED";
    return {
      bg: "#FFDCCF",
      skin: s,
      // Away down the wing: leaning into the run, the hair blown back.
      lean: -10,
      // The shirt carried on below the frame, so the lean shows no gap.
      kit: path("M9 61H55V76H9Z", shirt) + kit(shirt, { num: "7" }),
      face: { mouth: "laugh", brows: HAIR.black, brow: "up" },
      // A fade: short at the sides, a quiff on top swept back.
      top:
        path("M21.5 27.4C20.9 19.6 25.2 15.4 32 15.4S43.1 19.6 42.5 27.4C41.7 23.6 39.6 21.6 36.4 21.2H27.6C24.4 21.6 22.3 23.6 21.5 27.4Z", HAIR.black, ` fill-opacity=".45"`) +
        path("M22.6 22.8C22.2 17.4 25.6 13.4 31.2 12.4 35.6 11.6 40 11.8 45.6 13.2L41.4 15.2 46.8 17.4 42 18.8 45.6 21.6 41.8 21.4C38.4 19.8 33.8 19.4 29.4 20 26.6 20.4 24.2 21.4 22.6 22.8Z", HAIR.black) +
        headband("#fff", shirt),
      // Speed lines off his back, and the ball out in front.
      front: line("M42.4 15.6h8.4M44.8 21.6h10M43.8 27.6h7.6M49.4 39.4h8", "#E07B5F", 1.6) + football(12.6, 47.4, 6.2),
    };
  },
  "tennis-player": () => {
    const s = SKIN[4];
    const frame = "#0F766E";
    const grip = "#F97316";
    const shirt = "#14B8A6";
    return {
      bg: "#FFE7B8",
      skin: s,
      kit: kit(shirt, { neck: "polo" }),
      face: { mouth: "grin", brows: HAIR.black },
      // A plait over her shoulder and a white sweatband.
      top: path(SWEPT, HAIR.black) + plait(21.6, 29, 19.6, 46, 5.6, 3.4, HAIR.black, "#4A3D36", grip) + headband("#fff", frame),
      front:
        `<g transform="rotate(18 50.6 21)">` +
        `<defs><clipPath id="rh"><ellipse cx="50.6" cy="21" rx="5.6" ry="7.2"/></clipPath></defs>` +
        `<g clip-path="url(#rh)" stroke="#fff" stroke-opacity=".9" stroke-width=".6">` +
        [46.4, 48.5, 50.6, 52.7, 54.8].map((x) => `<path d="M${x} 13v16"/>`).join("") +
        [15.8, 18.4, 21, 23.6, 26.2].map((y) => `<path d="M44 ${y}h13"/>`).join("") +
        `</g>` +
        `<ellipse cx="50.6" cy="21" rx="6.4" ry="8" fill="none" stroke="${frame}" stroke-width="1.8"/>` +
        line("M48.6 28.6 50.6 34.4 52.6 28.6", frame, 1.5) +
        `<rect x="49.2" y="33.6" width="2.8" height="9" rx="1.2" fill="${grip}"/>` +
        `</g>` +
        arm(47.8, 44.6, s, { sleeve: shirt, band: "#fff", lean: 4 }) +
        fist(47.8, 42, s) +
        tennisBall(14, 22.4, 4),
    };
  },
  "badminton-player": () => {
    const s = SKIN[0];
    const shirt = "#2563EB";
    const red = "#EF4444";
    return {
      bg: "#FBD5C5",
      skin: s,
      kit: kit(shirt, { neck: "v" }),
      face: { mouth: "tongue", brows: HAIR.black, brow: "arch" },
      // Short hair, a few spikes up front, and a sweatband.
      top:
        path("M21.3 28.2C20.4 20.4 22.8 16 26.4 14.4L27.4 11.4 29.8 13.4 32.4 10.6 34 13.4 37.6 11.8 37.8 14.8C41.6 16.4 43.4 21 42.7 28.2L41.7 28C41.3 24.6 40.4 22.6 39 21.4 35 22.8 28.8 22.6 25 20.4 23.6 22.2 22.6 24.8 22.3 28Z", HAIR.black) +
        path("M21.6 22.2Q32 17.6 42.4 22.2L42.6 24.4Q32 19.8 21.4 24.4Z", red),
      front:
        `<g transform="rotate(14 51 18)">` +
        `<ellipse cx="51" cy="18" rx="4.4" ry="5.8" fill="#fff" fill-opacity=".35"/>` +
        line("M48.4 15h5.2M48 18h6M48.4 21h5.2M49.6 12.8v10.4M52.4 12.8v10.4", "#fff", 0.5) +
        `<ellipse cx="51" cy="18" rx="4.4" ry="5.8" fill="none" stroke="${red}" stroke-width="1.3"/>` +
        line("M51 23.8V36", "#94A3B8", 1) +
        `<rect x="49.7" y="35.4" width="2.6" height="7.6" rx="1.1" fill="#1F2937"/>` +
        `</g>` +
        arm(48.8, 45.4, s, { sleeve: shirt, band: red, lean: 4 }) +
        fist(48.8, 43, s) +
        `<g transform="rotate(-38 14 20)">` +
        path("M10.4 13 17.6 13 15.6 21.4H12.4Z", "#fff", EDGE) +
        line("M12.2 13.2 13 21M15.8 13.2 15 21M10.9 16.6H17.1", "#CBD5E1", 0.5) +
        `<rect x="12.2" y="21" width="3.6" height="1.6" fill="#22C55E"/>` +
        path("M12.2 22.6H15.8V23.4A1.8 1.8 0 0 1 12.2 23.4Z", "#F59E0B") +
        `</g>`,
    };
  },
  "pickleball-player": () => {
    const s = SKIN[2];
    const paddle = "#F97316";
    return {
      bg: "#DCEEFF",
      skin: s,
      kit: kit("#EC6A8E", { neck: "polo" }),
      face: { mouth: "laugh", eyes: "happy", brows: HAIR.grey, glasses: true },
      // Grey hair parted in the middle, up in a bun.
      top:
        `<circle cx="32" cy="12.6" r="4.8" fill="${HAIR.grey}"/>` +
        line("M29 10.6q3-2 6 0", "#8A847F", 0.8) +
        path(PARTED, HAIR.grey) +
        line("M32 14.8v4", "#8A847F", 0.8) +
        both(`<circle cx="21.4" cy="31.8" r=".9" fill="#F5B50A"/>`),
      // A lefty: the paddle in her left hand, the ball on her right.
      front: flip(
        `<g transform="rotate(10 49.6 22)">` +
          `<rect x="44.1" y="15.5" width="11" height="13" rx="4.6" fill="${paddle}" stroke="#C2410C" stroke-width="1.1"/>` +
          line("M46.4 18.6Q49.6 17 52.8 18.6", "#fff", 1, ` stroke-opacity=".5"`) +
          `<rect x="48.2" y="28" width="2.8" height="8.6" rx="1.2" fill="#374151"/>` +
          `</g>` +
          arm(47.4, 40.4, s, { sleeve: "#EC6A8E", lean: 4 }) +
          fist(47.4, 37.8, s) +
          `<circle cx="14.4" cy="22.6" r="5" fill="#E4F035"/>` +
          dots("#9DA514", 0.85, [
            [12.8, 21],
            [16.1, 21.2],
            [14.4, 24.2],
            [11.2, 23.8],
            [17.6, 24],
            [14.4, 18.6],
          ]),
      ),
    };
  },
  "table-tennis-player": () => {
    const s = SKIN[3];
    const shirt = "#F87171";
    return {
      bg: "#E9DDFB",
      skin: s,
      kit: kit(shirt, { kid: true, neck: "polo" }),
      face: { mouth: "grin", brows: HAIR.black },
      top: path("M21.2 28.4C20.2 18.4 25 13.6 32 13.6S43.8 18.4 42.8 28.4H41.8C41.6 25 40.8 22.6 39.2 21.2 34.6 20.4 30 19 27.6 16.8 26.6 19.6 24 21.2 22.4 21.8 22.2 23.6 22.2 26 22.2 28.4Z", HAIR.black),
      // The bat at an angle: a light wooden handle, the red face, the black rubber of its back at the edge.
      front:
        `<g transform="rotate(-26 50 31)">` +
        path("M48.6 40V31.4L47.2 29.4H53L51.6 31.4V40Q50.1 41 48.6 40Z", "#E6C08A") +
        line("M50.1 31.6V39", "#C99A5C", 0.7) +
        `<ellipse cx="50.9" cy="23.4" rx="7.4" ry="7.1" fill="${INK}"/>` +
        `<ellipse cx="50.1" cy="23.6" rx="6.8" ry="6.6" fill="#DC2626"/>` +
        line("M45.6 21.4Q46.8 18.2 50 17.4", "#fff", 1, ` stroke-opacity=".45"`) +
        `</g>` +
        arm(50, 45, s, { sleeve: shirt, band: "#fff" }) +
        fist(50, 42.6, s) +
        line("M7 26.4 11.4 23.6M6.6 22 10.6 21", "#fff", 1.1) +
        `<circle cx="14.6" cy="22.2" r="2.6" fill="#FB923C"/>`,
    };
  },
  "padel-player": () => {
    const s = SKIN[1];
    const hair = HAIR.brown;
    const shirt = "#C026D3";
    const face = "M50.6 13.4C55.6 13.4 58 17.2 58 22.2 58 27.6 55 31.6 50.6 31.6S43.2 27.6 43.2 22.2C43.2 17.2 45.6 13.4 50.6 13.4Z";
    return {
      bg: "#CFF3F1",
      skin: s,
      hairBack: path("M20.4 26C19 16 24.4 12.4 32 12.4S45 16 43.6 26C44.6 34 46.6 40 44.4 46.6H19.6C17.4 40 19.4 34 20.4 26Z", hair),
      kit: kit(shirt, { neck: "v" }),
      face: { mouth: "smile", brows: hair },
      top: path("M21.4 28.6C20.4 19 25.4 14.2 32 14.2S43.6 19 42.6 28.6C41.6 23 39 20 34.6 19.2 31.6 21.6 26.4 22.6 22.8 22.8 22.2 24.6 21.8 26.4 21.4 28.6Z", hair),
      // The racket in her left hand.
      front: flip(
        `<g transform="rotate(14 50.6 24)">` +
          path(face, "#BEF264") +
          dots("#3F6212", 0.7, [
            [48, 18],
            [50.6, 17.4],
            [53.2, 18],
            [46.8, 21],
            [49.4, 20.8],
            [51.8, 20.8],
            [54.4, 21],
            [48, 24],
            [50.6, 23.8],
            [53.2, 24],
            [49.4, 26.8],
            [51.8, 26.8],
          ], ` fill-opacity=".55"`) +
          path(face, "none", ` stroke="#3F6212" stroke-width="1.3"`) +
          path("M48.4 31.2 50.6 34.6 52.8 31.2Z", "#3F6212") +
          `<rect x="49.3" y="34" width="2.6" height="8.4" rx="1.1" fill="${INK}"/>` +
          `</g>` +
          arm(48.4, 46.6, s, { sleeve: shirt, band: "#fff", lean: 4 }) +
          fist(48.4, 44.2, s),
      ) + tennisBall(50.4, 22.4, 3.8),
    };
  },
  "basketball-player": () => {
    const s = SKIN[1];
    const navy = "#1E3A8A";
    return {
      bg: "#E3F1C8",
      skin: s,
      kit: tank("#FF6F59", navy, "11", s),
      face: { mouth: "smirk", brows: HAIR.black, beard: "short" },
      top: `<circle cx="32" cy="12.6" r="4.6" fill="${INK}"/>` + path("M21.2 27C20.6 17.2 25.4 13.4 32 13.4S43.4 17.2 42.8 27C40 23.4 36 21.8 32 21.8S24 23.4 21.2 27Z", INK) + line("M28.6 15.6Q32 18.6 35.4 15.6", "#3F3F46", 1),
      // The ball in both hands at his chest, ready to pass.
      front:
        both(arm(41.2, 58.6, s, { cover: s.shade, band: navy, lean: 7 })) +
        `<defs><clipPath id="bb"><circle cx="32" cy="54" r="8.8"/></clipPath></defs>` +
        `<circle cx="32" cy="54" r="8.8" fill="#EA580C"/>` +
        `<g clip-path="url(#bb)" fill="none" stroke="${INK}" stroke-width="1" transform="rotate(18 32 54)">` +
        `<path d="M32 45v18M23 54h18M26 47.4q4.8 6.6-.2 13.2M38 47.4q-4.8 6.6.2 13.2"/>` +
        `</g>` +
        `<ellipse cx="28.4" cy="49.4" rx="2.6" ry="1.4" fill="#fff" fill-opacity=".3" transform="rotate(-30 28.4 49.4)"/>` +
        // Each hand at the ball's side, its fingers spread over the front and the thumb up over the top.
        both(`<ellipse cx="23.2" cy="55.2" rx="2.7" ry="3.8" fill="${s.base}"/>` + line("M24.6 52.2 27.6 51.2M25.2 54.6 28.6 54.4M24.8 57.2 27.8 58M23.6 51.6 25.8 47.8", s.base, 1.8)),
    };
  },
  "volleyball-player": () => {
    const s = SKIN[3];
    const shirt = "#6D28D9";
    return {
      bg: "#FFD0D6",
      skin: s,
      // Curls to her shoulders.
      hairBack: both(
        dots(HAIR.black, 3.4, [
          [20.4, 29],
          [19.2, 33.6],
          [19.8, 38.4],
          [22.2, 42.4],
        ]),
      ),
      kit: kit(shirt, { num: "1" }),
      face: { mouth: "grin", brows: HAIR.black },
      top: curls(HAIR.black, 3.4, 186, 354, 10, 10.8, 25.6) + headband("#FB7185"),
      front:
        flip(arm(48.4, 39.6, s, { sleeve: shirt, band: "#fff", lean: 4 }) + palm(48.4, 37.6, s)) +
        `<defs><clipPath id="vb"><circle cx="15.6" cy="27.4" r="7.2"/></clipPath></defs>` +
        `<circle cx="15.6" cy="27.4" r="7.2" fill="#fff"/>` +
        `<g clip-path="url(#vb)">` +
        path("M15.6 27.4C15.2 22.8 12.6 19.8 8.6 18.6L6.6 22.4C10.4 23.2 13.4 24.8 15.6 27.4Z", "#00A699") +
        path("M15.6 27.4C19.2 25.2 23.2 25.2 25.6 27.6L24.2 31.8C21.8 29.8 18.8 29 15.6 27.4Z", "#22C55E") +
        path("M15.6 27.4C15.2 31.6 12.6 34.8 9 36.6L12.8 38.2C15.2 35.8 16 32.2 15.6 27.4Z", "#00A699") +
        `</g>` +
        `<g clip-path="url(#vb)" fill="none" stroke="#B8C0CC" stroke-width=".6">` +
        `<path d="M15.6 27.4C15.2 22.8 12.6 19.8 8.6 18.6M15.6 27.4C19.2 25.2 23.2 25.2 25.6 27.6M15.6 27.4C15.2 31.6 12.6 34.8 9 36.6"/>` +
        `</g>` +
        `<circle cx="15.6" cy="27.4" r="7.2" fill="none"${EDGE}/>`,
    };
  },
  "frisbee-player": () => {
    const s = SKIN[0];
    const hair = HAIR.brown;
    const shirt = "#22C55E";
    return {
      bg: "#E6D8FF",
      skin: s,
      kit: kit(shirt) + line("M10 52.4Q14 49 18 52.4T26 52.4M38 52.4Q42 49 46 52.4T54 52.4", "#fff", 1.2, ` stroke-opacity=".55"`),
      face: { mouth: "laugh", eyes: "happy", brows: hair },
      top: `<circle cx="23.4" cy="14.8" r="4.4" fill="${hair}"/><circle cx="40.6" cy="14.8" r="4.4" fill="${hair}"/>` + path(PARTED, hair) + headband("#F97316"),
      // A backhand from the left.
      front: flip(
        arm(51.4, 42, s, { sleeve: shirt, band: "#F97316", lean: 4 }) +
          `<g transform="rotate(-28 51.4 30)">` +
          `<ellipse cx="51.4" cy="30" rx="9" ry="3.4" fill="#F97316"/>` +
          `<ellipse cx="51.4" cy="29.3" rx="6.8" ry="2.1" fill="#FB923C"/>` +
          `</g>` +
          fist(50.8, 35.6, s),
      ),
    };
  },
  swimmer: () => {
    const s = SKIN[3];
    const capC = "#2563EB";
    const water = "M0 54.4Q5.4 51 10.8 54.4T21.6 54.4T32.4 54.4T43.2 54.4T54 54.4T64.8 54.4";
    return {
      bg: "#BFE7FC",
      skin: s,
      ears: false,
      kit: shoulders(s) + line("M23.4 44.6Q21.4 49 20.4 56", "#1E3A8A", 1.8) + path(`${water}V64H0Z`, "#38B2EA") + line(water, "#fff", 1.4),
      face: { mouth: "grin", brows: HAIR.black },
      top:
        path("M20.6 28C19.8 16.8 25.2 12.6 32 12.6S44.2 16.8 43.4 28C41 24.2 37 22.4 32 22.4S23 24.2 20.6 28Z", capC) +
        line("M20.8 21.8Q32 17.4 43.2 21.8", "#1E3A8A", 1.4) +
        `<ellipse cx="27.6" cy="19.8" rx="3.2" ry="2.3" fill="#22D3EE" stroke="#1E3A8A" stroke-width="1"/>` +
        `<ellipse cx="36.4" cy="19.8" rx="3.2" ry="2.3" fill="#22D3EE" stroke="#1E3A8A" stroke-width="1"/>` +
        `<ellipse cx="26.8" cy="19.2" rx="1.1" ry=".6" fill="#fff" fill-opacity=".7"/><ellipse cx="35.6" cy="19.2" rx="1.1" ry=".6" fill="#fff" fill-opacity=".7"/>` +
        line("M30.8 19.6q1.2-.8 2.4 0", "#1E3A8A", 1),
      // A wave from the water, splashing.
      front:
        arm(51, 38.6, s, { lean: 3 }) +
        wave(51, 34.6, s) +
        path("M42 55.6Q47.4 52.2 52.8 55.6T63.6 55.6V64H42Z", "#38B2EA") +
        line("M42 55.6Q47.4 52.2 52.8 55.6T63.6 55.6", "#fff", 1.4) +
        dots("#fff", 1, [
          [44.2, 49.4],
          [57.8, 48.6],
          [46.4, 46],
          [56.4, 45],
        ]),
    };
  },
  coach: () => {
    const s = SKIN[4];
    const navy = "#1E3A8A";
    const teal = "#00A699";
    return {
      bg: "#BEEFC9",
      skin: s,
      // Her hair back in a low bun, on the side away from her thumbs up.
      hairBack: flip(path("M19.8 27.6 19.4 34.4Q21 36.4 24 35.2L23.6 28.6Z", HAIR.black) + `<circle cx="23.4" cy="37.6" r="3.8" fill="${HAIR.black}"/>`),
      kit: kit(navy, { neck: "zip" }) + both(line("M26.4 44.2Q19.6 48.2 14.6 57.8", teal, 1.5)),
      face: { mouth: "smile", brows: HAIR.black },
      top:
        path("M21 30C20 18.6 25 13.6 32 13.6S44 18.6 43 30C42.4 25 41.2 22 38.6 20.4 35.4 21.6 29.6 21.8 25.6 19.8 23.4 22 22 25.2 21.6 30Z", HAIR.black) +
        line("M33.6 14.6Q38.6 15.8 40.6 20.8", HAIR.silver, 1.6) +
        both(`<circle cx="21.5" cy="31.8" r="1" fill="#F5B50A"/>`),
      front:
        // The whistle on its lanyard.
        line("M27 44.6Q28.4 51.4 30.8 55.4M37 44.6Q35.6 51.4 30.8 55.4", "#EF4444", 1.2) +
        `<rect x="31" y="54.2" width="8" height="3.4" rx="1" fill="#CBD5E1" stroke="#94A3B8" stroke-width=".8"/>` +
        `<circle cx="31.4" cy="58" r="3.6" fill="#CBD5E1" stroke="#94A3B8" stroke-width=".8"/>` +
        `<rect x="33.4" y="54.9" width="2.2" height="1.4" fill="#64748B"/>` +
        line("M29.4 57.2q.5-1.5 2-1.8", "#fff", 0.7) +
        flip(arm(50.6, 41, s, { cover: navy, band: teal, lean: 4 }) + thumbsUp(50.6, 37.2, s)),
    };
  },
};

/** An avatar's SVG file. */
export function avatarSvg(id: AvatarPresetId): string {
  const p = PLAYERS[id]();
  const preset = AVATAR_PRESETS.find((a) => a.id === id);
  const label = preset ? avatarLabel(preset) : id;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${label}">` +
    `<title>${label}</title><rect width="64" height="64" fill="${p.bg}"/>` +
    (p.back ?? "") +
    (p.lean ? `<g transform="rotate(${p.lean} 32 64)">` : "") +
    (p.hairBack ? `<g transform="${HEAD}">${p.hairBack}</g>` : "") +
    neck(p.skin) +
    p.kit +
    (p.mid ?? "") +
    `<g transform="${HEAD}">${head(p.skin, p.ears !== false)}${face(p.skin, p.face)}${p.top ?? ""}</g>` +
    (p.lean ? `</g>` : "") +
    (p.front ?? "") +
    `</svg>`
  );
}
