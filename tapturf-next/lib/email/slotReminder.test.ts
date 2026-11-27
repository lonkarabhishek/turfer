import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { FRESH_HOURS, ownerStatus } from "../availability/slots";
import { bannedCopy } from "../seo/defaults";
import { offPage } from "./offPage";
import { ASKS_DAYS, daysSince, EVERY_DAYS, hiddenNow, LATE_HOURS, MAX_IN_A_ROW, SEEN_HOURS, SEND_HOUR_IST, SLOT_LINE, SLOT_REMINDER_COPY, SLOT_SWITCH_DETAIL, SLOT_SWITCH_LABEL, slotSubject, STALE_HOURS, TURFS_MAX } from "./slotReminder";
import { renderEmail } from "./templates";
import { offKey, offToken, readOffToken } from "./token";
import { GROUP_DETAIL, GROUP_LABEL, GROUP_OF, type EmailJob } from "./types";

// Reminders to update free slots (20261129_slot_reminders.sql). Made-up people, places and addresses only.

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const T1 = "cccccccc-cccc-4ccc-8ccc-000000000001";
const T2 = "cccccccc-cccc-4ccc-8ccc-000000000002";
const LINKS = { site: "https://www.tapturf.in", off: "https://www.tapturf.in/email/off?t=TOKEN" };
const NOW = Date.parse("2026-11-30T03:30:20Z"); // 9:00 AM in India
const ago = (hours: number) => new Date(NOW - hours * 3600000).toISOString();
const job = (o: Partial<EmailJob> = {}): EmailJob => ({
  id: "eeeeeeee-eeee-4eee-8eee-000000000001",
  kind: "slot_reminder",
  user_id: USER,
  to: "asha.standin@example.com",
  name: "Asha",
  attempt: 1,
  path: `/my/turf/${T1}`,
  n: 1,
  last: false,
  more: 0,
  now: new Date(NOW).toISOString(),
  turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: ago(75), asks: 4 }],
  ...o,
});
const buttons = (html: string) => [...html.matchAll(/<a href="([^"]+)" data-button="1"[^>]*>([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);

test("the constants are the migration's own: every 2 days, 48 hours, 5 in a row, 9 AM in India", () => {
  assert.deepEqual([EVERY_DAYS, STALE_HOURS, MAX_IN_A_ROW, SEND_HOUR_IST, ASKS_DAYS, TURFS_MAX, LATE_HOURS], [2, 48, 5, 9, 7, 5, 12]);
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261129_slot_reminders.sql"), "utf8");
  const inSql = (fn: string) => {
    const m = new RegExp(`create or replace function private\\.${fn}\\(\\)\\s+returns int language sql immutable set search_path = '' as \\$\\$ select (\\d+) \\$\\$;`).exec(sql);
    assert.ok(m, `${fn} is in the migration`);
    return Number(m[1]);
  };
  assert.equal(inSql("slot_reminder_every_days"), EVERY_DAYS);
  assert.equal(inSql("slot_reminder_stale_hours"), STALE_HOURS);
  assert.equal(inSql("slot_reminder_max"), MAX_IN_A_ROW);
  assert.equal(inSql("slot_reminder_hour"), SEND_HOUR_IST);
  assert.equal(inSql("slot_reminder_asks_days"), ASKS_DAYS);
  assert.equal(inSql("slot_reminder_turfs_max"), TURFS_MAX);
  assert.equal(inSql("slot_reminder_late_hours"), LATE_HOURS);
  // The job's time is UTC: 03:30 is 9:00 AM in India, every day.
  const cron = /cron\.schedule\('slot-reminders', '(\d+) (\d+) \* \* \*', 'select private\.slot_reminders_run\(\)'\)/.exec(sql);
  assert.ok(cron, "one daily job");
  assert.equal((Number(cron[2]) * 60 + Number(cron[1]) + 330) % 1440, SEND_HOUR_IST * 60, "at 9:00 AM India time");
  assert.equal(STALE_HOURS, EVERY_DAYS * 24, "a turf goes stale as fast as a reminder may follow one");
  assert.equal(SEEN_HOURS, FRESH_HOURS, "the 24 hours the email says are the Free slots' own");
  assert.ok(STALE_HOURS > FRESH_HOURS, "players stopped seeing the slots before any reminder goes");
});

