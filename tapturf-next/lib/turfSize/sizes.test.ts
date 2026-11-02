import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  LIMITS,
  MAX_GROUNDS,
  fromFeet,
  groundTitle,
  limitsIn,
  normaliseGrounds,
  problemText,
  readNumber,
  sameGrounds,
  sizeLine,
  toFeet,
  toGroundSizes,
  type Ground,
  type GroundInput,
  type Unit,
} from "./sizes";

type Case = { what: string; unit: Unit; sql?: boolean; grounds: GroundInput[]; ok?: Ground[]; problem?: { ground: number; field: string; why: string } };
const CASES = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "lib/turfSize/cases.json"), "utf8")) as { cases: Case[] }).cases;

test("sizes: every shared case (the database runs the ones in feet too)", () => {
  assert.ok(CASES.length >= 25);
  for (const c of CASES) {
    const r = normaliseGrounds(c.unit, c.grounds);
    if (c.ok) assert.deepEqual(r, { ok: c.ok }, c.what);
    else assert.deepEqual(r, { problem: c.problem }, c.what);
  }
});

test("sizes: feet and metres, to 0.1", () => {
  assert.equal(toFeet(36.6, "m"), 120.1);
  assert.equal(toFeet(120.04, "ft"), 120);
  assert.equal(fromFeet(120.1, "m"), 36.6);
  assert.equal(fromFeet(98.4, "m"), 30, "30 m comes back as 30 m");
  assert.equal(fromFeet(60, "ft"), 60);
  // Every metre value to 0.1 m in the range survives the round trip through feet.
  for (let dm = 92; dm <= 1219; dm++) assert.equal(fromFeet(toFeet(dm / 10, "m"), "m"), dm / 10, `${dm / 10} m`);
  assert.deepEqual(limitsIn("length", "m"), { min: 9.1, max: 121.9 });
  assert.deepEqual(limitsIn("height", "ft"), LIMITS.height);
});

test("sizes: what a box can hold", () => {
  assert.equal(readNumber(""), null);
  assert.equal(readNumber("  "), null);
  assert.equal(readNumber(null), null);
  assert.equal(readNumber(" 120 "), 120);
  assert.equal(readNumber("36,5"), 36.5);
  assert.equal(readNumber("1 20"), 120, "a space typed inside a number");
  assert.ok(Number.isNaN(readNumber("12a") as number));
  assert.ok(Number.isNaN(readNumber("-5") as number), "no minus sign");
  assert.ok(Number.isNaN(readNumber("1e3") as number), "plain numbers only");
  assert.ok(Number.isNaN(readNumber(Infinity) as number));
  assert.ok(Number.isNaN(readNumber({}) as number));
});

test("sizes: the stored value as the page reads it", () => {
  const stored = {
    grounds: [
      { name: "Box 1", sport: "cricket", length_ft: 120, width_ft: 60, height_ft: 40 },
      { name: null, sport: null, length_ft: 90, width_ft: 45, height_ft: null },
    ],
    unit: "m",
    updated_at: "2026-11-02T10:00:00+00:00",
    source: "owner",
  };
  assert.deepEqual(toGroundSizes(stored), { ...stored, grounds: stored.grounds });
  assert.equal(toGroundSizes(null), null);
  assert.equal(toGroundSizes({ grounds: [] }), null, "no grounds is nothing to show");
  assert.equal(toGroundSizes("x"), null);
  // A ground out of the rules is left out, the rest kept; an unknown sport is no sport.
  const mixed = toGroundSizes({
    grounds: [
      { length_ft: 10, width_ft: 5 },
      { length_ft: 60, width_ft: 120 },
      { length_ft: 120, width_ft: 60, height_ft: 200 },
      { length_ft: 120, width_ft: 60, height_ft: "40" },
      { name: "  Main  ", sport: "tennis", length_ft: 150, width_ft: 80 },
    ],
  });
  assert.deepEqual(mixed, { grounds: [{ name: "Main", sport: null, length_ft: 150, width_ft: 80, height_ft: null }], unit: "ft", updated_at: null, source: "owner" });
  const many = toGroundSizes({ grounds: Array.from({ length: 6 }, () => ({ length_ft: 120, width_ft: 60 })) });
  assert.equal(many?.grounds.length, MAX_GROUNDS);
});

test("sizes: lines, titles and sameness", () => {
  const g: Ground = { name: null, sport: null, length_ft: 120.1, width_ft: 60, height_ft: 40 };
  assert.equal(sizeLine(g, "ft"), "120.1 × 60 × 40 ft");
  assert.equal(sizeLine(g, "m"), "36.6 × 18.3 × 12.2 m");
  assert.equal(sizeLine({ ...g, height_ft: null }, "ft"), "120.1 × 60 ft");
  assert.equal(groundTitle(g, 0, 1), "Ground");
  assert.equal(groundTitle(g, 1, 2), "Ground 2");
  assert.equal(groundTitle({ ...g, name: "Box A" }, 0, 2), "Box A");
  assert.ok(sameGrounds([g], [{ ...g }]));
  assert.ok(!sameGrounds([g], [{ ...g, height_ft: null }]));
  assert.ok(!sameGrounds([g], []));
});

test("sizes: the form's words", () => {
  assert.equal(problemText({ ground: 0, field: "length", why: "range" }, "ft"), "Length should be between 30 and 400 ft.");
  assert.equal(problemText({ ground: 0, field: "height", why: "range" }, "m"), "Height should be between 2.4 and 36.6 m.");
  assert.equal(problemText({ ground: 0, field: "width", why: "missing" }, "ft"), "Width is needed.");
  assert.equal(problemText({ ground: 0, field: "length", why: "number" }, "m"), "Length should be a number, like 36.5.");
  assert.equal(problemText({ ground: -1, field: "grounds", why: "count" }, "ft"), "Up to 4 grounds.");
});
