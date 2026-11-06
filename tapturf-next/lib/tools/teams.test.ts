// Run with: npm run test:session
import { test } from "node:test";
import assert from "node:assert/strict";
import { shuffle, splitTeams } from "./teams";

/** mulberry32: the same numbers for the same seed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, rating: (i % 5) + 1 }));

test("a seeded rng deals the same teams every time, and the list passed in is left alone", () => {
  const list = people(10);
  const before = JSON.stringify(list);
  const one = splitTeams(list, 2, "random", seeded(7)).map((t) => t.map((p) => p.name));
  const two = splitTeams(list, 2, "random", seeded(7)).map((t) => t.map((p) => p.name));
  assert.deepEqual(one, two);
  assert.equal(JSON.stringify(list), before);
  const other = splitTeams(list, 2, "random", seeded(8)).map((t) => t.map((p) => p.name));
  assert.notDeepEqual(one, other, "another seed, another deal");
  assert.deepEqual([...one[0], ...one[1]].sort(), list.map((p) => p.name).sort(), "everyone dealt once");
});

test("team sizes differ by at most one", () => {
  for (const n of [1, 2, 3, 7, 11, 12]) {
    for (const count of [2, 3, 4]) {
      const sizes = splitTeams(people(n), count, "random", seeded(n * count)).map((t) => t.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${n} into ${count}`);
      assert.equal(sizes.reduce((s, x) => s + x, 0), n);
    }
  }
});

test("balanced deals strongest first in snake order", () => {
  const list = [5, 4, 3, 2, 1, 1].map((rating, i) => ({ name: `R${i}`, rating }));
  const [a, b] = splitTeams(list, 2, "balanced", seeded(1));
  // Snake: 5 to A, 4 to B, 3 to B, 2 to A, 1 to A, 1 to B.
  assert.deepEqual(a.map((p) => p.rating), [5, 2, 1]);
  assert.deepEqual(b.map((p) => p.rating), [4, 3, 1]);
});

test("shuffle keeps everyone and uses the rng given", () => {
  const xs = [1, 2, 3, 4, 5, 6];
  assert.deepEqual([...shuffle(xs, seeded(3))].sort(), xs);
  assert.deepEqual(shuffle(xs, seeded(3)), shuffle(xs, seeded(3)));
  // rng always 0: each step swaps with the first, a fixed order.
  assert.deepEqual(shuffle(xs, () => 0), [2, 3, 4, 5, 6, 1]);
});
