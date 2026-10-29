import { test } from "node:test";
import assert from "node:assert/strict";
import { askChips, openingChips, REVIEWS_CHIP } from "./chips";

test("a turf page opens with what players say, first, and the grid stays even", () => {
  const city = askChips({ label: "Pune", area: "Kothrud", boxCricket: true, pair: ["Hotfut Kharadi", "Kanade Sports"] }, 2);
  assert.equal(city.length, 6);
  const onTurf = openingChips(city, true);
  assert.equal(onTurf[0], REVIEWS_CHIP);
  assert.equal(onTurf.length, 6);
  assert.deepEqual(onTurf.slice(1), city.slice(0, 5));
  // The all-India set (5 or 6) and a set that has the chip already: once, first.
  assert.equal(openingChips(askChips(null, 0), true).length, 6);
  assert.deepEqual(openingChips(["What do players say about it?", "Calculate our NRR"], true), [REVIEWS_CHIP, "Calculate our NRR"]);
  // Anywhere else: the city's chips as they were.
  assert.deepEqual(openingChips(city, false), city);
  assert.equal(REVIEWS_CHIP, "What do players say about it?");
});