test("(a) one turf last updated 3 days ago, with 4 slot asks", () => {
  const e = renderEmail(job(), LINKS)!;
  assert.equal(e.subject, "Update your free slots: Kings Turf Arena");
  assert.equal(e.preheader, "Players see your free hours for 24 hours after you update them.");
  assert.equal(
    e.text,
    [
      "Your free slots need an update",
      "",
      "Hi Asha,",
      "",
      "Players see your free hours on TapTurf only for 24 hours after you update them.",
      "",
      "Kings Turf Arena was last updated 3 days ago, so players see none right now.",
      "",
      "Players asked for a slot here 4 times in the last 7 days.",
      "",
      `Update slots: https://www.tapturf.in/my/turf/${T1}`,
      "",
      "It takes under a minute. Tap All correct if nothing changed.",
      "",
      "--",
      "You run this turf's page on TapTurf.",
      "Turn off these reminders: https://www.tapturf.in/email/off?t=TOKEN",
      "Reply to this email to reach TapTurf.",
    ].join("\n"),
  );
  assert.deepEqual(buttons(e.html), [[`https://www.tapturf.in/my/turf/${T1}`, "Update slots"]], "one button, to the turf's Slots tab (the first tab)");
  assert.match(e.html, /<h1[^>]*>Your free slots need an update<\/h1>/);
  assert.match(e.html, /<a href="https:\/\/www\.tapturf\.in\/email\/off\?t&#61;TOKEN"[^>]*>Turn off these reminders<\/a>/);
});

test("the asks line only when the real number is above zero, and '1 time'", () => {
  const none = renderEmail(job({ turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: ago(49), asks: 0 }] }), LINKS)!;
  assert.doesNotMatch(none.text, /asked for a slot/);
  assert.match(none.text, /was last updated 2 days ago/);
  const one = renderEmail(job({ turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: ago(49), asks: 1 }] }), LINKS)!;
  assert.match(one.text, /Players asked for a slot here 1 time in the last 7 days\./);
  assert.equal(SLOT_REMINDER_COPY.asks(12), "Players asked for a slot here 12 times in the last 7 days.");
});

test("never marked: said plainly, and the button the Slots tab shows then", () => {
  const e = renderEmail(job({ turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: null, asks: 0 }] }), LINKS)!;
  assert.match(e.text, /You haven't marked your free hours at Kings Turf Arena yet, so players see none\./);
  assert.match(e.text, /It takes under a minute\. Tap the hours that are taken, then Show free hours to players\./);
  // The two buttons the email names are the Slots tab's own.
  assert.equal(ownerStatus(null, NOW, true).button, "Show free hours to players");
  assert.equal(ownerStatus(ago(75), NOW, true).button, "All correct");
});

test("(b) two turfs, one never updated: one email, a button each", () => {
  const e = renderEmail(job({ path: "/my?list=1", turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: ago(75), asks: 4 }, { id: T2, name: "Kings Box Cricket", updated_at: null, asks: 0 }] }), LINKS)!;
  assert.equal(e.subject, "Update your free slots: Kings Turf Arena and 1 more");
  assert.equal(
    e.text,
    [
      "Your free slots need an update",
      "",
      "Hi Asha,",
      "",
      "Players see your free hours on TapTurf only for 24 hours after you update them.",
      "",
      "These turfs need an update:",
      "",
      "Kings Turf Arena",
      "Last updated 3 days ago, so players see none right now.",
      "Players asked for a slot here 4 times in the last 7 days.",
      `Update slots: https://www.tapturf.in/my/turf/${T1}`,
      "",
      "Kings Box Cricket",
      "You haven't marked its free hours yet, so players see none.",
      `Update slots: https://www.tapturf.in/my/turf/${T2}`,
      "",
      "It takes under a minute. Tap All correct if nothing changed.",
      "",
      "--",
      "You run these turfs' pages on TapTurf.",
      "Turn off these reminders: https://www.tapturf.in/email/off?t=TOKEN",
      "Reply to this email to reach TapTurf.",
    ].join("\n"),
  );
  assert.deepEqual(buttons(e.html), [[`https://www.tapturf.in/my/turf/${T1}`, "Update slots"], [`https://www.tapturf.in/my/turf/${T2}`, "Update slots"]]);
});

test("(c) the 5th says it is the last until the next update", () => {
  const e = renderEmail(job({ n: 5, last: true, turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: ago(11 * 24 + 1), asks: 0 }] }), LINKS)!;
  assert.match(e.text, /Kings Turf Arena was last updated 11 days ago, so players see none right now\./);
  assert.match(e.text, /Tap All correct if nothing changed\.\n\nThis is the last reminder for now\. We'll send them again after you next update your slots\.\n\n--/);
  assert.match(e.html, /This is the last reminder for now\./);
  assert.doesNotMatch(renderEmail(job({ n: 4, last: false }), LINKS)!.text, /last reminder/);
});

test("more than five turfs: the five, and how many more on myTapturf", () => {
  const e = renderEmail(job({ path: "/my?list=1", more: 2, turfs: [1, 2, 3, 4, 5].map((i) => ({ id: `cccccccc-cccc-4ccc-8ccc-00000000000${i}`, name: `Arena ${i}`, updated_at: ago(60), asks: 0 })) }), LINKS)!;
  assert.equal(e.subject, "Update your free slots: Arena 1 and 6 more");
  assert.match(e.text, /More turfs\n2 more of your turfs need an update too\.\nSee them on myTapturf: https:\/\/www\.tapturf\.in\/my\?list=1/);
  assert.equal(buttons(e.html).length, 6);
  assert.equal(SLOT_REMINDER_COPY.more(1), "1 more of your turfs needs an update too.");
});

