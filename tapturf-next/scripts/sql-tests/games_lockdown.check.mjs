// Applies 20261030_games_lockdown.sql (twice) to an in-memory Postgres (PGlite)
// built by games_lockdown.db.mjs (stand-ins for Supabase, production's four game
// tables with their policies, grants and triggers), checks every function's
// rule end to end (the server key, host only, own request only, own
// notifications only, active turfs only, full games, the recount, who is told),
// then applies 20261030_games_lockdown_step2.sql (twice) and checks the API roles
// can no longer write the four tables or read requests and notifications while
// the public reads and the functions keep working, then the revert. Never
// touches a real database.
// Run: PGLITE=<pglite dist/index.js> node scripts/sql-tests/games_lockdown.check.mjs supabase/migrations
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
import fs from "node:fs";
import assert from "node:assert/strict";
import { KEY, makeDb } from "./games_lockdown.db.mjs";

const [M] = process.argv.slice(2);
const FILE = `${M}/20261030_games_lockdown.sql`;
const LOCK = `${M}/20261030_games_lockdown_step2.sql`;
const REVERT = `${M}/../revert/20261030_games_lockdown_revert.sql`;
let passed = 0;
const ok = (c, w) => { assert.ok(c, w); passed++; };
const eq = (a, b, w) => { assert.deepEqual(a, b, w); passed++; };
const refused = async (p, re, w) => { await assert.rejects(p, re, w); passed++; };

const sql = fs.readFileSync(FILE, "utf8");
const lock = fs.readFileSync(LOCK, "utf8");
const revert = fs.readFileSync(REVERT, "utf8");
for (const [name, s] of [["step 1", sql], ["step 2", lock], ["revert", revert]]) {
  // Not even inside a word: "dropped", "deleted" and "truncated" are out too.
  ok(!/drop|delete|truncate/i.test(s), `${name}: written without the words drop, delete and truncate`);
  ok(!/[—–]/.test(s), `${name}: no em or en dashes`);
}
ok(!/\b(revoke|grant)\b[^;]*\bon\s+(table\s+)?public\.(games|game_requests|game_participants|notifications)\b/i.test(sql), "step 1 changes no table grant");
ok(!/alter\s+policy/i.test(sql), "step 1 changes no policy");
ok(/revoke all on public\.games, public\.game_requests, public\.game_participants, public\.notifications from anon, authenticated;/.test(lock), "step 2 revokes all from the API roles");
ok(/grant select on public\.games, public\.game_participants to anon, authenticated;/.test(lock), "and gives back only the public reads");

