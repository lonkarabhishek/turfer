import { test } from "node:test";
import assert from "node:assert/strict";
import { createGate } from "./fetchGate";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("the first call goes alone, after the session check; the rest follow a few at a time", async () => {
  const events: string[] = [];
  let active = 0;
  let peak = 0;
  let peakBeforeFirstDone = 0;
  let firstDone = false;
  const gate = createGate(2, async () => {
    events.push("session check");
    await sleep(10);
  });
  const call = (name: string, ms: number) =>
    gate(async () => {
      active++;
      peak = Math.max(peak, active);
      if (!firstDone) peakBeforeFirstDone = Math.max(peakBeforeFirstDone, active);
      events.push(`start ${name}`);
      await sleep(ms);
      active--;
      if (name === "claims") firstDone = true;
      return name;
    });
  // The five calls the admin home makes once it is on screen.
  const out = await Promise.all([call("claims", 20), call("photos", 10), call("covers", 10), call("reviews", 10), call("listing", 10)]);
  assert.deepEqual(out, ["claims", "photos", "covers", "reviews", "listing"]);
  assert.equal(events[0], "session check");
  assert.equal(events[1], "start claims");
  assert.equal(peakBeforeFirstDone, 1, "nothing else runs while the first call (the one that may refresh) is in flight");
  assert.equal(peak, 2);
});

test("a failing session check or first call doesn't stop the rest", async () => {
  const gate = createGate(2, async () => {
    throw new Error("no session");
  });
  const first = gate(async () => {
    throw new Error("first failed");
  });
  const second = gate(async () => "second");
  await assert.rejects(first, /first failed/);
  assert.equal(await second, "second");
  // Later calls, long after the first, run at once.
  assert.equal(await gate(async () => "third"), "third");
});

test("without a session check the first call still goes alone", async () => {
  let running = 0;
  let peak = 0;
  const gate = createGate(3);
  const job = () =>
    gate(async () => {
      running++;
      peak = Math.max(peak, running);
      await sleep(5);
      running--;
    });
  const first = job();
  const rest = [job(), job(), job()];
  await first;
  assert.equal(peak, 1);
  await Promise.all(rest);
  assert.equal(peak, 3);
});
