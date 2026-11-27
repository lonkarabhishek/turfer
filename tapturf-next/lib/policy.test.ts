import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PRIVACY_NOTICE, PRIVACY_UPDATED, privacyNoticeText } from "./policy";

const privacyPage = fs.readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8");

test("policy: the friends a host says are in already, and tagging", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const at = page.indexOf("<strong>Things you do on TapTurf.</strong>");
  const things = page.slice(at, page.indexOf("</p>", at));
  assert.match(things, /When you host a game you can say who is in already: a friend&rsquo;s name you type shows on that game&rsquo;s page to anyone, so type only a first name or nickname, and it is not linked to any account\./);
  // 18 Nov 2026 (20261118_game_tags_shown.sql): a tagged player shows at once and can remove themselves; afterwards the Passport asks.
  assert.match(things, /A TapTurf player you tag gets one notification, and their name and photo show on that game&rsquo;s page at once, as added by you; they can remove themselves any time before the game starts, and you can untag them\./);
  assert.match(things, /Turn off &ldquo;Let others find and tag me&rdquo; on the Me tab and no host can tag you, and your name stops showing on games you were tagged in\./);
  assert.match(things, /After a game you were tagged in and didn&rsquo;t answer, your Passport asks whether you played: yes adds the game to your Passport and to the people you played with, no takes you off its lineup\./);
  assert.match(things, /A game&rsquo;s page also lists its activity, such as when it was posted or changed and when each player joined\./);
  assert.doesNotMatch(things, /until they say yes only you see who you tagged/, "the sentence from before is gone");
  // No new site-wide notice for it (the site owner's call); the policy's date moves.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
});

test("policy notice: a new id, so people who dismissed the last one see it", () => {
  assert.notEqual(PRIVACY_NOTICE.id, PRIVACY_NOTICE.earlier.id);
  assert.match(PRIVACY_NOTICE.id, /^\d{4}-\d{2}-\d{2}-/, "named for the date of its change");
  assert.ok(PRIVACY_NOTICE.id.slice(0, 10) <= PRIVACY_UPDATED, "a change the policy's date already covers");
});

test("policy notice: emails, and where the policy says it", () => {
  assert.equal(
    PRIVACY_NOTICE.text,
    "If your account has an email Google confirmed, TapTurf now emails you about your games: a welcome, join requests and answers, game changes and reminders. Resend sends them for us. Turn each kind off on the Me tab or with the link in any email. We don't track opens or taps, and we never email about booking requests.",
  );
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
  assert.equal(PRIVACY_NOTICE.anchor, "emails");
  const at = privacyPage.indexOf(`id="${PRIVACY_NOTICE.anchor}"`);
  assert.ok(at >= 0, `the policy has #${PRIVACY_NOTICE.anchor}`);
  const para = privacyPage.slice(at, privacyPage.indexOf("</p>", at)).replace(/\s+/g, " ");
  assert.match(para, /If your account has an email Google confirmed, we email you about your account and your games/);
  assert.match(para, /a welcome when you make your account; when someone asks to join a game you host, and when a request is still waiting for your answer; when a host accepts your request; when a game you are in or asked to join is cancelled, or its venue, day or time changes; and a reminder the day before a game and about 3 hours before it starts/, "the six kinds");
  assert.match(para, /Each email goes only to you, from TapTurf through Resend/);
  assert.match(para, /Turn off each kind \(Join requests and answers, Game changes, Reminders\) on the Me tab, or with the link in any email/, "how to turn them off");
  assert.match(para, /never its words/);
  assert.match(para, /If an email to your address bounces or you mark one as spam, we stop emailing that address/);
  assert.match(para, /We don&rsquo;t track whether you open an email or tap its links, and we never send ads/);
  assert.match(para, /We never email about booking requests or turf claims/);
  const page = privacyPage.replace(/\s+/g, " ");
  assert.match(page, /<li>Resend, which sends our emails\.<\/li>/, "Resend, in the list of who handles data");
  assert.match(page, /To email you about your account and your games, if your account has an email Google confirmed/, "a purpose");
  assert.match(page, /The record of each email we sent you \(its kind and when, never its words\) and your email switches stay with your account/, "how long");
  const email = page.slice(page.indexOf('id="email"'), page.indexOf("</p>", page.indexOf('id="email"')));
  assert.match(email, /Once Google has confirmed your email, we email you about your games there/, "the #email paragraph");
  assert.match(email, /a typed email is never emailed/);
  assert.match(page, /we email you about your games at that address/, "the Google sign-in paragraph");
});

