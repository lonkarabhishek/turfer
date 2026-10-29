import { test } from "node:test";
import assert from "node:assert/strict";
import { liveCodeGen, mintLiveCode, tagLiveCode, verifyLiveCode } from "./codes";
import { LIVE_CODE_RE } from "./types";

const KEY = "a".repeat(64);
const OTHER = "b".repeat(64);

test("minted codes are 12 base36 characters and verify with their key", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const code = mintLiveCode(KEY);
    assert.match(code, LIVE_CODE_RE);
    assert.ok(verifyLiveCode(code, KEY), code);
    seen.add(code);
  }
  assert.equal(seen.size, 500);
});

test("the tag is fixed by the random part and the key", () => {
  assert.equal(tagLiveCode("abcd1234", KEY), tagLiveCode("abcd1234", KEY));
  assert.match(tagLiveCode("abcd1234", KEY), LIVE_CODE_RE);
  assert.notEqual(tagLiveCode("abcd1234", KEY), tagLiveCode("abcd1234", OTHER));
  assert.notEqual(tagLiveCode("abcd1234", KEY), tagLiveCode("abcd1235", KEY));
});

test("a changed tag character is refused", () => {
  const code = tagLiveCode("k3x9p2qa", KEY);
  for (let i = 8; i < 12; i++) {
    const c = code[i] === "z" ? "y" : "z";
    assert.equal(verifyLiveCode(code.slice(0, i) + c + code.slice(i + 1), KEY), false);
  }
});

test("a changed random character is refused (the tag no longer fits)", () => {
  const code = tagLiveCode("k3x9p2qa", KEY);
  let refused = 0;
  for (let i = 0; i < 8; i++) {
    const c = code[i] === "0" ? "1" : "0";
    if (!verifyLiveCode(code.slice(0, i) + c + code.slice(i + 1), KEY)) refused++;
  }
  // Fixed inputs, so this is exact, not a matter of luck.
  assert.equal(refused, 8);
});

test("another key's codes are refused", () => {
  for (let i = 0; i < 50; i++) assert.equal(verifyLiveCode(mintLiveCode(OTHER), KEY), false);
  assert.equal(verifyLiveCode(tagLiveCode("k3x9p2qa", KEY), ""), false);
});

test("anything not shaped like a code is refused", () => {
  const good = tagLiveCode("k3x9p2qa", KEY);
  for (const bad of [good.toUpperCase(), good.slice(0, 11), `${good}0`, ` ${good.slice(1)}`, good.replace(/.$/, "-"), "", null, undefined, 123, {}]) {
    assert.equal(verifyLiveCode(bad, KEY), false, String(bad));
  }
});

test("new codes carry the second tag; codes with the first still verify (links from before the login check)", () => {
  for (let i = 0; i < 200; i++) assert.equal(liveCodeGen(mintLiveCode(KEY), KEY), 2);
  const old = tagLiveCode("k3x9p2qa", KEY, 1);
  const now = tagLiveCode("k3x9p2qa", KEY, 2);
  assert.notEqual(old, now, "the generations tag the same characters differently");
  assert.equal(liveCodeGen(old, KEY), 1);
  assert.equal(liveCodeGen(now, KEY), 2);
  assert.ok(verifyLiveCode(old, KEY) && verifyLiveCode(now, KEY));
  assert.equal(tagLiveCode("k3x9p2qa", KEY), now, "the second by default");
  // Another key's codes of either generation, and anything not a code, have none.
  assert.equal(liveCodeGen(tagLiveCode("k3x9p2qa", OTHER, 1), KEY), null);
  assert.equal(liveCodeGen(tagLiveCode("k3x9p2qa", OTHER, 2), KEY), null);
  for (const bad of [old.toUpperCase(), old.slice(0, 11), "", null, 7]) assert.equal(liveCodeGen(bad, KEY), null, String(bad));
  assert.equal(liveCodeGen(old, ""), null);
});

test("a changed tag character of a first generation code is refused too", () => {
  const code = tagLiveCode("k3x9p2qa", KEY, 1);
  for (let i = 8; i < 12; i++) {
    const c = code[i] === "z" ? "y" : "z";
    assert.equal(verifyLiveCode(code.slice(0, i) + c + code.slice(i + 1), KEY), false);
  }
});

test("minting without a key throws", () => {
  assert.throws(() => mintLiveCode(""));
});
