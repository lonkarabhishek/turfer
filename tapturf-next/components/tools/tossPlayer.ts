/**
 * Plays the cricket toss on the coin that TossCoin renders. Client only.
 *
 * Each toss is simulated and compiled to keyframes (lib/tools/tossSim.ts),
 * then handed to the browser's animation engine, which runs transform and
 * opacity off the main thread. Both possible tosses from the current resting
 * pose are built in small steps from the moment the coin mounts, the coin's
 * own keyframes first, so a tap usually only starts them. The tap starts the
 * coin and its shadow (building them first if it came too soon); the light on
 * the coin joins a part per frame after that, in step with the coin, so no
 * single frame has to take on the whole toss.
 * Touchdown, result and rest follow the coin animation's own clock, with a
 * watchdog on the wall clock so the toss still lands if the animations stall.
 */
import { COIN_R, compileEdges, compileFace, compileFlight, EDGE_SEGS, faceOf, FACE_PLACE, restPose, restStyles, simulateToss, type CompiledFlight, type Face, type Pose, type RestStyles, type TossFrame, type TossSim } from "@/lib/tools/tossSim";
import { createTossSound, type TossSound } from "./tossSound";

export type TossPlayer = {
  /** Start a toss that lands on `face`. Returns ms from the coin's first frame to the result. */
  toss(face: Face): number;
  dispose(): void;
};

export type TossLive = { readonly current: { onResult(face: Face): void; sound: boolean } };

const REDUCED_MS = 360;
/** How far a stalled toss may run past its schedule before it lands anyway. */
const LATE_MS = 250;
/** Edge facets built per step. */
const EDGE_STEP = 4;
/** How long one slice of preparation may run before it lets the page in, ms. */
const SLICE_MS = 6;
/** Where the rim catches the light after landing, from the coin's centre. */
const SPARK_AT = `translate(${Math.round(-0.71 * COIN_R)}px,${Math.round(-0.65 * COIN_R)}px)`;

type Els = {
  /** every 3D layer of the coin; they share one transform */
  coins: HTMLElement[];
  soft: HTMLElement;
  contact: HTMLElement;
  spark: HTMLElement;
  veil: HTMLElement;
  shades: HTMLElement[];
  lathes: HTMLElement[];
  glints: HTMLElement[];
  edges: HTMLElement[];
};

type Run = { face: Face; final: Pose; anims: Animation[]; timers: number[]; reported: boolean };

/**
 * One toss from one resting pose, built a step at a time; each step hands some
 * layers' keyframes to the browser. Until the toss plays they wait idle, so
 * they cost nothing and the resting pose stays on screen. Once it plays, a
 * layer built late starts where the coin is.
 */
type Plan = {
  sim: TossSim | null;
  c: CompiledFlight | null;
  /** inline styles for where it lands, which show once the keyframes end */
  fin: RestStyles | null;
  anims: Animation[];
  /**
   * the same animations by part built, the coin and its shadow first, each with what puts the
   * landing pose under it when it starts
   */
  parts: { anims: Animation[]; under: (r: RestStyles) => void }[];
  /** what is left to build, in order */
  steps: (() => void)[];
  /** how many of the steps build the coin and its shadow */
  flight: number;
  /** the coin and its shadow are built, so it can fly */
  flies: boolean;
  /** the toss is playing */
  live: boolean;
};

function random(): number {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  } catch {
    return Math.random();
  }
}

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function find(root: HTMLElement): Els {
  const all = (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s));
  const q = (s: string) => root.querySelector<HTMLElement>(s)!;
  return {
    coins: all(".toss-coin"),
    soft: q(".toss-sh-soft"),
    contact: q(".toss-sh-contact"),
    spark: q(".toss-spark"),
    veil: q(".toss-veil"),
    shades: all(".toss-shade"),
    lathes: all(".toss-lathe"),
    glints: all(".toss-glint"),
    edges: all(".toss-edge-shade"),
  };
}

function put(el: HTMLElement, k: TossFrame) {
  if (k.transform != null) el.style.transform = k.transform;
  if (k.opacity != null) el.style.opacity = String(k.opacity);
}

