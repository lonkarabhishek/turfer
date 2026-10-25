/**
 * The cricket toss coin, as maths. Pure: no DOM, no clock, randomness passed in.
 *
 * The whole toss is simulated at 240 Hz before it plays, then compiled into
 * keyframes the browser plays on its own, so a busy main thread or a slow
 * phone never changes the timing or the result.
 *
 * Axes follow CSS: x right, y down, z toward the viewer. Angles in degrees.
 * Rotation 0 shows heads, 180 shows tails.
 */

export type Face = "heads" | "tails";

/** Coin size in CSS px. */
export const COIN_D = 176;
export const COIN_R = COIN_D / 2;
export const COIN_T = 14;
export const EDGE_SEGS = 32;

/** We look down at the table a little, from slightly left. */
export const CAM_X = 15;
export const CAM_Y = 7;
export const PERSPECTIVE = 900;
/** Height goes up the screen and toward the camera. */
export const LIFT_Y = 0.62;
export const LIFT_Z = 1.1;
/** Apex height of the throw, px. */
export const APEX = 84;

/**
 * Stage, px. The coin rests low with the whole flight's headroom above it,
 * so it never leaves the card or runs under the sticky header. The status
 * line sits in that headroom and fades out while the coin is up.
 * STAGE_W is the narrowest stage, inside the card on a 320px-wide phone.
 */
export const STAGE_W = 256;
export const STAGE_H = 254;
export const REST_Y = 162;
/** Top band of the stage that holds the status line. */
export const STATUS_H = 68;

const DT = 1 / 240;
const PRESS = 0.09;
/** The result shows this long after first contact, once the slap is done. */
export const RESULT_AFTER_TOUCHDOWN = 0.205;
const SETTLE = 0.72;
/** Slow-motion hang at the apex: the playback clock slows by this much at the top. */
const HANG = 0.3;

/** One instant of the toss. */
export type Pose = {
  /** sideways drift, px */
  x: number;
  /** height above the table, px */
  h: number;
  /** tumble about the coin's horizontal axis */
  th: number;
  /** turn in the table plane */
  psi: number;
  /** wobble about the other axis */
  be: number;
  /** tilt on the table, as an axis-angle vector */
  ax: number;
  ay: number;
  /** thumb press: px down the screen, and squash */
  dip: number;
  sq: number;
};

export type TossSim = {
  face: Face;
  frames: Pose[];
  /** seconds */
  pressEnd: number;
  touchdown: number;
  result: number;
  duration: number;
  final: Pose;
};

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => t * t * (3 - 2 * t);
const mod360 = (a: number) => ((a % 360) + 360) % 360;

export function restPose(face: Face, psi = 0): Pose {
  return { x: 0, h: 0, th: face === "heads" ? 0 : 180, psi, be: 0, ax: 0, ay: 0, dip: 0, sq: 1 };
}

/** Which face a tumble angle shows. */
export function faceOf(th: number): Face {
  const m = mod360(th);
  return m > 90 && m < 270 ? "tails" : "heads";
}

/** Small seeded generator for tests and repeatable runs (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simulate a toss from `from` (the resting pose) that lands on `face`.
 * The result is decided before this is called; the spin rate is solved so
 * the coin touches down a little short of flat on that face.
 */
