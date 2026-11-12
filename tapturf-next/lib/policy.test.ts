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

test("policy notice: booking requests, and where the policy says it", () => {
  assert.equal(
    PRIVACY_NOTICE.text,
    "On turfs that take booking requests on TapTurf, you can now ask for a free hour. When you send one, that turf's owner and managers see your name, your number and your note, so they can confirm it and reach you; nobody else does. You pay at the turf; nothing is paid on TapTurf.",
  );
  assert.equal(PRIVACY_NOTICE.anchor, "booking-requests");
  assert.match(PRIVACY_NOTICE.id, /-booking-requests$/);
  const at = privacyPage.indexOf(`id="${PRIVACY_NOTICE.anchor}"`);
  assert.ok(at >= 0, `the policy has #${PRIVACY_NOTICE.anchor}`);
  const para = privacyPage.slice(at, privacyPage.indexOf("</p>", at)).replace(/\s+/g, " ");
  assert.match(para, /If you send a booking request\./);
  assert.match(para, /your name and the phone number on your account \(you need one confirmed with a one-time code\)/, "what is kept");
  assert.match(para, /waiting, confirmed, declined, cancelled or expired, who changed it, and the turf&rsquo;s reason/, "what became of it");
  assert.match(para, /we never email or text about it/);
  assert.match(para, /The turf gets an in-app notification when you send a request or cancel a confirmed booking, and you get one when the turf confirms, declines or cancels it/, "who is told when");
  assert.match(para, /Nothing is paid on TapTurf: you pay at the turf\./);
  assert.match(para, /If you run a turf, we keep whether you turned requests on and each answer you give\./);
  const page = privacyPage.replace(/\s+/g, " ");
  assert.match(page, /we pass your name, your number and your note to the people who run that turf on myTapturf \(its owner and managers\), and to no one else/, "who sees it, under Venues");
  assert.match(page, /They see them while the request waits for an answer and, once confirmed, until its hours end; the notifications they get about it don&rsquo;t name you\./);
  assert.match(page, /You pay the venue directly for any booking\./, "what we do not collect");
  assert.match(page, /players see your turf&rsquo;s answer and the reason you give, never your name or number/);
  assert.doesNotMatch(page, /We don&rsquo;t pass your details to turf owners/, "the old Venues line is gone");
  assert.match(page, /A booking request stays with your account and is deleted with it, or sooner if you ask\./, "how long");
  assert.doesNotMatch(page, /(doesn|don)&rsquo;t take bookings/);
});

test("policy notice: the map's use (the notice before), and where the policy says it", () => {
  assert.match(PRIVACY_NOTICE.earlier.text, /When you use the map signed in, we now note which account used it, on which days and when \(the first and last time each day\)/);
  assert.match(PRIVACY_NOTICE.earlier.text, /Only TapTurf's team sees that/, "who sees it");
  assert.match(PRIVACY_NOTICE.earlier.text, /never where you looked on it or your location/, "what is never kept");
  assert.equal(PRIVACY_NOTICE.earlier.id, "2026-11-02-map", "the map notice's id, so those who dismissed it see only what is new");
  assert.ok(privacyPage.includes(`id="map"`), "the policy has #map");
  const at = privacyPage.indexOf(`id="map"`);
  const map = privacyPage.slice(at, privacyPage.indexOf("</p>", at)).replace(/\s+/g, " ");
  assert.match(map, /per day/, "counts per day");
  assert.match(map, /never where on the map you looked, your location/, "no location from the map");
  assert.match(map, /If you are signed in, we also keep which account used the map, on which days and when \(the first and last time each day\)/, "which account, and when");
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

test("policy: notifications on your phone say what is kept, who carries them and how to stop them", () => {
  const at = privacyPage.indexOf('id="push"');
  assert.ok(at >= 0, "the policy has #push (the Me tab's switch links to it)");
  const push = privacyPage.slice(at, privacyPage.indexOf("</p>", at)).replace(/\s+/g, " ");
  assert.match(push, /push address/);
  assert.match(push, /two keys/);
  assert.match(push, /the kind of device/);
  assert.match(push, /nothing else about it/);
  assert.match(push, /encrypted so the service cannot read it/);
  assert.match(push, /Turn the switch off, or log out on that phone, and we stop sending there/);
  const page = privacyPage.replace(/\s+/g, " ");
  assert.match(page, /Apple, Google, Mozilla and Microsoft, whose push services carry notifications/, "the push services, in the list of who handles data");
  assert.match(page, /a small TapTurf script \(a service worker\)/, "the worker, under what the device keeps");
  assert.match(page, /push address and keys stay with your account, marked off/, "and how long they are kept");
});

test("policy notice: the notice it replaced still reaches anyone who never dismissed it", () => {
  assert.equal(privacyNoticeText(PRIVACY_NOTICE.earlier.id), PRIVACY_NOTICE.text, "dismissed the last one: only what is new");
  for (const seen of [null, "2026-10-25-cities", "something else"]) {
    const t = privacyNoticeText(seen);
    assert.ok(t.startsWith(PRIVACY_NOTICE.text), "what is new comes first");
    assert.ok(t.endsWith(PRIVACY_NOTICE.earlier.text), `then the earlier notice (${seen})`);
  }
});