const db = await makeDb(PGlite);
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const asRole = async (role, fn, claims = null) => {
  await q(`select set_config('request.jwt.claims', $1, false)`, [claims ? JSON.stringify(claims) : ""]);
  await q(`set role ${role}`);
  try { return await fn(); } finally { await q("reset role"); await q(`select set_config('request.jwt.claims', '', false)`); }
};
const ist = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// People and turfs (made up).
const U = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
const T = (i) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`;
const HOST = U(1), RAVI = U(2), PRIYA = U(3), KIRAN = U(4), NEHA = U(5), OMAR = U(6), GOOGLE = U(7);
await q(`insert into public.users (id, name, phone, email, profile_image_url) values
  ('${HOST}', 'Asha Rao', '+919000000001', null, 'https://lh3.example/asha'), ('${RAVI}', 'Ravi Kumar', '+919000000002', null, null),
  ('${PRIYA}', 'Priya Sharma', '+919000000003', null, null), ('${KIRAN}', 'Kiran Patil', '+919000000004', null, 'https://lh3.example/kiran'),
  ('${NEHA}', 'Neha Joshi', '+919000000005', null, null), ('${OMAR}', 'Omar Shaikh', '+919000000006', null, null),
  ('${GOOGLE}', 'Google Player', null, 'google.player@example.com', null)`);
await q(`insert into public.turfs (id, name, slug, city, area, is_active, sports) values
  ('${T(1)}', 'Kings Turf', 'kings-turf', 'pune', 'Baner', true, '["Football"]'),
  ('${T(2)}', 'Dribble Den', 'dribble-den', 'pune', 'Aundh', true, '["Football"]'),
  ('${T(3)}', 'Closed Turf', 'closed-turf', 'pune', 'Pashan', false, '["Football"]')`);

// Before the file: the holes the lockdown closes are there (the stand-in is as open as production).
await asRole("anon", () => q(`insert into public.notifications (user_id, type, title, message) values ('${RAVI}', 'spam', 'Forged', 'Anyone could send this')`));
eq((await asRole("anon", () => q(`select count(*)::int n from public.notifications`)))[0].n, 1, "before: anon writes and reads anyone's notifications");
await q(`update public.notifications set is_read = true`);

await db.exec(sql);
await db.exec(sql); // safe to run again
passed++;
ok((await one(`select to_regclass('public.game_requests_one_per_player_uidx') r`)).r !== null, "one request row per player per game (no pairs today)");

const rpc = async (fn, args) => (await one(`select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) r`, args)).r;
const create = (user, game, key = KEY) => rpc("game_create", [key, user, JSON.stringify(game)]);
const update = (user, id, changes, notice = null, key = KEY) => rpc("game_update", [key, user, id, JSON.stringify(changes), notice ? JSON.stringify(notice) : null]);
const send = (user, game, note = null, key = KEY) => rpc("game_request_send", [key, user, game, note]);
const answer = (user, req, accept, key = KEY) => rpc("game_request_answer", [key, user, req, accept]);
const withdraw = (user, req, key = KEY) => rpc("game_request_withdraw", [key, user, req]);
const reqsFor = (user, game, key = KEY) => rpc("game_requests_for", [key, user, game]);
const notesOf = async (user) => q(`select type, title, message, metadata, is_read from public.notifications where user_id = $1 order by created_at, id`, [user]);
const dirty = async () => (await q(`select key from private.test_dirty order by at`)).map((x) => x.key);

const GAME = { turf_id: T(1), sport: "Football", skill_level: "all", max_players: 4, date: ist(2), start_time: "19:00", end_time: "20:00",
  price_per_player: 150, description: "Bring a dark tee.", turf_booked: true, host_phone: "+919800000001" };

/* ---------------- the server key ---------------- */
const SOME = "cccccccc-cccc-4ccc-8ccc-000000000001";
for (const [fn, args] of [
  ["game_create", [HOST, JSON.stringify(GAME)]], ["game_update", [HOST, SOME, "{}", null]], ["game_cancel", [HOST, SOME]],
  ["game_request_send", [RAVI, SOME, null]], ["game_request_withdraw", [RAVI, SOME]], ["game_request_answer", [HOST, SOME, true]],
  ["game_requests_for", [HOST, SOME]], ["game_requests_mine", [RAVI]], ["game_requests_incoming", [HOST]],
  ["notifications_mine", [RAVI, 50]], ["notifications_unread", [RAVI]], ["notifications_read", [RAVI, null]],
]) {
  eq((await rpc(fn, ["wrong", ...args])).r, "unavailable", `${fn}: a call without the server key gets unavailable`);
  eq((await rpc(fn, [null, ...args])).r, "unavailable", `${fn}: a null key too`);
}
eq((await asRole("anon", () => create(HOST, GAME, "guess"))).r, "unavailable", "a browser naming a user id, without the key, makes nothing");
eq((await one(`select count(*)::int n from public.games`)).n, 0, "and no game is written");

/* ---------------- create ---------------- */
await q(`delete from private.test_dirty`);
const made = await create(HOST, GAME);
eq(made.r, "ok", "the host creates a game");
const G1 = made.game.id;
const g1 = await one(`select * from public.games where id = $1`, [G1]);
eq([g1.creator_id, g1.status, g1.current_players, g1.title, g1.host_name, g1.host_profile_image_url, g1.host_phone, g1.turf_booked, Number(g1.price_per_player)],
  [HOST, "open", 1, "Football Game", "Asha Rao", "https://lh3.example/asha", "+919800000001", true, 150], "status open, 1 player, name and photo from the account");
eq((await q(`select user_id from public.game_participants where game_id = $1`, [G1])).map((r) => r.user_id), [HOST], "the host is the first participant");
ok((await dirty()).includes("turf:kings-turf") && (await dirty()).includes("games"), "the turf page and the games list are marked for a refresh");
eq((await create(HOST, { ...GAME, description: undefined, turf_booked: undefined, host_phone: undefined })).game.description, "Football game", "no note: the old default");
const bad = [
  [{ ...GAME, turf_id: T(3) }, "venue", "a turf that is not listed"],
  [{ ...GAME, turf_id: "cccccccc-cccc-4ccc-8ccc-000000000999" }, "venue", "a turf that does not exist"],
  [{ ...GAME, max_players: 1 }, "bad", "1 player"], [{ ...GAME, max_players: 51 }, "bad", "51 players"], [{ ...GAME, max_players: 4.5 }, "bad", "half a player"],
  [{ ...GAME, date: ist(-1) }, "bad", "yesterday"], [{ ...GAME, date: "2026-02-30" }, "bad", "no such day"], [{ ...GAME, date: ist(400) }, "bad", "over a year ahead"],
  [{ ...GAME, start_time: "25:00" }, "bad", "no such time"], [{ ...GAME, price_per_player: -1 }, "bad", "a negative price"], [{ ...GAME, price_per_player: 20000 }, "bad", "an absurd price"],
  [{ ...GAME, skill_level: "pro" }, "bad", "an unknown level"], [{ ...GAME, host_phone: "12345" }, "bad", "a number that isn't one"], [{ ...GAME, sport: "" }, "bad", "no sport"],
  [{ ...GAME, description: "x".repeat(501) }, "bad", "a long note"], [{ ...GAME, creator_id: RAVI }, "bad", "naming the creator"], [{ ...GAME, status: "full" }, "bad", "naming the status"],
  [{ ...GAME, current_players: 9 }, "bad", "naming the count"], [{ ...GAME, sport: undefined }, "bad", "a missing field"],
];
for (const [g, r, what] of bad) eq((await create(HOST, JSON.parse(JSON.stringify(g)))).r, r, `create refuses ${what}`);
eq((await create(U(99), GAME)).r, "bad", "an account that does not exist creates nothing");
eq((await one(`select count(*)::int n from public.games where creator_id = $1`, [HOST])).n, 2, "only the two good games were made");
for (let i = 0; i < 9; i++) await create(OMAR, GAME);
eq((await create(OMAR, GAME)).r, "ok", "ten games a day");
eq((await create(OMAR, GAME)).r, "limit", "the eleventh is refused");

/* ---------------- requests: send ---------------- */
eq((await send(HOST, G1)).r, "own", "the host cannot ask to join their own game");
const r1 = await send(RAVI, G1, "  Can play in goal  ");
eq(r1.r, "ok", "a player asks to join");
const R1 = r1.request.id;
const row1 = await one(`select * from public.game_requests where id = $1`, [R1]);
eq([row1.user_id, row1.status, row1.note, row1.requester_name], [RAVI, "pending", "Can play in goal", "Ravi Kumar"], "their request, the note trimmed, the name from the account");
eq(await notesOf(HOST), [{ type: "game_request", title: "New Join Request", message: "Ravi Kumar wants to join your Football", metadata: { gameId: G1, requestId: R1 }, is_read: false }],
  "the host is told, as before");
eq((await send(RAVI, G1)).r, "pending", "a second ask while one waits is refused");
eq((await send(PRIYA, G1, "x".repeat(301))).r, "bad", "a note over 300 characters");
eq((await send(PRIYA, "cccccccc-cccc-4ccc-8ccc-000000000999")).r, "gone", "a game that does not exist");
const R2 = (await send(PRIYA, G1)).request.id;
const R3 = (await send(KIRAN, G1, "I bring the ball")).request.id;
const R4 = (await send(NEHA, G1)).request.id;
eq((await one(`select count(*)::int n from public.notifications where user_id = $1`, [HOST])).n, 4, "one note to the host per request");

/* ---------------- requests: who reads them ---------------- */
const hostView = await reqsFor(HOST, G1);
eq([hostView.r, hostView.host, hostView.requests.length], ["ok", true, 4], "the host reads every request on their game");
ok(hostView.requests.every((r) => !("requester_phone" in r)), "never with a phone number");
eq(hostView.requests.find((r) => r.id === R3).note, "I bring the ball", "with the notes");
await q(`update public.game_requests set requester_phone = '+919000000004' where id = $1`, [R3]); // a legacy row with a number
ok(!JSON.stringify(await reqsFor(HOST, G1)).includes("+9190"), "a legacy number never comes back");
const raviView = await reqsFor(RAVI, G1);
eq(raviView, { r: "ok", host: false, mine: { id: R1, status: "pending" } }, "a requester sees only their own, id and status");
eq(await reqsFor(OMAR, G1), { r: "ok", host: false, mine: null }, "anyone else sees nothing");
const mine = await rpc("game_requests_mine", [KEY, KIRAN]);
eq([mine.requests.length, mine.requests[0].id, mine.requests[0].note, "requester_phone" in mine.requests[0]], [1, R3, "I bring the ball", false], "my requests: my own, no phone");
eq((await rpc("game_requests_incoming", [KEY, HOST])).requests.map((r) => r.id).sort(), [R1, R2, R3, R4].sort(), "incoming: the pending ones on my games");
eq((await rpc("game_requests_incoming", [KEY, RAVI])).requests, [], "and none on games I don't host");

/* ---------------- requests: answer ---------------- */
eq((await answer(RAVI, R1, true)).r, "not_host", "the requester cannot accept themselves");
eq((await answer(OMAR, R2, true)).r, "not_host", "nor can anyone else");
eq((await one(`select status from public.game_requests where id = $1`, [R1])).status, "pending", "and nothing changed");
const a1 = await answer(HOST, R1, true);
eq([a1.r, a1.status, a1.current_players], ["ok", "accepted", 2], "the host accepts; the players are recounted");
eq((await q(`select user_id from public.game_participants where game_id = $1 order by joined_at`, [G1])).map((r) => r.user_id), [HOST, RAVI], "the player is in the lineup");
eq((await notesOf(RAVI)).at(-1), { type: "game_request_accepted", title: "Request Accepted!", message: "Your request to join the game has been accepted!", metadata: { gameId: G1, requestId: R1 }, is_read: false },
  "and told, as before");
eq((await answer(HOST, R1, true)).r, "answered", "a request is answered once");
eq((await answer(HOST, R1, false)).r, "answered", "an accepted one cannot be declined after");
eq((await send(RAVI, G1)).r, "joined", "a player in the game cannot ask again");
// Someone added outside the requests, then the count drifts: accepting recounts it.
await q(`update public.games set current_players = 1 where id = $1`, [G1]);
eq((await answer(HOST, R2, true)).current_players, 3, "the count is what the lineup says");
const d1 = await answer(HOST, R4, false);
eq([d1.r, d1.status], ["ok", "declined"], "the host declines");
eq((await notesOf(NEHA)).at(-1), { type: "game_request_declined", title: "Request Declined", message: "Your request to join the game was declined.", metadata: { gameId: G1, requestId: R4 }, is_read: false },
  "and the player is told");
ok((await one(`select responded_at from public.game_requests where id = $1`, [R4])).responded_at !== null, "with when");
// The game is full at max_players 4: Kiran makes 4, Omar's (made full) is refused.
eq((await answer(HOST, R3, true)).current_players, 4, "the fourth player");
await q(`update public.games set max_players = 4 where id = $1`, [G1]);
eq((await send(OMAR, G1)).r, "full", "asking to join a full game is refused");
const R5 = (await send(GOOGLE, (await create(HOST, { ...GAME, max_players: 2 })).game.id)).request.id;
const G2 = (await one(`select game_id from public.game_requests where id = $1`, [R5])).game_id;
await q(`insert into public.game_participants (game_id, user_id) values ($1, $2)`, [G2, OMAR]); // filled meanwhile
eq((await answer(HOST, R5, true)).r, "full", "accepting into a full game is refused");
eq((await one(`select count(*)::int n from public.game_participants where game_id = $1`, [G2])).n, 2, "and nobody is added past the cap");
eq((await one(`select status from public.game_requests where id = $1`, [R5])).status, "pending", "the request still waits");
const answerSrc = (await one(`select prosrc from pg_proc where proname = 'game_request_answer'`)).prosrc;
ok(/from public\.games g where g\.id = v_game_id for update/.test(answerSrc), "accepting locks the game row first, so two at once cannot overfill it");

/* ---------------- requests: decline, ask again, withdraw ---------------- */
const again = await send(NEHA, G1);
eq(again.r, "full", "declined, then the game filled: refused");
await q(`update public.games set max_players = 6 where id = $1`, [G1]);
const back = await send(NEHA, G1, "Free now");
eq([back.r, back.request.id], ["ok", R4], "declined before: the same row asks again");
eq((await one(`select status, note, responded_at from public.game_requests where id = $1`, [R4])), { status: "pending", note: "Free now", responded_at: null }, "pending again, the new note");
eq((await withdraw(RAVI, R4)).r, "gone", "another player cannot withdraw it");
eq((await withdraw(HOST, R4)).r, "gone", "nor can the host");
eq((await withdraw(NEHA, R1)).r, "gone", "nor can I withdraw someone else's");
eq((await withdraw(RAVI, R1)).r, "answered", "an accepted request is not withdrawn");
eq((await withdraw(NEHA, R4)).r, "ok", "the requester withdraws their own pending one");
eq((await one(`select status from public.game_requests where id = $1`, [R4])).status, "withdrawn", "kept, as withdrawn");
eq((await withdraw(NEHA, R4)).r, "ok", "twice is fine");
ok(!(await reqsFor(HOST, G1)).requests.some((r) => r.id === R4), "the host no longer sees it");
eq((await reqsFor(NEHA, G1)).mine, null, "nor does its requester, as theirs");
eq((await rpc("game_requests_mine", [KEY, NEHA])).requests, [], "my requests skip it");
ok(!(await rpc("game_requests_incoming", [KEY, HOST])).requests.some((r) => r.id === R4), "so does incoming");
eq((await answer(HOST, R4, true)).r, "answered", "a withdrawn request cannot be accepted");
eq((await send(NEHA, G1)).request.id, R4, "and its player can ask again");
await withdraw(NEHA, R4);

/* ---------------- notifications: the caller's own ---------------- */
const hostNotes = await rpc("notifications_mine", [KEY, HOST, 50]);
eq([hostNotes.r, hostNotes.notifications.length, hostNotes.unread], ["ok", 7, 7], "the host reads their own notifications and the unread count");
ok(hostNotes.notifications.every((n) => n.user_id === HOST), "only their own");
eq((await rpc("notifications_unread", [KEY, RAVI])).unread, 1, "Ravi's own unread count (the forged one from before is read)");
const someoneElses = hostNotes.notifications[0].id;
eq((await rpc("notifications_read", [KEY, RAVI, someoneElses])).r, "gone", "Ravi cannot mark the host's read");
eq((await one(`select is_read from public.notifications where id = $1`, [someoneElses])).is_read, false, "it stays unread");
eq((await rpc("notifications_read", [KEY, HOST, someoneElses])), { r: "ok", marked: 1 }, "the host marks one of theirs");
eq((await rpc("notifications_read", [KEY, HOST, null])), { r: "ok", marked: 6 }, "and all the rest");
eq((await rpc("notifications_unread", [KEY, HOST])).unread, 0, "none unread");
eq((await rpc("notifications_unread", [KEY, NEHA])).unread, 1, "Neha's untouched");
eq((await rpc("notifications_mine", [KEY, HOST, 2])).notifications.length, 2, "a smaller page");

/* ---------------- edit and move ---------------- */
eq((await update(RAVI, G1, { price_per_player: 0 })).r, "not_host", "a player cannot edit the game");
eq((await update(OMAR, G1, { turf_id: T(2) })).r, "not_host", "nor move it");
eq(Number((await one(`select price_per_player p from public.games where id = $1`, [G1])).p), 150, "and nothing changed");
for (const [c, what] of [[{ status: "cancelled" }, "the status"], [{ current_players: 40 }, "the count"], [{ creator_id: RAVI }, "the host"], [{ host_phone: "+919811111111" }, "the number"],
  [{ host_name: "Someone" }, "the host's name"], [{ title: "x" }, "the title"], [{ sport: "Cricket" }, "the sport"]]) {
  eq((await update(HOST, G1, c)).r, "bad", `the edit sheet cannot change ${what}`);
}
eq((await update(HOST, G1, { max_players: 3 })).r, "too_few", "max players under the 4 in it");
eq((await update(HOST, G1, { turf_id: T(3) })).r, "venue", "a turf that is not listed");
const ed = await update(HOST, G1, { date: ist(3), start_time: "18:30", end_time: "20:00", max_players: 10, price_per_player: 120, description: " ", turf_booked: false, skill_level: "intermediate" });
eq([ed.r, ed.notified, ed.game.max_players, ed.game.skill_level, ed.game.description, ed.game.turf_booked, ed.game.date], ["ok", 0, 10, "intermediate", null, false, ist(3)],
  "the host edits every field the sheet has; nobody is told of an edit");
eq((await update(HOST, G1, { turf_id: T(1) })).notified, 0, "the same venue is not a move");
// Who hears of a move: everyone playing (Ravi, Priya, Kiran) and everyone waiting (a new pending one), never the host, the declined or the withdrawn.
const R6 = (await send(OMAR, G1)).request.id;
await q(`update public.game_requests set status = 'declined' where user_id = $1 and game_id = $2`, [GOOGLE, G1]);
await q(`delete from private.test_dirty`);
const before = await one(`select count(*)::int n from public.notifications`);
const moved = await update(HOST, G1, { turf_id: T(2) }, { title: "Venue changed", message: "Asha moved Football on Mon 2 Nov to Dribble Den, Aundh" });
eq([moved.r, moved.notified, moved.game.turf_id], ["ok", 4, T(2)], "the host moves it to another listed turf");
const told = await q(`select user_id, type, title, message, metadata from public.notifications where type = 'game_venue_changed' order by user_id`);
eq(told.map((n) => n.user_id), [RAVI, PRIYA, KIRAN, OMAR].sort(), "players and the waiting request are told, once each, never the host or Neha (withdrawn)");
eq(told[0].metadata, { gameId: G1, turfId: T(2), fromTurfId: T(1) }, "with the game and both turfs");
eq(told[0].message, "Asha moved Football on Mon 2 Nov to Dribble Den, Aundh", "in the route's words");
eq((await one(`select count(*)::int n from public.notifications`)).n - before.n, 4, "and nobody else");
const keys = await dirty();
ok(keys.includes("turf:kings-turf") && keys.includes("turf:dribble-den"), "both turf pages are marked for a refresh");
const long = await update(HOST, G1, { turf_id: T(1) }, { title: "t".repeat(200), message: "m".repeat(1000) });
const last = await one(`select title, message from public.notifications where type = 'game_venue_changed' order by created_at desc limit 1`);
eq([long.notified, last.title.length, last.message.length], [4, 80, 300], "a long notice is capped");
await update(HOST, G1, { turf_id: T(2) }, null);
eq((await one(`select message from public.notifications where type = 'game_venue_changed' order by created_at desc limit 1`)).message, "Your game moved to Dribble Den", "no notice: a plain one");
eq((await withdraw(OMAR, R6)).r, "ok", "(Omar withdraws)");

/* ---------------- cancel, and closed games ---------------- */
const G3 = (await create(HOST, GAME)).game.id;
const R7 = (await send(RAVI, G3)).request.id;
await answer(HOST, R7, true);
await send(PRIYA, G3);
eq((await rpc("game_cancel", [KEY, RAVI, G3])).r, "not_host", "a player cannot cancel the game");
eq((await rpc("game_cancel", [KEY, HOST, G3])).r, "ok", "the host cancels it");
eq((await one(`select status from public.games where id = $1`, [G3])).status, "cancelled", "status cancelled, the row stays");
eq((await q(`select user_id from public.notifications where type = 'game_cancelled' order by user_id`)).map((n) => n.user_id), [RAVI, PRIYA].sort(), "the player and the waiting request are told");
eq((await send(KIRAN, G3)).r, "closed", "nobody can ask to join a cancelled game");
eq((await update(HOST, G3, { price_per_player: 0 })).r, "closed", "nor can it be edited");
const pendingOnCancelled = (await q(`select id from public.game_requests where game_id = $1 and status = 'pending'`, [G3]))[0].id;
eq((await answer(HOST, pendingOnCancelled, true)).r, "closed", "nor a request on it accepted");
eq((await answer(HOST, pendingOnCancelled, false)).r, "ok", "a decline is still fine");
const G4 = (await create(HOST, GAME)).game.id;
await q(`update public.games set date = (now() at time zone 'Asia/Kolkata')::date - 1 where id = $1`, [G4]);
eq((await send(KIRAN, G4)).r, "closed", "a game that is over");
eq(await q(`select public.close_past_games() n`), [{ n: 1 }], "close_past_games still closes it (the hourly job)");
eq((await update(HOST, G4, { price_per_player: 0 })).r, "closed", "a completed game is not edited");

/* ---------------- the site owner's reads ---------------- */
await refused(q(`select * from public.admin_game_requests(null, null)`), /not allowed/, "admin requests: not the owner, refused");
await refused(q(`select * from public.admin_notifications(null, false)`), /not allowed/, "admin notifications: refused");
await refused(q(`select * from public.admin_notification_counts(null)`), /not allowed/, "admin counts: refused");
await db.exec(`set test.owner = 'yes'`);
const adminReqs = await q(`select * from public.admin_game_requests('tok', null)`);
eq(adminReqs.length, (await one(`select count(*)::int n from public.game_requests`)).n, "the owner reads every request, withdrawn ones too");
ok(adminReqs.some((r) => r.requester_phone === "+919000000004"), "with the legacy number the admin page showed before");
eq((await q(`select * from public.admin_game_requests('tok', 'withdrawn')`)).length, 2, "one status");
const counts = await one(`select * from public.admin_notification_counts('tok')`);
eq([Number(counts.total), Number(counts.unread)], [Number((await one(`select count(*) n from public.notifications`)).n), Number((await one(`select count(*) n from public.notifications where is_read is not true`)).n)], "the owner's counts");
eq((await q(`select * from public.admin_notifications('tok', true)`)).every((n) => n.is_read === false), true, "unread only");
await db.exec(`set test.owner = 'no'`);

/* ---------------- grants ---------------- */
for (const fn of ["game_create", "game_update", "game_cancel", "game_request_send", "game_request_withdraw", "game_request_answer", "game_requests_for", "game_requests_mine",
  "game_requests_incoming", "notifications_mine", "notifications_unread", "notifications_read", "admin_game_requests", "admin_notifications", "admin_notification_counts"]) {
  const r = await one(`select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('public', p.oid, 'execute') p, prosecdef, proconfig
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname = $1`, [fn]);
  eq([r.a, r.p, r.prosecdef, String(r.proconfig).includes("search_path=")], [true, false, true, true], `${fn}: anon may call it, PUBLIC not; definer, empty search_path`);
}
for (const fn of ["game_notify", "game_date_or_null", "game_over", "game_field_problem", "game_request_json"]) {
  const r = await one(`select bool_or(has_function_privilege('anon', p.oid, 'execute')) a, bool_or(has_function_privilege('authenticated', p.oid, 'execute')) b
                         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and proname = $1`, [fn]);
  eq([r.a, r.b], [false, false], `private.${fn}: closed to the API roles`);
}
await refused(asRole("anon", () => q(`select private.game_notify('${RAVI}', 'x', 'x', 'x', '{}')`)), /permission denied/, "anon cannot send a notification through the helper");

/* ---------------- a database with duplicate requests ---------------- */
{
  const dup = await makeDb(PGlite);
  await dup.exec(`insert into public.users (id, name) values ('${HOST}', 'A'), ('${RAVI}', 'B');
    insert into public.turfs (id, name) values ('${T(1)}', 'K');
    insert into public.games (id, creator_id, turf_id, title, sport, max_players, date, start_time, end_time, price_per_player)
      values ('${SOME}', '${HOST}', '${T(1)}', 'x', 'Football', 4, '${ist(2)}', '19:00', '20:00', 0);
    insert into public.game_requests (game_id, user_id, status) values ('${SOME}', '${RAVI}', 'declined'), ('${SOME}', '${RAVI}', 'declined');`);
  await dup.exec(sql);
  eq((await dup.query(`select to_regclass('public.game_requests_one_per_player_uidx') r`)).rows[0].r, null, "two rows for one pair: the index is skipped, not the file");
  const again2 = (await dup.query(`select public.game_request_send($1, $2, $3, null) r`, [KEY, RAVI, SOME])).rows[0].r;
  eq(again2.r, "ok", "and asking again still works (the newest row)");
  await dup.close();
}

/* ---------------- step 2: the lockdown ---------------- */
const policiesBefore = await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`);
const grantsBefore = await q(`select grantee, table_name, privilege_type from information_schema.role_table_grants
                               where table_schema = 'public' and table_name in ('games', 'game_requests', 'game_participants', 'notifications') order by 1, 2, 3`);
