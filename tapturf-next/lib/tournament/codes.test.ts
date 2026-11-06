// Run with: npm run test:tournament
import { test } from "node:test";
import assert from "node:assert/strict";
import { gameTournamentCode, mintTournamentCode, verifyTournamentCode } from "./codes";
import { mintLiveCode, verifyLiveCode } from "../live/codes";
import { TOURNAMENT_CODE_RE } from "./types";

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

test("a game's code: the same every time, verifies, differs per game and per key, never a live code", () => {
  const g1 = "11111111-2222-3333-4444-555555555555";
  const g2 = "11111111-2222-3333-4444-555555555556";
  const c = gameTournamentCode(g1, "k1");
  assert.match(c, TOURNAMENT_CODE_RE);
  assert.equal(gameTournamentCode(g1, "k1"), c);
  assert.equal(gameTournamentCode(g1.toUpperCase(), "k1"), c, "any case of the id");
  assert.equal(verifyTournamentCode(c, "k1"), true);
  assert.equal(verifyTournamentCode(c, "k2"), false);
  assert.notEqual(gameTournamentCode(g2, "k1"), c);
  assert.notEqual(gameTournamentCode(g1, "k2"), c);
  assert.equal(verifyLiveCode(c, "k1"), false);
  assert.throws(() => gameTournamentCode(g1, ""));
  let lives = 0;
  const many = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const code = gameTournamentCode(`00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, "k1");
    many.add(code);
    if (verifyLiveCode(code, "k1")) lives++;
  }
  assert.equal(many.size, 500);
  assert.equal(lives, 0);
});
