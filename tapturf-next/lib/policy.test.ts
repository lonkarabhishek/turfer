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

test("policy notice: the map's use, and where the policy says it", () => {
  assert.match(PRIVACY_NOTICE.text, /When you use the map signed in, we now note which account used it and on which days/);
  assert.match(PRIVACY_NOTICE.text, /Only TapTurf's team sees that/, "who sees it");
  assert.match(PRIVACY_NOTICE.text, /never where you looked on it or your location/, "what is never kept");
  assert.ok(privacyPage.includes(`id="${PRIVACY_NOTICE.anchor}"`), `the policy has #${PRIVACY_NOTICE.anchor}`);
  const at = privacyPage.indexOf(`id="${PRIVACY_NOTICE.anchor}"`);
  const map = privacyPage.slice(at, privacyPage.indexOf("</p>", at)).replace(/\s+/g, " ");
  assert.match(map, /per day/, "counts per day");
  assert.match(map, /never where on the map you looked, your location/, "no location from the map");
  assert.match(map, /If you are signed in, we also keep which account used the map and on which days/, "which account, and when");
  assert.match(map, /whichever cookie choice you make/);
  const page = privacyPage.replace(/\s+/g, " ");
  assert.match(page, /when it last opened the map \(so a reload is not counted as another view\)/, "the browser's note, under Stored on your device");
  assert.match(page, /Records of your map use stay with your account and are deleted with it/, "how long");
});

test("policy notice: the notices it replaced say what changed and link to where the policy says it", () => {
  assert.match(PRIVACY_NOTICE.earlier.text, /up to three photos from your game/);
  assert.match(PRIVACY_NOTICE.earlier.text, /public with your report/, "who sees them");
  assert.match(PRIVACY_NOTICE.earlier.text, /leave out the details your camera adds, such as where a photo was taken/);
  assert.match(PRIVACY_NOTICE.earlier.text, /Anthropic's AI checks each one/, "who checks them");
  assert.match(PRIVACY_NOTICE.earlier.text, /edit your report, or remove the report/, "and how to take one off");
  assert.match(PRIVACY_NOTICE.earlier.text, /Played here \(verified\)”, never which game/);
  assert.match(PRIVACY_NOTICE.earlier.text, /report someone else's review, we keep who reported it and why; only TapTurf's team sees that/);
  // The paragraphs it links to say the same.
  const para = (id: string) => {
    const at = privacyPage.indexOf(`id="${id}"`);
    assert.ok(at >= 0, `the policy has #${id}`);
    return privacyPage.slice(at, privacyPage.indexOf("</p>", at)).replace(/\s+/g, " ");
  };
  const photos = para("review-photos");
  assert.match(photos, /leaves out the details your camera adds, such as where it was taken/);
  assert.match(photos, /checked automatically/);
  assert.match(photos, /public once your report is posted/);
  assert.match(photos, /edit your report and take it out/);
  assert.match(para("report-review"), /Only TapTurf&rsquo;s team sees these/);
  assert.match(para("reports"), /Played here \(verified\)&rdquo;/);
  assert.match(privacyPage.replace(/\s+/g, " "), /checks the photos you add to a report/, "Anthropic, in the list of who handles data");
  // The notices it replaced still reach whoever missed them, and their paragraphs still say it.
  assert.match(PRIVACY_NOTICE.earlier.text, /public profile now shows your TapTurf numbers/);
  assert.match(PRIVACY_NOTICE.earlier.text, /never where or when you played/, "only counts");
  assert.match(PRIVACY_NOTICE.earlier.text, /only you see it/, "the played-with list is private");
  assert.match(PRIVACY_NOTICE.earlier.text, /off until you do/, "and the WhatsApp switch is off until turned on");
  const played = para("played-with");
  assert.match(played, /Only you see your list/);
  assert.match(played, /It is off until you do/);
  assert.match(played, /Turn it off at any time/);
  assert.match(privacyPage.replace(/\s+/g, " "), /Only counts: never which turfs you played at, when, or with whom/, "the profile's numbers, in the policy");
  assert.match(PRIVACY_NOTICE.earlier.text, /profile photo or pick a sports avatar/);
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
