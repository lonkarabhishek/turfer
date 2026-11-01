import { test } from "node:test";
import assert from "node:assert/strict";
import { foldDefault, foldOpen, readFoldMemory, writeFoldMemory } from "./fold";

test("a section opens when something waits, else on its own default", () => {
  assert.equal(foldDefault(false, 0), false);
  assert.equal(foldDefault(true, 0), true);
  assert.equal(foldDefault(false, 3), true);
  assert.equal(foldOpen(false, 2, null), true, "nothing kept: the default");
});

test("the viewer's last choice wins, unless more waits than when they made it", () => {
  assert.equal(foldOpen(true, 0, { open: false, waiting: 0 }), false, "closed a section that opens by default");
  assert.equal(foldOpen(false, 0, { open: true, waiting: 0 }), true, "opened one that starts closed");
  assert.equal(foldOpen(false, 3, { open: false, waiting: 3 }), false, "closed with 3 waiting: still 3, stays closed");
  assert.equal(foldOpen(false, 2, { open: false, waiting: 3 }), false, "fewer waiting now: stays closed");
  assert.equal(foldOpen(false, 4, { open: false, waiting: 3 }), true, "a 4th came in: opens to show it");
  assert.equal(foldOpen(false, 1, { open: false, waiting: 0 }), true, "closed when nothing waited, now one does");
});

test("only a well-formed stored choice counts", () => {
  assert.deepEqual(readFoldMemory(writeFoldMemory({ open: false, waiting: 2 })), { open: false, waiting: 2 });
  for (const raw of [null, "", "yes", "null", "[]", '{"open":"no","waiting":1}', '{"open":true}', '{"open":true,"waiting":-1}', '{"open":true,"waiting":"2"}', "{bad json"]) {
    assert.equal(readFoldMemory(raw), null, String(raw));
  }
});
