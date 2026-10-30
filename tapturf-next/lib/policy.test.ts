import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PRIVACY_NOTICE, PRIVACY_UPDATED, privacyNoticeText } from "./policy";

const privacyPage = fs.readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8");

test("policy notice: a new id, so people who dismissed the last one see it", () => {
  assert.notEqual(PRIVACY_NOTICE.id, PRIVACY_NOTICE.earlier.id);
  assert.match(PRIVACY_NOTICE.id, /^\d{4}-\d{2}-\d{2}-/, "named for the date of its change");
  assert.ok(PRIVACY_NOTICE.id.slice(0, 10) <= PRIVACY_UPDATED, "a change the policy's date already covers");
});

test("policy notice: says what changed and links to where the policy says it", () => {
  assert.match(PRIVACY_NOTICE.text, /profile photo or pick a sports avatar/);
  assert.match(PRIVACY_NOTICE.text, /Your picture is public/, "who sees it");
  assert.match(PRIVACY_NOTICE.text, /checked automatically/);
  assert.match(PRIVACY_NOTICE.text, /remove yours any time/, "and how to take it off");
  assert.ok(privacyPage.includes(`id="${PRIVACY_NOTICE.anchor}"`), `the policy has #${PRIVACY_NOTICE.anchor}`);
  // The paragraph it links to says the same, and how to remove it.
  const at = privacyPage.indexOf(`id="${PRIVACY_NOTICE.anchor}"`);
  const paragraph = privacyPage.slice(at, privacyPage.indexOf("</p>", at)).replace(/\s+/g, " ");
  assert.match(paragraph, /Your picture is public/);
  assert.match(paragraph, /checked automatically/);
  assert.match(paragraph, /choose Remove/);
  // The notice it replaced still reaches whoever missed it, with the one before that.
  assert.match(PRIVACY_NOTICE.earlier.text, /Managed by @your-username/);
  assert.match(PRIVACY_NOTICE.earlier.text, /quick game report/);
});

test("policy notice: the notice it replaced still reaches anyone who never dismissed it", () => {
  assert.equal(privacyNoticeText(PRIVACY_NOTICE.earlier.id), PRIVACY_NOTICE.text, "dismissed the last one: only what is new");
  for (const seen of [null, "2026-10-25-cities", "something else"]) {
    const t = privacyNoticeText(seen);
    assert.ok(t.startsWith(PRIVACY_NOTICE.text), "what is new comes first");
    assert.ok(t.endsWith(PRIVACY_NOTICE.earlier.text), `then the earlier notice (${seen})`);
  }
});
