import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compileEdges,
  compileFace,
  compileFlight,
  compileToss,
  coinTransform,
  EDGE_SEGS,
  faceOf,
  faceUp,
  poseAt,
  projectedBounds,
  restPose,
  REST_Y,
  seededRandom,
  simTime,
  simulateToss,
  STAGE_H,
  STAGE_W,
  STATUS_H,
  tiltFromFlat,
  turnBetween,
  type Face,
  type Pose,
  type TossFrame,
  type TossSim,
} from "./tossSim";

const FACES: Face[] = ["heads", "tails"];

/** Tosses from varied starting poses: a chain, as on the page, plus fresh starts. */
function* tosses(count: number): Generator<TossSim> {
  for (let seed = 1; seed <= count; seed++) {
    const rand = seededRandom(seed * 7919);
    let rest: Pose = restPose(rand() < 0.5 ? "heads" : "tails", (rand() * 2 - 1) * 5);
    for (let k = 0; k < 3; k++) {
      const face = FACES[(seed + k) % 2 === 0 ? 0 : 1];
      const sim = simulateToss(rand() < 0.5 ? face : FACES[1 - FACES.indexOf(face)], rest, rand);
      yield sim;
      rest = { ...sim.final, th: ((sim.final.th % 360) + 360) % 360 };
    }
  }
}

test("lands on the requested face every time", () => {
  let n = 0;
  for (const sim of tosses(400)) {
    assert.equal(faceOf(sim.final.th), sim.face);
    assert.equal(faceUp(sim.final), sim.face);
    // and never shows the other face once it is down
    for (let t = sim.touchdown; t <= sim.duration; t += 1 / 240) assert.equal(faceUp(poseAt(sim, t)), sim.face, `t=${t}`);
    n++;
  }
  assert.equal(n, 1200);
});

test("settles within the time budget", () => {
  for (const sim of tosses(200)) {
    assert.ok(sim.duration <= 1.95, `duration ${sim.duration}`);
    assert.ok(sim.touchdown >= 1.0 && sim.touchdown <= 1.2, `touchdown ${sim.touchdown}`);
    assert.ok(sim.result <= 1.42, `result ${sim.result}`);
    const f = sim.final;
    assert.equal(f.h, 0);
    assert.equal(tiltFromFlat(f), 0);
    assert.equal(f.dip, 0);
    assert.equal(f.sq, 1);
  }
});

test("the result shows at first settle, 200-250 ms after touchdown", () => {
  for (const sim of tosses(200)) {
    const gap = sim.result - sim.touchdown;
    assert.ok(gap >= 0.2 && gap <= 0.25, `gap ${gap}`);
    // in the air until touchdown
    for (let t = sim.pressEnd + 0.02; t < sim.touchdown - 0.02; t += 0.01) assert.ok(poseAt(sim, t).h > 0, `airborne at ${t}`);
    // by the result it is down: no hop left, no tumble left, nearly flat
    for (let t = sim.result; t <= sim.duration; t += 1 / 240) {
      const p = poseAt(sim, t);
      assert.ok(p.h < 0.5, `height ${p.h} at ${t}`);
      assert.equal(p.th, sim.final.th);
      assert.ok(tiltFromFlat(p) <= 8, `tilt ${tiltFromFlat(p)} at ${t}`);
    }
  }
});

test("rests turned no more than 5 degrees, precessing either way", () => {
  const dirs = new Set<number>();
  for (const sim of tosses(300)) {
    assert.ok(Math.abs(sim.final.psi) <= 5, `psi ${sim.final.psi}`);
    const td = poseAt(sim, sim.touchdown + 1 / 240);
    dirs.add(Math.sign(sim.final.psi - td.psi));
  }
  assert.deepEqual([...dirs].sort(), [-1, 1]);
});

test("the flight stays inside the stage, and below the status once it lands", () => {
  let apex = 0;
  for (const sim of tosses(300)) {
    for (let t = 0; t <= sim.duration; t += 1 / 120) {
      const b = projectedBounds(poseAt(sim, simTime(sim, t)));
      apex = Math.min(apex, b.top);
      assert.ok(b.top >= -REST_Y + 4, `top ${b.top} at ${t}`);
      assert.ok(b.bottom <= STAGE_H - REST_Y, `bottom ${b.bottom} at ${t}`);
      assert.ok(b.left >= -STAGE_W / 2 && b.right <= STAGE_W / 2, `sides ${b.left} ${b.right} at ${t}`);
      if (t >= sim.result || t <= sim.pressEnd) assert.ok(b.top >= STATUS_H - REST_Y + 4, `under the status at ${t}: ${b.top}`);
    }
  }
  // and it does rise: the apex uses most of the headroom
  assert.ok(apex < -(REST_Y - STATUS_H), `apex ${apex}`);
});