export function simulateToss(face: Face, from: Pose, rand: () => number): TossSim {
  const frames: Pose[] = [];
  const th0 = mod360(from.th);
  const psi0 = from.psi;
  const Tf = 0.98 + rand() * 0.08; // time in the air
  const g = (8 * APEX) / (Tf * Tf);
  const v0 = (g * Tf) / 2;
  const turns = rand() < 0.5 ? 4 : 5;
  const lean = 24 + rand() * 10; // degrees short of flat at first contact
  const thT = th0 + 360 * turns + (faceOf(th0) === face ? 0 : 180);
  const thL = th0 - 8; // the thumb pitches it back before the flick
  const omega = (thT - lean - thL) / Tf;
  const psiF = (rand() * 2 - 1) * 5; // it settles a little turned, like a real coin
  const dir = rand() < 0.5 ? -1 : 1; // which way it precesses on the table
  const spin = dir * (8 + rand() * 6); // in-plane spin left for the table to stop
  const psiL = psiF - spin;
  const beA = (rand() < 0.5 ? -1 : 1) * (11 + rand() * 6);
  const xA = (rand() * 2 - 1) * 10;

  // 1) Thumb press: the coin dips, squashes a touch and pitches back.
  const np = Math.round(PRESS / DT);
  for (let k = 0; k < np; k++) {
    const e = smooth(k / np);
    frames.push({ x: 0, h: 0, th: th0 - 8 * e, psi: psi0, be: 0, ax: 0, ay: 0, dip: 4 * e, sq: 1 - 0.015 * e });
  }

  // 2) Flight: ballistic height, constant tumble, gentle precession and drift.
  const nf = Math.round(Tf / DT);
  for (let k = 0; k <= nf; k++) {
    const u = k / nf, t = u * Tf, s = Math.sin(Math.PI * u);
    const rel = smooth(clamp(t / 0.06, 0, 1)); // the thumb lets go
    frames.push({
      x: xA * s * s,
      h: v0 * t - 0.5 * g * t * t,
      th: thL + omega * t,
      psi: psi0 + (psiL - psi0) * smooth(u),
      be: beA * s * s,
      ax: 0,
      ay: 0,
      dip: 4 * (1 - rel),
      sq: 1 - 0.015 * (1 - rel),
    });
  }
  frames[frames.length - 1].h = 0;

  // 3) Touchdown. The lean becomes a tilt the table knocks flat (one rock back), the coin
  //    hops once, then settles like Euler's disk: the tilt shrinks as (1-s)^(1/3) while the
  //    wobble speeds up, so it whirrs faster and faster until it lies still.
  const cu = Math.cos(psiL * RAD), su = Math.sin(psiL * RAD);
  const alpha0 = 4.5 + rand() * 2;
  let phi = rand() * TAU, y = 0, vh = v0 * 0.18;
  const ns = Math.round(SETTLE / DT);
  for (let j = 1; j < ns; j++) {
    const t = j * DT;
    vh -= g * DT;
    y += vh * DT;
    if (y <= 0) {
      y = 0;
      vh = Math.abs(vh) > 100 ? -vh * 0.3 : 0;
    }
    const slap = -lean * Math.exp(-t / 0.085) * Math.cos((TAU * t) / 0.24);
    const s = clamp((t - 0.05) / (SETTLE - 0.05), 0, 1);
    const alpha = alpha0 * Math.cbrt(1 - s);
    phi += dir * TAU * 2.6 * Math.pow(Math.max(1 - s, 0.0025), -1 / 6) * DT;
    const w = smooth(clamp((t - 0.04) / 0.22, 0, 1));
    const au = slap * (1 - w) + alpha * Math.cos(phi) * w, av = alpha * Math.sin(phi) * w;
    frames.push({
      x: 0,
      h: y,
      th: thT,
      psi: psiL + spin * (1 - Math.pow(1 - s, 3)),
      be: 0,
      ax: au * cu - av * su,
      ay: au * su + av * cu,
      dip: 0,
      sq: 1,
    });
  }
  const final: Pose = { x: 0, h: 0, th: thT, psi: psiF, be: 0, ax: 0, ay: 0, dip: 0, sq: 1 };
  frames.push(final);

  const touchdown = (np + nf) * DT;
  return {
    face,
    frames,
    pressEnd: np * DT,
    touchdown,
    result: touchdown + RESULT_AFTER_TOUCHDOWN,
    duration: (frames.length - 1) * DT,
    final,
  };
}

/** The pose at sim time t (seconds), linearly between frames. */
export function poseAt(sim: TossSim, t: number): Pose {
  const f = clamp(t / DT, 0, sim.frames.length - 1);
  const i = Math.min(Math.floor(f), sim.frames.length - 2);
  const a = sim.frames[i], b = sim.frames[i + 1], u = f - i;
  const l = (p: number, q: number) => p + (q - p) * u;
  return { x: l(a.x, b.x), h: l(a.h, b.h), th: l(a.th, b.th), psi: l(a.psi, b.psi), be: l(a.be, b.be), ax: l(a.ax, b.ax), ay: l(a.ay, b.ay), dip: l(a.dip, b.dip), sq: l(a.sq, b.sq) };
}