test("policy notice: booking requests (the notice before), and where the policy says it", () => {
  assert.equal(PRIVACY_NOTICE.earlier.id, "2026-11-06-booking-requests", "the booking requests notice's id, so those who dismissed it see only what is new");
  assert.ok(
    PRIVACY_NOTICE.earlier.text.startsWith(
      "On turfs that take booking requests on TapTurf, you can now ask for a free hour. When you send one, that turf's owner and managers see your name, your number and your note, so they can confirm it and reach you; nobody else does. You pay at the turf; nothing is paid on TapTurf.",
    ),
  );
  const at = privacyPage.indexOf(`id="booking-requests"`);
  assert.ok(at >= 0, `the policy has #${PRIVACY_NOTICE.anchor}`);
  const para = privacyPage.slice(at, privacyPage.indexOf("</p>", at)).replace(/\s+/g, " ");
  assert.match(para, /If you send a booking request\./);
  assert.match(para, /your name and the phone number on your account \(you need one confirmed with a one-time code\)/, "what is kept");
  assert.match(para, /waiting, confirmed, declined, cancelled or expired, who changed it, and the turf&rsquo;s reason/, "what became of it");
  assert.match(para, /we never email or text about it/, "kept: booking requests are never emailed");
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

test("policy: asking whether you got a slot after a Call or WhatsApp tap, and what is kept", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const at = page.indexOf("<strong>Things you do on TapTurf.</strong>");
  const things = page.slice(at, page.indexOf("</p>", at));
  assert.match(things, /when you tap Call or WhatsApp on a turf page\. After you tap Call or WhatsApp, we may ask you once, when you are back on TapTurf, whether you got a slot; your answer \(and the time, if you pick one\) is stored without your name, number or account: only the turf, what you answered and whether you were signed in\./);
  assert.match(page, /so we can ask whether you got a slot without asking too often, the turf you last tapped Call or WhatsApp on \(until you close the tab; it is sent to us only with your answer, if you give one\) and when we last asked or you answered/, "the browser's notes, under Stored on your device");
  // No new site-wide notice for it: the answer names nobody. The date already covers the day it was written.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.ok(PRIVACY_UPDATED >= "2026-11-12");
});

test("policy: Ask for a slot, what is kept and what never reaches us", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const at = page.indexOf("<strong>Things you do on TapTurf.</strong>");
  const things = page.slice(at, page.indexOf("</p>", at));
  assert.match(things, /When you use Ask for a slot on a turf page, we keep the day, time, sport and group size you asked that turf about, without your name, number or account; the message itself goes from your WhatsApp to the turf, and we never see the chat\./);
  assert.match(page, /If you asked a turf for a slot, the day and time you asked about are kept with that, and what you picked waits in the tab while you sign in \(until you send it or close the tab\)\./, "the browser's notes, under Stored on your device");
  // What the sentence says is what the table holds (20261118_slot_asks.sql): nothing that says who asked.
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261118_slot_asks.sql"), "utf8");
  const table = sql.slice(sql.indexOf("create table if not exists private.slot_asks ("), sql.indexOf(");", sql.indexOf("create table if not exists private.slot_asks (")));
  assert.deepEqual([...table.matchAll(/^  (\w+) /gm)].map((m) => m[1]), ["id", "turf_id", "slot_date", "slot_hour", "slot_minute", "minutes", "sport", "players", "signed_in", "created_at"]);
  // No new site-wide notice for it (an ask names nobody); the policy's date moves to the day it ships.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
});

