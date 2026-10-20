import { test } from "node:test";
import assert from "node:assert/strict";
import { mintLiveCode, tagLiveCode, verifyLiveCode } from "./codes";
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

test("minting without a key throws", () => {
  assert.throws(() => mintLiveCode(""));
});
