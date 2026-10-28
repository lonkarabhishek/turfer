import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PRIVACY_NOTICE, PRIVACY_UPDATED, privacyNoticeText } from "./policy";

const privacyPage = fs.readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8");

test("policy notice: a new id, so people who dismissed the last one see it", () => {
  assert.notEqual(PRIVACY_NOTICE.id, PRIVACY_NOTICE.earlier.id);
  assert.ok(PRIVACY_NOTICE.id.startsWith(PRIVACY_UPDATED), "named for the policy's date");
});

test("policy notice: says what changed and links to where the policy says it", () => {
  assert.match(PRIVACY_NOTICE.text, /Managed by @your-username/);
  assert.match(PRIVACY_NOTICE.text, /Let others find and tag me/, "and how to turn it off");
  assert.match(PRIVACY_NOTICE.text, /name, number and email never show/);
  assert.ok(privacyPage.includes(`id="${PRIVACY_NOTICE.anchor}"`), `the policy has #${PRIVACY_NOTICE.anchor}`);
  // The paragraph it links to says the same.
  const at = privacyPage.indexOf(`id="${PRIVACY_NOTICE.anchor}"`);
  assert.match(privacyPage.slice(at, privacyPage.indexOf("</p>", at)), /Managed by @your-username/);
});

test("policy notice: the notice it replaced still reaches anyone who never dismissed it", () => {
  assert.equal(privacyNoticeText(PRIVACY_NOTICE.earlier.id), PRIVACY_NOTICE.text, "dismissed the last one: only what is new");
  for (const seen of [null, "2026-10-25-cities", "something else"]) {
    const t = privacyNoticeText(seen);
    assert.ok(t.startsWith(PRIVACY_NOTICE.text), "what is new comes first");
    assert.ok(t.endsWith(PRIVACY_NOTICE.earlier.text), `then the earlier notice (${seen})`);
  }
});