test("policy: the medal on your photo, who sees it and how to turn it off", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const at = page.indexOf('<p id="usernames"');
  const para = page.slice(at, page.indexOf("</p>", at));
  assert.match(para, /If you have a public profile and have earned a medal, your best medal also shows as a small badge on your photo to other players, on the pages of games you host or are in and in the Played with list of people you played with, and it links to your profile; turn off &ldquo;Let others find and tag me&rdquo; and the badge stops showing the next time those pages are opened\./);
  // What the sentence says is what the table holds (20261121_player_badges.sql): an account, its best medal, how many, and when that changed.
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261121_player_badges.sql"), "utf8");
  const from = sql.indexOf("create table if not exists private.player_badges (");
  const table = sql.slice(from, sql.indexOf("\n);", from));
  assert.deepEqual([...table.matchAll(/^  (?!constraint|--)(\w+) /gm)].map((m) => m[1]), ["user_id", "medal", "medals", "updated_at"]);
  // Only for people whose profile is public, asked on every read.
  assert.match(sql, /join public\.usernames n on n\.user_id = b\.user_id and n\.taggable/);
  // No new site-wide notice for it (the medals were on the public profile already); the policy's date moves to the day it ships.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
});

test("policy: a host can delete a game they posted, and what is kept", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const at = page.indexOf("<strong>Things you do on TapTurf.</strong>");
  const things = page.slice(at, page.indexOf("</p>", at));
  assert.match(things, /You can delete a game you posted: it comes off TapTurf at once, and its record is kept privately \(so the players who were in it can be told, and a mistake can be undone\) until you ask us to erase it\./);
  // What the sentence says is what the database does (20261122_game_remove.sql): the row stays, hidden from every read, and nothing new is kept about anybody.
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261122_game_remove.sql"), "utf8");
  assert.match(sql, /alter policy "Anyone can read games" on public\.games using \(removed_at is null\);/, "hidden from the browser's and the server's reads");
  assert.deepEqual([...sql.matchAll(/^alter table public\.games add column if not exists (\w+) /gm)].map((m) => m[1]), ["removed_at", "removed_status"], "kept: when it was taken off and the state it was in");
  assert.doesNotMatch(sql, /create table/i, "no new table: nothing else is stored");
  // No new site-wide notice for it (nothing new is collected or shared); the policy's date moves to the day it ships.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
});

test("policy: tools used signed in count toward medals, and the profile shows how many you played with, never who", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const para = (id: string) => {
    const at = page.indexOf(`<p id="${id}"`);
    return page.slice(at, page.indexOf("</p>", at));
  };
  // Under "When you use our free tools", right after the sentence that says a signed-in use is kept with the account.
  assert.match(para("tools"), /If you are signed in, the record is kept with your TapTurf account\. Tools you use while signed in count toward medals, and the medals you earn show on your public profile like the others \(only the medal, never which tool you used or when\)\. If you are not signed in, and you accepted cookies,/);
  // What the sentence says is what the read gives the app (20261122_tool_medals.sql): days and counts of one account's own uses, nothing else.
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261122_tool_medals.sql"), "utf8");
  assert.match(sql, /where t\.user_id = p_user_id/);
  assert.match(sql, /A guest's row has no account and is never here\./);
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ""), /create table|insert into|\bupdate\b/i, "nothing new is kept");
  // Turfers: a number on the public profile, said where the profile is described, where the list is, and under what others see.
  assert.match(para("usernames"), /how many different players you have played a TapTurf game with \(a number we call Turfers; never who they are, and never a list\)/);
  assert.match(para("usernames"), /Only counts: never which turfs you played at, when, or with whom\./);
  assert.match(para("played-with"), /Only you see your list; it is never public \(your public profile shows only how many people are on it, as a number\)\./);
  assert.match(page, /your profile also shows your game and review counts, how many players you have played with \(a number, never who\), your current weekly streak \(a number of weeks\), medals and reviewed turfs/);
  // No new site-wide notice (the medals and the counts were on the public profile already; this adds one more count); the policy's date moves to the day it ships.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
});