/**
 * Playback clock to sim clock. In the air the clock is warped so the coin
 * hangs a little at the top; press and landing play in real time.
 */
export function simTime(sim: TossSim, t: number): number {
  if (t <= sim.pressEnd || t >= sim.touchdown) return t;
  const Tf = sim.touchdown - sim.pressEnd, u = (t - sim.pressEnd) / Tf;
  return sim.pressEnd + Tf * (u + (HANG * Math.sin(TAU * u)) / TAU);
}

/* ---------------- Rotation maths (3x3, row-major) ---------------- */

type M3 = number[];
type V3 = [number, number, number];
function mul(A: M3, B: M3): M3 {
  const C = new Array<number>(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
}
function rotX(d: number): M3 {
  const c = Math.cos(d * RAD), s = Math.sin(d * RAD);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
function rotY(d: number): M3 {
  const c = Math.cos(d * RAD), s = Math.sin(d * RAD);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
function rotZ(d: number): M3 {
  const c = Math.cos(d * RAD), s = Math.sin(d * RAD);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}
/** Rotation about the unit axis (x, y, 0). */
function rotAxis(x: number, y: number, d: number): M3 {
  const c = Math.cos(d * RAD), s = Math.sin(d * RAD), t = 1 - c;
  return [c + x * x * t, x * y * t, y * s, x * y * t, c + y * y * t, -x * s, -y * s, x * s, c];
}
const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const apply = (M: M3, v: V3): V3 => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];

const CAM = mul(rotY(CAM_Y), rotX(CAM_X));
const LIGHT = norm([-0.5, -0.75, 0.45]);
const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
/** How lit a face is at rest: no shading there. */
const D_REST = dot([CAM[2], CAM[5], CAM[8]], LIGHT);

function tiltOf(p: Pose) {
  const tilt = Math.hypot(p.ax, p.ay);
  return tilt > 1e-6 ? { ux: p.ax / tilt, uy: p.ay / tilt, tilt } : { ux: 1, uy: 0, tilt: 0 };
}

/** The coin's orientation on the table (no camera). */
function bodyMatrix(p: Pose): M3 {
  const { ux, uy, tilt } = tiltOf(p);
  return mul(rotAxis(ux, uy, tilt), mul(rotZ(p.psi), mul(rotY(p.be), rotX(p.th))));
}

/** Which face is up on the table, from the full orientation. */
export function faceUp(p: Pose): Face {
  return bodyMatrix(p)[8] >= 0 ? "heads" : "tails";
}

/** How far the coin turns between two poses, degrees, however the turn is written. */
export function turnBetween(a: Pose, b: Pose): number {
  const A = bodyMatrix(a), B = bodyMatrix(b);
  let tr = 0;
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) tr += A[k * 3 + i] * B[k * 3 + i];
  return Math.acos(clamp((tr - 1) / 2, -1, 1)) / RAD;
}

/** Total tilt of the coin off the table, degrees (0 = flat). */
export function tiltFromFlat(p: Pose): number {
  const z = Math.abs(bodyMatrix(p)[8]);
  return Math.acos(clamp(z, -1, 1)) / RAD;
}

const n2 = (v: number) => (Math.round(v * 100) / 100).toString();
const n4 = (v: number) => (Math.round(v * 10000) / 10000).toString();

/** The coin's CSS transform. Same function list every time, so keyframes interpolate per function. */
export function coinTransform(p: Pose): string {
  const { ux, uy, tilt } = tiltOf(p);
  return (
    `translate3d(${n2(p.x)}px,${n2(-p.h * LIFT_Y + p.dip)}px,${n2(p.h * LIFT_Z)}px) rotateY(${CAM_Y}deg) rotateX(${CAM_X}deg) ` +
    `rotate3d(${n4(ux)},${n4(uy)},0,${n2(tilt)}deg) rotateZ(${n2(p.psi)}deg) rotateY(${n2(p.be)}deg) rotateX(${n2(p.th)}deg) ` +
    `scale3d(${n4(p.sq)},${n4(p.sq)},${n4(p.sq)})`
  );
}

/** Light on one face. Glint offsets are % of the glint layer, which is the size of the coin. */
export type FaceLight = { visible: boolean; glintX: number; glintY: number; glint: number; lathe: number; latheTurn: number; shade: number };
export type Lighting = {
  faces: [FaceLight, FaceLight];
  /** dark overlay opacity per edge facet; null where the facet faces away */
  edges: (number | null)[];
  soft: { x: number; y: number; sx: number; sy: number; o: number };
  contact: { x: number; y: number; s: number; o: number };
};

/** Shade of a tilted face is capped, so tilted metal reads darker, not muddy. */
export const SHADE_MAX = 0.36;

function faceLight(ex: V3, ey: V3, n: V3): FaceLight {
  const d = dot(n, LIGHT), hz = Math.max(0, dot(HALF, n));
  const hx = dot(HALF, ex), hy = dot(HALF, ey);
  return {
    visible: n[2] >= -0.02,
    // a hot spot that slides across the face and flares when it swings through the mirror angle
    glintX: hx * 70,
    glintY: hy * 70,
    glint: 0.9 * Math.pow(hz, 48),
    // the lathe streak always points at the light
    latheTurn: Math.atan2(hy, hx) / RAD + 90,
    lathe: 0.04 + 0.42 * Math.pow(hz, 14),
    shade: clamp((D_REST - d) * 0.9, 0, SHADE_MAX),
  };
}

/** The coin's axes on screen: across the face (ex, ey) and out of heads (ez). */
type Axes = { ex: V3; ey: V3; ez: V3 };
function axesOf(p: Pose): Axes {
  const M = mul(CAM, bodyMatrix(p));
  return { ex: [M[0], M[3], M[6]], ey: [M[1], M[4], M[7]], ez: [M[2], M[5], M[8]] };
}

function facesLight({ ex, ey, ez }: Axes): [FaceLight, FaceLight] {
  return [faceLight(ex, ey, ez), faceLight(ex, [-ey[0], -ey[1], -ey[2]], [-ez[0], -ez[1], -ez[2]])];
}

/** Dark overlay opacity for edge facet i, or null where it faces away. */
function edgeLight({ ex, ey }: Axes, i: number): number | null {
  const a = (i / EDGE_SEGS) * TAU, c = Math.cos(a), s = Math.sin(a);
  const n: V3 = [c * ex[0] + s * ey[0], c * ex[1] + s * ey[1], c * ex[2] + s * ey[2]];
  if (n[2] < -0.1) return null;
  const b = 0.42 + 0.7 * Math.max(0, dot(n, LIGHT)) + 0.5 * Math.pow(Math.max(0, dot(n, HALF)), 28);
  return Math.round(clamp(1 - b, 0, 0.6) * 50) / 50;
}

type Shadows = Pick<Lighting, "soft" | "contact">;
/**
 * The shadow stays on the table: it shrinks and fades as the coin rises, and a tight contact
 * shadow sharpens on landing.
 */
function shadowsOf(p: Pose): Shadows {
  const h = Math.max(0, p.h), hn = Math.min(1, h / APEX), hc = Math.min(h, 12);
  return {
    soft: { x: 5 + p.x * 0.6 + hn * 6, y: 12 + hn * 26, sx: 1 - 0.58 * hn, sy: 1 - 0.7 * hn, o: 1 - 0.68 * hn },
    contact: { x: 2 + p.x * 0.9, y: 6 + hc * 0.6, s: 1 - hc / 60, o: clamp(1 - h / 9, 0, 1) },
  };
}

export function lighting(p: Pose): Lighting {
  const a = axesOf(p);
  return { faces: facesLight(a), edges: Array.from({ length: EDGE_SEGS }, (_, i) => edgeLight(a, i)), ...shadowsOf(p) };
}

/* ---------------- Keyframes ---------------- */

export type TossFrame = { offset: number; transform?: string; opacity?: number };
export type FaceTracks = { shade: TossFrame[]; lathe: TossFrame[]; glint: TossFrame[] };
export type CompiledToss = {
  /** ms on the playback clock */
  duration: number;
  touchdown: number;
  result: number;
  coin: TossFrame[];
  soft: TossFrame[];
  contact: TossFrame[];
  faces: [FaceTracks, FaceTracks];
  edges: TossFrame[][];
};

/** Inline styles for a resting pose: what sits under the animations. */
export type RestStyles = {
  coin: string;
  soft: TossFrame;
  contact: TossFrame;
  faces: [{ shade: TossFrame; lathe: TossFrame; glint: TossFrame }, { shade: TossFrame; lathe: TossFrame; glint: TossFrame }];
  edges: number[];
};

const o3 = (v: number) => Math.round(v * 1000) / 1000;
/**
 * Light layers sit in their own 3D layer of the coin, so each carries its
 * face's placement: front at +t/2, back turned over at -t/2.
 */
export const FACE_PLACE = [`translateZ(${COIN_T / 2}px)`, `rotateX(180deg) translateZ(${COIN_T / 2}px)`];
const latheKf = (f: number, turn: number, o: number, offset: number): TossFrame => ({ offset, transform: `${FACE_PLACE[f]} rotate(${n2(turn)}deg)`, opacity: o3(o) });
const glintAt = (f: number, F: FaceLight) => `${FACE_PLACE[f]} translate(${n2(F.glintX)}%,${n2(F.glintY)}%)`;
const softKf = (L: Shadows, offset: number): TossFrame => ({
  offset,
  transform: `translate(${n2(L.soft.x)}px,${n2(L.soft.y)}px) scale(${n4(L.soft.sx)},${n4(L.soft.sy)})`,
  opacity: o3(L.soft.o),
});
const contactKf = (L: Shadows, offset: number): TossFrame => ({
  offset,
  transform: `translate(${n2(L.contact.x)}px,${n2(L.contact.y)}px) scale(${n4(L.contact.s)})`,
  opacity: o3(L.contact.o),
});

export function restStyles(p: Pose): RestStyles {
  const L = lighting(p);
  const face = (F: FaceLight, f: number) => ({
    shade: { offset: 1, opacity: o3(F.shade) },
    lathe: latheKf(f, F.latheTurn, F.lathe, 1),
    glint: { offset: 1, transform: glintAt(f, F), opacity: o3(F.glint) },
  });
  return {
    coin: coinTransform(p),
    soft: softKf(L, 1),
    contact: contactKf(L, 1),
    faces: [face(L.faces[0], 0), face(L.faces[1], 1)],
    edges: L.edges.map((e) => (e == null ? 0.3 : e)),
  };
}

/** Drop keyframes inside runs of equal values; linear interpolation makes them redundant. */
function squeeze(track: TossFrame[]): TossFrame[] {
  const same = (a: TossFrame, b: TossFrame) => a.transform === b.transform && a.opacity === b.opacity;
  return track.filter((k, i) => i === 0 || i === track.length - 1 || !(same(k, track[i - 1]) && same(k, track[i + 1])));
}

/**
 * Sample the toss on the playback clock: 60 a second for the press and the
 * landing, 30 in the air, where the motion is close to linear between samples
 * (under half a degree off), and the exact moments of release and touchdown.
 * Fewer keyframes keep the tap fast.
 */
function samples(sim: TossSim): { offset: number; p: Pose }[] {
  const D = sim.duration;
  const times: number[] = [];
  const span = (a: number, b: number, hz: number) => {
    const n = Math.max(1, Math.round((b - a) * hz));
    for (let i = 0; i < n; i++) times.push(a + ((b - a) * i) / n);
  };
  span(0, sim.pressEnd, 60);
  span(sim.pressEnd, sim.touchdown, 30);
  span(sim.touchdown, D, 60);
  times.push(D);
  return times.map((t) => ({ offset: Math.min(1, t / D), p: poseAt(sim, simTime(sim, t)) }));
}

/**
 * The toss as keyframes, in parts that can be built one at a time: the coin
 * and its shadow (all it needs to fly), the light on the faces, and the edge
 * facets in slices.
 */
export type CompiledFlight = Omit<CompiledToss, "faces" | "edges">;

export function compileFlight(sim: TossSim): CompiledFlight {
  const coin: TossFrame[] = [], soft: TossFrame[] = [], contact: TossFrame[] = [];
  for (const { offset, p } of samples(sim)) {
    const S = shadowsOf(p);
    coin.push({ offset, transform: coinTransform(p) });
    soft.push(softKf(S, offset));
    contact.push(contactKf(S, offset));
  }
  const ms = (s: number) => Math.round(s * 1000);
  return { duration: ms(sim.duration), touchdown: ms(sim.touchdown), result: ms(sim.result), coin, soft: squeeze(soft), contact: squeeze(contact) };
}

/** The light on one face: 0 is heads, 1 is tails. */
export function compileFace(sim: TossSim, f: 0 | 1): FaceTracks {
  const T: FaceTracks = { shade: [], lathe: [], glint: [] };
  // A hidden face holds its last light (fewer keyframes); turns are unwrapped so they never spin back.
  let last: FaceLight | null = null;
  let lastTurn = 0;
  samples(sim).forEach(({ offset, p }, i) => {
    let F = facesLight(axesOf(p))[f];
    if (!F.visible && last) F = last;
    else if (!F.visible) F = { ...F, glint: 0 };
    last = F;
    let turn = F.latheTurn;
    // the streak has two lobes, so a half turn looks the same: take the nearest one
    if (i > 0) turn = lastTurn + ((((turn - lastTurn) % 180) + 270) % 180) - 90;
    lastTurn = turn;
    T.shade.push({ offset, opacity: o3(F.shade) });
    T.lathe.push(latheKf(f, turn, F.lathe, offset));
    // An unlit glint holds still; when it lights up, the frame before jumps with it (still unlit).
    const g = o3(F.glint);
    const prev = T.glint[T.glint.length - 1];
    const at = glintAt(f, F);
    if (g === 0 && prev && prev.opacity === 0) T.glint.push({ offset, transform: prev.transform, opacity: 0 });
    else {
      if (prev && prev.opacity === 0) prev.transform = at;
      T.glint.push({ offset, transform: at, opacity: g });
    }
  });
  return { shade: squeeze(T.shade), lathe: squeeze(T.lathe), glint: squeeze(T.glint) };
}

/** Edge facets from..to-1. A facet facing away holds its last value. */
export function compileEdges(sim: TossSim, from = 0, to = EDGE_SEGS): TossFrame[][] {
  const edges: TossFrame[][] = Array.from({ length: to - from }, () => []);
  const last = new Array<number>(to - from).fill(0.3);
  for (const { offset, p } of samples(sim)) {
    const a = axesOf(p);
    for (let e = from; e < to; e++) {
      const v = edgeLight(a, e);
      if (v != null) last[e - from] = v;
      edges[e - from].push({ offset, opacity: last[e - from] });
    }
  }
  return edges.map(squeeze);
}

/** Every layer's keyframes at once. */
export function compileToss(sim: TossSim): CompiledToss {
  return { ...compileFlight(sim), faces: [compileFace(sim, 0), compileFace(sim, 1)], edges: compileEdges(sim) };
}

/* ---------------- Projection, for keeping the flight inside the stage ---------------- */

/**
 * Screen-space box of the coin for a pose, in px relative to its resting
 * centre (which is also the perspective origin).
 */
export function projectedBounds(p: Pose) {
  const { ux, uy, tilt } = tiltOf(p);
  const M = mul(CAM, mul(rotAxis(ux, uy, tilt), mul(rotZ(p.psi), mul(rotY(p.be), rotX(p.th)))));
  const tx = p.x, ty = -p.h * LIFT_Y + p.dip, tz = p.h * LIFT_Z;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const z of [-COIN_T / 2, COIN_T / 2]) {
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const v = apply(M, [COIN_R * p.sq * Math.cos(a), COIN_R * p.sq * Math.sin(a), z * p.sq]);
      const k = PERSPECTIVE / (PERSPECTIVE - (v[2] + tz));
      const sx = (v[0] + tx) * k, sy = (v[1] + ty) * k;
      left = Math.min(left, sx);
      right = Math.max(right, sx);
      top = Math.min(top, sy);
      bottom = Math.max(bottom, sy);
    }
  }
  return { left, right, top, bottom };
}