// The inline styles for a resting pose, a part of the coin at a time.
function restFlight(e: Els, r: RestStyles) {
  for (const c of e.coins) c.style.transform = r.coin;
  put(e.soft, r.soft);
  put(e.contact, r.contact);
}
function restFace(e: Els, r: RestStyles, i: 0 | 1) {
  put(e.shades[i], r.faces[i].shade);
  put(e.lathes[i], r.faces[i].lathe);
  put(e.glints[i], r.faces[i].glint);
}
function restEdges(e: Els, r: RestStyles, from = 0, to = EDGE_SEGS) {
  for (let i = from; i < to; i++) e.edges[i].style.opacity = String(r.edges[i]);
}
function applyRest(e: Els, r: RestStyles) {
  restFlight(e, r);
  restFace(e, r, 0);
  restFace(e, r, 1);
  restEdges(e, r);
}

/** Start an animation in step with the coin's, which is already moving. */
function join(a: Animation, coin: Animation) {
  if (coin.startTime != null) a.startTime = coin.startTime;
  else {
    a.currentTime = coin.currentTime;
    a.play();
  }
}

const small = (p: Pose): Pose => ({ ...p, th: ((p.th % 360) + 360) % 360 });

export function createTossPlayer(root: HTMLElement, live: TossLive): TossPlayer {
  const e = find(root);
  let rest = restPose("heads");
  let run: Run | null = null;
  // Both outcomes from the current resting pose, being built or ready.
  let ready: { rest: Pose; plans: Partial<Record<Face, Plan>> } | null = null;
  let prepareJob = 0;
  let idleTimer = 0;
  let idleAnim: Animation | null = null;
  let sound: TossSound | null = null;

  const planFor = (face: Face, from: Pose): Plan => {
    const p: Plan = { sim: null, c: null, fin: null, anims: [], parts: [], steps: [], flight: 0, flies: false, live: false };
    // `like` shares another layer's keyframes, already parsed, instead of parsing the same ones again
    const add = (el: HTMLElement, k: Keyframe[], o: KeyframeEffectOptions = { duration: p.c!.duration, easing: "linear" }, like?: AnimationEffect | null) => {
      const fx = like instanceof KeyframeEffect ? new KeyframeEffect(like) : new KeyframeEffect(el, k, o);
      fx.target = el;
      const a = new Animation(fx, document.timeline);
      if (p.live) join(a, p.anims[0]);
      p.anims.push(a);
      p.parts[p.parts.length - 1].anims.push(a);
      return a;
    };
    const part = (build: () => void, under: (r: RestStyles) => void) => () => {
      p.parts.push({ anims: [], under });
      build();
      if (p.live) under(p.fin!);
    };
    p.steps.push(
      () => (p.sim = simulateToss(face, from, random)),
      () => (p.c = compileFlight(p.sim!)),
      () => (p.fin = restStyles(small(p.sim!.final))),
      part(
        () => {
          let like: AnimationEffect | null = null;
          for (const coin of e.coins) like = add(coin, p.c!.coin, undefined, like).effect;
          add(e.soft, p.c!.soft);
          add(e.contact, p.c!.contact);
          p.flies = true;
        },
        (r) => restFlight(e, r),
      ),
    );
    p.flight = p.steps.length;
    p.steps.push(
      part(
        () => {
          const f = compileFace(p.sim!, 0);
          add(e.shades[0], f.shade);
          add(e.lathes[0], f.lathe);
          add(e.glints[0], f.glint);
        },
        (r) => restFace(e, r, 0),
      ),
      part(
        () => {
          const f = compileFace(p.sim!, 1);
          add(e.shades[1], f.shade);
          add(e.lathes[1], f.lathe);
          add(e.glints[1], f.glint);
          // a glint catches the rim just after it lands
          add(
            e.spark,
            [
              { transform: `${SPARK_AT} scale(.2) rotate(0deg)`, opacity: 0 },
              { transform: `${SPARK_AT} scale(1.1) rotate(45deg)`, opacity: 1, offset: 0.45 },
              { transform: `${SPARK_AT} scale(.3) rotate(90deg)`, opacity: 0 },
            ],
            { duration: 620, delay: p.c!.touchdown + 230, easing: "ease-out" },
          );
        },
        (r) => restFace(e, r, 1),
      ),
    );
    for (let k = 0; k < EDGE_SEGS; k += EDGE_STEP) {
      p.steps.push(
        part(
          () => compileEdges(p.sim!, k, k + EDGE_STEP).forEach((kf, j) => add(e.edges[k + j], kf)),
          (r) => restEdges(e, r, k, k + EDGE_STEP),
        ),
      );
    }
    return p;
  };

  const drop = () => {
    if (ready) for (const p of Object.values(ready.plans)) p?.anims.forEach((a) => a.cancel());
    ready = null;
  };
  const cancelPrepare = () => {
    clearTimeout(prepareJob);
    prepareJob = 0;
  };
  // Starts at once rather than when the page is idle, in slices short enough not to hold up a tap.
  const prepare = () => {
    cancelPrepare();
    drop();
    if (reducedMotion()) return;
    const from = rest;
    const heads = planFor("heads", from), tails = planFor("tails", from);
    ready = { rest: from, plans: { heads, tails } };
    // both coins first, then the light on them, a face at a time
    const order: Plan[] = [];
    for (const q of [heads, tails]) for (let i = 0; i < q.flight; i++) order.push(q);
    for (let i = heads.flight; i < heads.steps.length; i++) order.push(heads, tails);
    const work = () => {
      prepareJob = 0;
      if (rest !== from || run) return;
      const t0 = performance.now();
      do order.shift()!.steps.shift()?.();
      while (order.length && performance.now() - t0 < SLICE_MS);
      if (order.length) prepareJob = window.setTimeout(work, 0);
    };
    prepareJob = window.setTimeout(work, 0);
  };

  const stopIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = 0;
    if (idleAnim) {
      idleAnim.onfinish = null;
      idleAnim.cancel();
      idleAnim = null;
    }
  };

  // A slow catch of light across the resting coin every few seconds. Finite, rescheduled.
  const startIdle = (delay: number) => {
    stopIdle();
    if (reducedMotion()) return;
    idleTimer = window.setTimeout(() => {
      const up = faceOf(rest.th) === "heads" ? 0 : 1;
      const r = restStyles(rest).faces[up].glint;
      const place = FACE_PLACE[up];
      const a = e.glints[up].animate(
        [
          { offset: 0, transform: r.transform, opacity: r.opacity },
          { offset: 0.25, transform: `${place} translate(-42%,-45%)`, opacity: 0.16 },
          { offset: 0.55, transform: `${place} translate(8%,10%)`, opacity: 0.42 },
          { offset: 0.8, transform: `${place} translate(42%,46%)`, opacity: 0 },
          { offset: 0.9, transform: r.transform, opacity: 0 },
          { offset: 1, transform: r.transform, opacity: r.opacity },
        ],
        { duration: 1800, easing: "ease-in-out" },
      );
      idleAnim = a;
      a.onfinish = () => {
        idleAnim = null;
        startIdle(4000 + random() * 2000);
      };
    }, delay);
  };

  const stop = (r: Run) => {
    r.anims.forEach((a) => a.cancel());
    r.timers.forEach(clearTimeout);
    r.anims = [];
    r.timers = [];
    if (run === r) run = null;
  };

  // Land the toss on its final pose now. The final pose is already the inline style under the
  // keyframes, so cancelling them shows it.
  const settle = (r: Run) => {
    stop(r);
    rest = r.final;
    applyRest(e, restStyles(rest));
    if (!r.reported) {
      r.reported = true;
      live.current.onResult(r.face);
    }
    startIdle(2500);
    prepare();
  };

  const toss = (face: Face): number => {
    if (face !== "heads" && face !== "tails") throw new Error("face must be 'heads' or 'tails'");
    if (run) {
      sound?.hush();
      settle(run); // a second toss lands the first
    }
    stopIdle();
    cancelPrepare();
    // the toss built for this face, if it starts from where the coin lies now; the other one goes
    const plans = ready?.plans ?? {};
    const made = ready?.rest === rest && !reducedMotion() ? plans[face] : undefined;
    ready = null;
    for (const q of Object.values(plans)) if (q !== made) q?.anims.forEach((a) => a.cancel());
    if (live.current.sound && !sound) sound = createTossSound();
    const snd = live.current.sound ? sound : null;

    if (reducedMotion()) {
      // No tumbling: a white veil fades over the coin, it turns over underneath, the veil lifts.
      // The turn waits for the veil's own clock to reach full cover, so a slow phone never shows it.
      const r: Run = { face, final: { ...rest, th: face === "heads" ? 0 : 180 }, anims: [], timers: [], reported: false };
      run = r;
      const fade = (from: number, to: number, delay = 0) =>
        e.veil.animate([{ opacity: from, easing: "ease-in-out" }, { opacity: to }], { duration: REDUCED_MS * 0.3, delay, fill: "both" });
      const cover = fade(0, 1);
      r.anims.push(cover);
      let turned = false;
      const turn = () => {
        if (run !== r || turned) return;
        turned = true;
        applyRest(e, restStyles(r.final));
        // held fully up a moment, then lifted; the cover goes in the same frame, so the veil never dips
        const lift = fade(1, 0, REDUCED_MS * 0.4);
        cover.cancel();
        r.anims.push(lift);
        lift.finished.then(() => run === r && settle(r)).catch(() => {});
      };
      cover.finished.then(turn).catch(() => {});
      // the watchdog, in case the veil's clock stalls
      r.timers.push(
        window.setTimeout(() => {
          turn();
          if (run === r) settle(r);
        }, REDUCED_MS + LATE_MS),
      );
      snd?.ting((REDUCED_MS * 0.3) / 1000, 0.3);
      return REDUCED_MS;
    }

    // The coin and its shadow start now, built first if they are not ready yet.
    const p = made ?? planFor(face, rest);
    while (!p.flies) p.steps.shift()!();
    const sim = p.sim!, c = p.c!;
    const r: Run = { face, final: small(sim.final), anims: p.anims, timers: [], reported: false };
    run = r;
    p.live = true;
    // Each part starts over its landing pose, which shows once its keyframes end.
    const [flight, ...waiting] = p.parts;
    flight.under(p.fin!);
    for (const a of flight.anims) a.play();
    const coin = flight.anims[0];
    // Then the light on it, a part per frame once the coin is moving, so no one frame takes on the
    // whole toss: the parts already built start where the coin is, the others are built and join it.
    const later = [
      ...waiting.map((q) => () => {
        q.under(p.fin!);
        q.anims.forEach((a) => join(a, coin));
      }),
      ...p.steps,
    ];
    p.steps = [];
    const next = () => {
      if (run !== r) return;
      later.shift()?.();
      if (later.length) soon();
    };
    // after each frame, in a task of its own, so a part's script and its first frame never add up
    const soon = () => requestAnimationFrame(() => run === r && r.timers.push(window.setTimeout(next, 0)));
    coin.ready.then(() => run === r && soon()).catch(() => {});

    // Each moment follows the coin's own clock, which starts a frame or more after the tap.
    // If that clock stalls, the watchdog lands it anyway, at most LATE_MS after the tap's
    // schedule. A paused toss (devtools, frame capture) waits until it plays on.
    const tap = performance.now();
    const at = (ms: number, fn: () => void) => {
      const check = () => {
        if (run !== r) return;
        if (coin.playState === "paused") {
          r.timers.push(window.setTimeout(check, 250));
          return;
        }
        // a finished coin holds its clock at the end, so count it as caught up there
        const behind = Math.min(ms, c.duration) - Number(coin.currentTime ?? ms);
        const late = performance.now() - tap - ms;
        if (behind > 4 && late < LATE_MS) r.timers.push(window.setTimeout(check, Math.min(behind, LATE_MS - late)));
        else fn();
      };
      r.timers.push(window.setTimeout(check, ms));
    };
    at(c.touchdown, () => {
      try {
        navigator.vibrate?.(14);
      } catch {
        /* not supported */
      }
    });
    at(c.result, () => {
      r.reported = true;
      live.current.onResult(face);
    });
    // the watchdog: lands on the clock even if the keyframes stall
    at(c.duration + 80, () => settle(r));

    if (snd) {
      // queued once the coin's first frame is out, so the ting lands with it
      coin.ready
        .then(() => {
          if (run !== r) return;
          snd.click(sim.pressEnd, 5200, 0.12);
          snd.ting(sim.touchdown, 0.5);
          snd.ting(sim.touchdown + 0.2, 0.14);
          snd.ting(sim.touchdown + 0.32, 0.05);
        })
        .catch(() => {});
    }
    return c.result;
  };

  startIdle(2500);
  prepare();

  return {
    toss,
    dispose() {
      if (run) stop(run);
      stopIdle();
      cancelPrepare();
      drop();
      sound?.close();
      sound = null;
    },
  };
}