test("policy: a tournament you start signed in names you if your profile is public, and how to turn that off", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const at = page.indexOf('<p id="live-tournaments"');
  const para = page.slice(at, page.indexOf("</p>", at));
  assert.match(para, /A tournament you start while signed in shows your name, photo and a link to your profile on its page if your profile is public; turn off &ldquo;Let others find and tag me&rdquo; on the Me tab and they stop showing there within a couple of minutes\./);
  assert.match(para, /Your number and email never go with it, and if your profile is not public only TapTurf&rsquo;s team sees which account runs it\./);
  assert.doesNotMatch(para, /your own name, number or email does not go with it/, "the sentence from before is gone: a public organiser's name does show now");
  assert.match(page, /Anyone with a tournament&rsquo;s link can see it, team names and results included, and who started it when that person&rsquo;s profile is public\./, "and under what others can see");
  assert.match(page, /A live score that is one of a tournament&rsquo;s matches names the tournament and links to it, as the tournament links to that score, so anyone with either link can reach the other\./, "a scorecard's banner, said where tournaments' links are");
  // What the sentence says is what the read gives the page (20261123_tournament_host.sql): a public profile's own fields, only while the switch is on, asked on every call.
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261123_tournament_host.sql"), "utf8");
  const from = sql.indexOf("as $$", sql.indexOf("create or replace function public.tournament_host")) + 5;
  const body = sql.slice(from, sql.indexOf("$$;", from));
  assert.deepEqual([...body.matchAll(/^\s+'(\w+)', /gm)].map((m) => m[1]), ["u", "name", "photo", "verified", "m", "n"], "username, name, photo, the tick and the medal: nothing else");
  assert.match(body, /join public\.usernames n on n\.user_id = t\.user_id and n\.taggable/, "only while the profile is public");
  assert.doesNotMatch(body, /\bphone\b|\bemail\b/, "never a number or an email");
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ""), /create table|insert into|\bupdate\b/i, "nothing new is kept");
  // "Within a couple of minutes": the server never shows a copy older than a minute and a half, and an open page asks again every half minute.
  const host = fs.readFileSync(path.join(process.cwd(), "lib/tournament/host.ts"), "utf8");
  assert.match(host, /export const HOST_COPY_MAX_MS = 90_000;/);
  // No new site-wide notice was added with it; the policy's date moves to the day it ships.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
});

test("policy notice: the notice it replaced still reaches anyone who never dismissed it", () => {
  assert.equal(privacyNoticeText(PRIVACY_NOTICE.earlier.id), PRIVACY_NOTICE.text, "dismissed the last one: only what is new");
  for (const seen of [null, "2026-10-25-cities", "something else"]) {
    const t = privacyNoticeText(seen);
    assert.ok(t.startsWith(PRIVACY_NOTICE.text), "what is new comes first");
    assert.ok(t.endsWith(PRIVACY_NOTICE.earlier.text), `then the earlier notice (${seen})`);
  }
});