await refused(db.exec(lock.replace("to_regprocedure('public.game_create(text,uuid,jsonb)') is null", "true")), /apply 20261030_games_lockdown\.sql/, "without the step 1 functions it refuses");
eq(await q(`select count(*)::int n from information_schema.role_table_grants where grantee = 'anon' and table_name = 'notifications'`), [{ n: 7 }], "and changed nothing");
await db.exec(lock);
await db.exec(lock); // safe to run again
passed++;
const P_GAME = (await one(`select id from public.games limit 1`)).id;
const P_REQ = (await one(`select id from public.game_requests limit 1`)).id;
for (const [role, claims] of [["anon", null], ["authenticated", { sub: HOST, role: "authenticated" }]]) {
  const as = (s) => asRole(role, () => q(s), claims);
  await refused(as(`insert into public.games (creator_id, turf_id, title, sport, max_players, date, start_time, end_time, price_per_player) values ('${HOST}', '${T(1)}', 'x', 'x', 4, '${ist(1)}', '10:00', '11:00', 0)`),
    /permission denied/, `${role}: cannot insert a game`);
  await refused(as(`update public.games set status = 'cancelled' where id = '${P_GAME}'`), /permission denied/, `${role}: cannot edit or cancel a game, even their own`);
  await refused(as(`delete from public.games where id = '${P_GAME}'`), /permission denied/, `${role}: cannot remove a game`);
  await refused(as(`insert into public.game_participants (game_id, user_id) values ('${P_GAME}', '${GOOGLE}')`), /permission denied/, `${role}: cannot add a player`);
  await refused(as(`delete from public.game_participants`), /permission denied/, `${role}: cannot remove players`);
  await refused(as(`insert into public.game_requests (game_id, user_id, status) values ('${P_GAME}', '${HOST}', 'accepted')`), /permission denied/, `${role}: cannot write a request`);
  await refused(as(`update public.game_requests set status = 'accepted' where id = '${P_REQ}'`), /permission denied/, `${role}: cannot accept a request`);
  await refused(as(`delete from public.game_requests`), /permission denied/, `${role}: cannot remove requests`);
  await refused(as(`select note from public.game_requests`), /permission denied/, `${role}: cannot read requests or their notes`);
  await refused(as(`insert into public.notifications (user_id, type, title, message) values ('${RAVI}', 'spam', 'x', 'x')`), /permission denied/, `${role}: cannot send a notification`);
  await refused(as(`update public.notifications set is_read = true`), /permission denied/, `${role}: cannot mark notifications`);
  await refused(as(`select * from public.notifications where user_id = '${HOST}'`), /permission denied/, `${role}: cannot read notifications, even their own`);
  await refused(as(`delete from public.notifications`), /permission denied/, `${role}: cannot remove notifications`);
  await refused(as(`truncate public.games`), /permission denied/, `${role}: cannot empty a table`);
  ok((await as(`select * from public.games`)).length > 0, `${role}: still reads games (select *, as the pages do)`);
  ok((await as(`select id, game_id, user_id, joined_at from public.game_participants`)).length > 0, `${role}: still reads the lineups`);
}
// The functions and the jobs, as before.
eq((await asRole("anon", () => create(KIRAN, GAME))).r, "ok", "the server-key path still creates (PostgREST calls it as anon)");
const G5 = (await one(`select id from public.games where creator_id = $1 order by created_at desc limit 1`, [KIRAN])).id;
const R8 = (await asRole("anon", () => send(RAVI, G5))).request.id;
eq((await asRole("anon", () => answer(KIRAN, R8, true))).current_players, 2, "and answers");
eq((await asRole("anon", () => update(KIRAN, G5, { turf_id: T(2) }))).notified, 1, "and moves, telling the player");
eq((await asRole("anon", () => rpc("notifications_mine", [KEY, RAVI, 50]))).notifications[0].type, "game_venue_changed", "and reads the caller's notifications");
await q(`update public.games set date = (now() at time zone 'Asia/Kolkata')::date - 1 where id = $1`, [G5]);
eq(await q(`select public.close_past_games() n`), [{ n: 1 }], "close_past_games still runs");
const after = Object.fromEntries((await q(`select tablename || ': ' || policyname k, qual, with_check from pg_policies where schemaname = 'public'`)).map((p) => [p.k, [p.qual, p.with_check]]));
eq(after["games: Anyone can read games"], ["true", null], "the public read of games stays");
eq(after["game_participants: Anyone can view participants"], ["true", null], "and of the lineup");
eq(after["games: Allow all operations on games"], ["false", null], "the open ALL policy is false (no WITH CHECK, as before)");
eq(after["notifications: Allow all operations for authenticated\n  users"], ["false", "false"], "a policy with a line break in its name is matched");
eq(after["game_requests: Anyone can view own requests"], ["false", null], "the open read of requests is false");
eq(after["notifications: Users can insert notifications for others"], [null, "false"], "the open insert of notifications is false");
eq(after["notifications: Enable insert for all authenticated users"], [null, "false"], "and any Google sign-in's insert");
eq(after["game_requests: Users can view own requests"], ["(user_id = auth.uid())", null], "a policy about the caller's own rows is left as it was");
eq((await q(`select privilege_type from information_schema.role_table_grants where grantee in ('anon', 'authenticated') and table_name in ('game_requests', 'notifications')`)).length, 0,
  "no grant at all on requests and notifications");
eq((await q(`select distinct privilege_type from information_schema.role_table_grants where grantee in ('anon', 'authenticated') and table_name in ('games', 'game_participants')`)).map((r) => r.privilege_type),
  ["SELECT"], "only SELECT on games and lineups");
eq((await q(`select count(*)::int n from information_schema.role_table_grants where grantee = 'service_role' and table_name = 'games'`))[0].n, 7, "service_role untouched");

/* ---------------- the revert ---------------- */
await db.exec(revert);
eq(await q(`select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname = 'public' order by 1, 2`), policiesBefore, "the revert puts back every policy exactly");
eq(await q(`select grantee, table_name, privilege_type from information_schema.role_table_grants
             where table_schema = 'public' and table_name in ('games', 'game_requests', 'game_participants', 'notifications') order by 1, 2, 3`), grantsBefore, "and every grant");
await asRole("anon", () => q(`insert into public.notifications (user_id, type, title, message) values ('${RAVI}', 'x', 'x', 'x')`));
passed++;

console.log(`games_lockdown: ${passed} checks passed`);