test("nothing untrue is written: a turf players can see now is left out, and with none left there is no email", () => {
  assert.equal(renderEmail(job({ turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: ago(5), asks: 9 }] }), LINKS), null);
  assert.equal(renderEmail(job({ turfs: [] }), LINKS), null);
  assert.equal(renderEmail(job({ turfs: undefined }), LINKS), null);
  const e = renderEmail(job({ turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: ago(5), asks: 0 }, { id: T2, name: "Kings Box Cricket", updated_at: ago(50), asks: 0 }] }), LINKS)!;
  assert.equal(e.subject, "Update your free slots: Kings Box Cricket");
  assert.equal(hiddenNow({ updated_at: ago(24) }, NOW), true);
  assert.equal(hiddenNow({ updated_at: ago(23.9) }, NOW), false);
  assert.equal(hiddenNow({ updated_at: null }, NOW), true);
  assert.equal(daysSince(ago(47.9), NOW), 1);
  assert.equal(daysSince(ago(48), NOW), 2);
  assert.equal(daysSince(null, NOW), null);
});

test("the words: plain, never 'book' in any form, no hurry, no people counted, no dashes or semicolons", () => {
  const all = [
    job(),
    job({ name: null, turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: null, asks: 3 }] }),
    job({ n: 5, last: true, path: "/my?list=1", more: 1, turfs: [{ id: T1, name: "Kings Turf Arena", updated_at: ago(75), asks: 4 }, { id: T2, name: "Kings Box Cricket", updated_at: null, asks: 1 }] }),
  ].map((j) => renderEmail(j, LINKS)!);
  for (const e of all) {
    for (const s of [e.subject, e.preheader, e.text.replace(/https:\S+/g, "").replace(/^--$/m, "")]) {
      assert.doesNotMatch(s, /book/i, s);
      assert.equal(bannedCopy(s), null, s);
      assert.doesNotMatch(s, /[—–;]/, s);
      assert.doesNotMatch(s, /\b(customers?|people|urgent|hurry|last chance|don't miss|losing|lose)\b/i, s);
    }
    assert.doesNotMatch(e.html, /<img|<script|<link|<style|background-image|utm_|track/i, "no images, scripts, styles sheets or tracking");
    assert.ok([...e.html.matchAll(/href="([^"]+)"/g)].every((m) => m[1].startsWith("https://www.tapturf.in/")), "every link goes straight to TapTurf");
  }
  for (const s of [SLOT_SWITCH_LABEL, SLOT_SWITCH_DETAIL, ...Object.values(SLOT_LINE)]) {
    assert.doesNotMatch(s, /book|[—–;]/i, s);
    assert.equal(bannedCopy(s), null, s);
  }
  assert.match(all[1].text, /^Your free slots need an update\n\nHi,\n/, "no name: still written");
});

test("a name someone typed is escaped, and cut to one line", () => {
  const e = renderEmail(job({ turfs: [{ id: T1, name: `Kings <b>"Arena"</b>\nPune`, updated_at: ago(75), asks: 0 }] }), LINKS)!;
  assert.ok(!e.html.includes("<b>"));
  assert.match(e.html, /Kings &#60;b&#62;&#34;Arena&#34;&#60;\/b&#62; Pune was last updated/);
  assert.equal(slotSubject("Kings Turf Arena", 0), "Update your free slots: Kings Turf Arena");
});

test("its own switch and its own link: slots, never another group", () => {
  assert.equal(GROUP_OF.slot_reminder, "slots");
  assert.equal(GROUP_OF.reminder, "reminders", "game reminders keep theirs");
  assert.equal(GROUP_LABEL.slots, "Reminders to update your free slots");
  assert.equal(GROUP_DETAIL.slots, "For turf owners: an email every 2 days while your free slots are out of date, 5 in a row at most. They start again after your next update.");
  const key = offKey("test-account-key");
  const t = offToken(key, USER, "slots");
  assert.deepEqual(readOffToken(key, t), { userId: USER, group: "slots" });
  assert.notEqual(t, offToken(key, USER, "reminders"));
  assert.match(offPage({ state: "ask", group: "slots", token: t }).html, /Turn off reminders to update your free slots\?/);
  assert.match(offPage({ state: "done", group: "slots" }).html, /We won't send you reminders to update your free slots any more\./);
  assert.equal(SLOT_LINE.on, "Email reminders are on: we email you when your free slots are 2 days old, 5 times in a row at most.");
});