test("policy: the Me tab lists the live matches and tournaments you started, to you alone; the profile shows your current streak", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const para = (id: string) => {
    const at = page.indexOf(`<p id="${id}"`);
    return page.slice(at, page.indexOf("</p>", at));
  };
  // Said where the page says the account that started a live link is kept with it.
  assert.match(para("live-links"), /Our own record of the match starting notes your account and the link \(see &ldquo;When you use our free tools&rdquo;\), and only TapTurf&rsquo;s team sees it\. Your Me tab lists the live matches and tournaments you started, to you alone\./);
  assert.match(para("tools"), /A live link needs a login, and the account that turns one on is recorded with that link\./, "the sentence it follows from is still there");
  // What the sentence says is what the read gives (20261124_live_mine.sql): one account's own links, a few named values of each, nothing kept.
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261124_live_mine.sql"), "utf8");
  const from = sql.indexOf("as $$", sql.indexOf("create or replace function public.live_links_mine")) + 5;
  const body = sql.slice(from, sql.indexOf("$$;", from));
  assert.match(body, /where s\.user_id = p_user_id/, "only the links that account started");
  assert.match(body, /if not private\.account_key_ok\(p_key\) then/, "only for the server, which asks for the caller it verified");
  assert.deepEqual([...body.matchAll(/ as (\w+),?$/gm)].map((m) => m[1]), ["sport", "team_a", "team_b", "title", "tournament", "tournament_name"], "of a match: its sport, the two sides, its title and its tournament; never the whole match");
  assert.doesNotMatch(body, /secret|ip_hash|\bphone\b|\bemail\b|public\.users/, "no secret, network hash, number or email");
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ""), /create table|insert into|\bupdate\b/i, "nothing new is kept");
  // The route answers only the caller the server verified, and is never stored by a cache.
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/live/mine/route.ts"), "utf8");
  assert.match(route, /const who = await liveSigner\(req\);/);
  assert.match(route, /myLiveLinks\(who\.ok\.userId\)/, "the account is the verified caller's, never one the browser names");
  assert.match(route, /headers: PRIVATE_HEADERS/);
  // The current weekly streak: a number beside the username, said where the public profile is described and under what others see.
  assert.match(para("usernames"), /your longest run of weeks in a row with a game, your current weekly streak beside your username when it is 2 weeks or more \(a number of weeks: it tells others you played a game this week or last, and nothing more about when\), the medals you earned/);
  const streak = fs.readFileSync(path.join(process.cwd(), "lib/profile/streak.ts"), "utf8");
  assert.match(streak, /export const STREAK_SHOWN_FROM = 2;/, "2 weeks or more, as the page says");
  const passport = fs.readFileSync(path.join(process.cwd(), "lib/profile/passport.ts"), "utf8");
  assert.match(passport, /bestStreak: p\.streak\.best, streak: p\.streak\.current, turfers: count/, "the public passport carries it as a number, beside the best streak");
  // No new site-wide notice was added with it; the policy's date moves to the day it ships.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
});

test("policy: a tournament's page lists its changes with their times, never who made them", () => {
  const page = privacyPage.replace(/\s+/g, " ");
  const at = page.indexOf('<p id="live-tournaments"');
  const para = page.slice(at, page.indexOf("</p>", at));
  assert.match(para, /Changes to a tournament are listed on its page with their times, such as a team renamed, a match added, moved or taken out, a match scored live, a result or a setting changed: what changed and when, never who made the change, unless the page already names the organiser as the one who started it\./);
  // What the sentence says is what the file keeps (20261128_tournament_activity.sql): one column on the tournament's own row, and nothing in it that reads an account, a secret, a network hash or a person.
  const sql = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261128_tournament_activity.sql"), "utf8");
  const code = sql.replace(/^\s*--.*$/gm, "");
  assert.deepEqual([...code.matchAll(/^alter table (\S+) add column if not exists (\w+) /gm)].map((m) => `${m[1]}.${m[2]}`), ["private.tournaments.activity"], "kept: the log, on the tournament's row");
  assert.doesNotMatch(code, /create table/i, "no new table: nothing else is stored");
  const bodies = [...code.matchAll(/create or replace function [\s\S]*?\bas \$\$([\s\S]*?)\$\$;/g)].map((m) => m[1]);
  assert.equal(bodies.length, 5, "its five functions");
  for (const body of bodies) assert.doesNotMatch(body, /user_id|secret|ip_hash|\bemail\b|\bphone\b|public\.users|usernames/i, "nothing about who: no function reads an account, a secret, a network hash, a number or an email");
  // The organiser is named in a line only where the page was served one (lib/tournament/host.ts decides that, as for the masthead).
  const lines = fs.readFileSync(path.join(process.cwd(), "lib/tournament/activity.ts"), "utf8");
  assert.match(lines, /i\.host\?\.name \? `\$\{i\.host\.name\} \$\{verb\} the tournament` : `Tournament \$\{verb\}`/);
  // No new site-wide notice for it (every line is something the page already showed); the policy's date moves to the day it ships.
  assert.equal(PRIVACY_NOTICE.id, "2026-11-12-emails");
  assert.equal(PRIVACY_UPDATED, "2026-11-28");
});
