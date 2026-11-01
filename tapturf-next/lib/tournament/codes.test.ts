// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { mintTournamentCode, verifyTournamentCode } from "./codes";
import { mintLiveCode, verifyLiveCode } from "../live/codes";

test("minted codes verify with their key only", () => {
  for (let i = 0; i < 200; i++) {
    const c = mintTournamentCode("k1");
    assert.match(c, /^[a-z0-9]{12}$/);
    assert.equal(verifyTournamentCode(c, "k1"), true);
    assert.equal(verifyTournamentCode(c, "k2"), false);
  }
});

test("made-up, malformed and keyless codes are refused", () => {
  assert.equal(verifyTournamentCode("aaaaaaaaaaaa", "k1"), false);
  assert.equal(verifyTournamentCode("AAAAAAAAAAAA", "k1"), false);
  assert.equal(verifyTournamentCode("short", "k1"), false);
  assert.equal(verifyTournamentCode(42, "k1"), false);
  assert.equal(verifyTournamentCode(mintTournamentCode("k1"), null), false);
  assert.throws(() => mintTournamentCode(""));
});

test("a live scorecard's code is not a tournament's, nor the other way", () => {
  let crossed = 0;
  for (let i = 0; i < 500; i++) {
    if (verifyTournamentCode(mintLiveCode("k1"), "k1")) crossed++;
    if (verifyLiveCode(mintTournamentCode("k1"), "k1")) crossed++;
  }
  assert.equal(crossed, 0);
});