test("moves smoothly: no jumps between sim frames", () => {
  for (const sim of tosses(60)) {
    for (let i = 1; i < sim.frames.length; i++) {
      const a = sim.frames[i - 1], b = sim.frames[i];
      assert.ok(Math.abs(b.h - a.h) < 4, `h jump at ${i}`);
      assert.ok(Math.abs(b.x - a.x) < 1, `x jump at ${i}`);
      assert.ok(Math.abs(b.dip - a.dip) < 1, `dip jump at ${i}`);
      // the orientation is continuous, also where the lean turns from tumble into tilt at touchdown
      assert.ok(turnBetween(a, b) < 10, `turn ${turnBetween(a, b)} at ${i}`);
    }
  }
});

test("keyframes: ordered, same transform functions throughout, ending on the final pose", () => {
  const fnList = (s: string) => s.match(/[a-z0-9]+\(/gi)!.join(" ");
  for (const sim of tosses(40)) {
    const c = compileToss(sim);
    assert.equal(c.coin[0].offset, 0);
    assert.equal(c.coin[c.coin.length - 1].offset, 1);
    assert.equal(c.coin[c.coin.length - 1].transform, coinTransform(sim.final));
    const fns = fnList(c.coin[0].transform!);
    for (let i = 1; i < c.coin.length; i++) {
      assert.ok(c.coin[i].offset >= c.coin[i - 1].offset);
      assert.equal(fnList(c.coin[i].transform!), fns);
    }
    assert.ok(c.coin.some((k) => Math.abs(k.offset * c.duration - c.touchdown) < 1), "has the touchdown frame");
    assert.equal(c.edges.length, EDGE_SEGS);
    for (const track of [c.soft, c.contact, ...c.edges, ...c.faces.flatMap((f) => [f.shade, f.lathe, f.glint])]) {
      assert.equal(track[0].offset, 0);
      assert.equal(track[track.length - 1].offset, 1);
      for (const k of track) if (k.opacity != null) assert.ok(k.opacity >= 0 && k.opacity <= 1);
    }
    // lathe turns take the nearest equivalent angle: at most a quarter turn between frames
    for (const f of c.faces) {
      const turns = f.lathe.map((k) => Number(/rotate\((-?[\d.]+)deg\)/.exec(k.transform!)![1]));
      for (let i = 1; i < turns.length; i++) assert.ok(Math.abs(turns[i] - turns[i - 1]) <= 90, `lathe ${turns[i - 1]} -> ${turns[i]}`);
    }
    assert.equal(c.result - c.touchdown >= 200 && c.result - c.touchdown <= 250, true);
  }
});

test("built in parts, the keyframes are the same as built whole", () => {
  for (const sim of tosses(10)) {
    const whole = compileToss(sim);
    assert.deepEqual(compileFlight(sim).coin, whole.coin);
    assert.deepEqual([compileFace(sim, 0), compileFace(sim, 1)], whole.faces);
    const sliced: TossFrame[][] = [];
    for (let k = 0; k < EDGE_SEGS; k += 8) sliced.push(...compileEdges(sim, k, k + 8));
    assert.deepEqual(sliced, whole.edges);
  }
});

test("keyframes stay within budget, so the tap stays quick", () => {
  for (const sim of tosses(20)) {
    const c = compileToss(sim);
    const total = [c.coin, c.soft, c.contact, ...c.edges, ...c.faces.flatMap((f) => [f.shade, f.lathe, f.glint])].reduce((s, t) => s + t.length, 0);
    assert.ok(c.coin.length <= 90, `coin ${c.coin.length}`);
    assert.ok(total <= 1400, `total ${total}`);
  }
});

test("simulating and compiling is cheap", () => {
  const rand = seededRandom(3);
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) compileToss(simulateToss(i % 2 ? "heads" : "tails", restPose("heads"), rand));
  const each = (performance.now() - t0) / 20;
  assert.ok(each < 15, `${each.toFixed(1)} ms per toss`);
});
