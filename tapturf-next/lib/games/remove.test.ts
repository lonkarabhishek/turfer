import { test } from "node:test";
import assert from "node:assert/strict";
import { BANNED_COPY } from "../seo/defaults";
import { gameProblem } from "./client";
import {
  REMOVE_BLOCKED,
  REMOVE_BLOCKED_LIST,
  REMOVE_COPY,
  parseRemoval,
  removeGameLine,
  removeLines,
  removeOffer,
  removeReady,
  removedLine,
  removedView,
  toldLine,
  type Removal,
} from "./remove";

// 20 Nov 2026, 3:40 PM in India.
const NOW = Date.parse("2026-11-20T10:10:00Z");
const plan = (o: Partial<Removal> = {}): Removal => ({ can: true, state: "upcoming", players: 0, requests: 0, tags: 0, repeat: false, ...o });
const lines = (r: Removal, row?: { confirmed_names?: unknown; confirmed_extra?: unknown }) => {
  const w = removeLines(r, row);
  assert.ok("lines" in w, "it can go");
  return w.lines;
};
const LEAVES = "It comes off TapTurf at once: the lists, its page and its share link.";
const NO_UNDO = "You can't undo this from the app.";

test("delete: who is told, for an upcoming game with players", () => {
  assert.equal(toldLine({ players: 3, requests: 1, tags: 0 }), "3 players and 1 waiting request will be told it's off.");
  assert.equal(toldLine({ players: 1, requests: 0, tags: 0 }), "1 player will be told it's off.");
  assert.equal(toldLine({ players: 0, requests: 2, tags: 0 }), "2 waiting requests will be told it's off.");
  assert.equal(toldLine({ players: 3, requests: 1, tags: 2 }), "3 players, 1 waiting request and 2 players you added will be told it's off.");
  assert.equal(toldLine({ players: 0, requests: 0, tags: 1 }), "1 player you added will be told it's off.");
  assert.equal(toldLine({ players: 0, requests: 0, tags: 0 }), "Nobody else is in it yet, so there is nobody to tell.");
  assert.deepEqual(lines(plan({ players: 3, requests: 1 })), ["3 players and 1 waiting request will be told it's off.", LEAVES, NO_UNDO], "who is told leads, then that it leaves TapTurf, then no undo");
});

test("delete: friends typed by name are not accounts, so the host is told to tell them", () => {
  assert.deepEqual(lines(plan({ players: 1 }), { confirmed_names: ["Rahul", "Amit"], confirmed_extra: 1 }), [
    "1 player will be told it's off.",
    "TapTurf can't tell the 3 friends you added by name: let them know yourself.",
    LEAVES,
    NO_UNDO,
  ]);
  assert.equal(lines(plan(), { confirmed_names: ["Rahul"] })[1], "TapTurf can't tell the 1 friend you added by name: let them know yourself.");
  assert.equal(lines(plan({ state: "off" }), { confirmed_names: ["Rahul"] }).some((l) => /friend/.test(l)), false, "only for a game still on");
  assert.equal(JSON.stringify(lines(plan({ players: 1 }), { confirmed_names: ["Rahul", "Amit"] })).includes("Rahul"), false, "nobody is named");
});

test("delete: a game played alone leaves the host's own Passport, and the sheet says so", () => {
  const l = lines(plan({ state: "played" }));
  assert.deepEqual(l, [
    "Nobody else was in it, so there is nobody to tell.",
    LEAVES,
    "It leaves your Passport too: it stops counting toward your games, streak and medals, so a medal can go with it.",
    NO_UNDO,
  ]);
  assert.equal(lines(plan({ players: 2 })).some((x) => /Passport/.test(x)), false, "an upcoming game has nothing on a Passport yet");
  assert.equal(lines(plan({ state: "off", players: 2 })).some((x) => /Passport/.test(x)), false, "nor a called-off one");
});

test("delete: a game already called off tells nobody again; one game of a repeat is that one game", () => {
  assert.deepEqual(lines(plan({ state: "off", players: 3, requests: 1, tags: 1 })), ["It's already called off, so nobody is told again.", LEAVES, NO_UNDO]);
  assert.deepEqual(lines(plan({ players: 1, repeat: true })), ["1 player will be told it's off.", LEAVES, "Only this one game is deleted. The rest of the repeat stays as it is.", NO_UNDO]);
});

test("delete: a game played with other people is refused in one line, with no lines to confirm", () => {
  const w = removeLines(plan({ can: false, state: "played", players: 2 }));
  assert.deepEqual(w, { blocked: "It can't be deleted: other players were in it, and it counts on their Passports." });
  assert.equal(REMOVE_BLOCKED.includes("\n"), false);
  assert.equal(gameProblem({ status: 409, body: { error: "not_allowed", reason: "others", players: 2 } }), REMOVE_BLOCKED, "the route's refusal reads the same");
  assert.equal(gameProblem({ status: 503, body: { error: "unavailable", reason: "remove_off" } }), "Deleting a game isn't available yet.", "before the database can: said plainly");
  assert.equal(REMOVE_BLOCKED_LIST, "Games other players were in can't be deleted: they count on those players' Passports.");
});

test("delete: whether a page offers it, with no dead button", () => {
  const row = (o: Record<string, unknown> = {}) => ({ removed_at: null, status: "open", date: "2026-11-22", start_time: "19:00", end_time: "20:00", current_players: 1, ...o });
  const { removed_at: _none, ...before } = row();
  void _none;
  assert.equal(removeOffer(before, 0, NOW), "none", "before 20261122_game_remove.sql the rows have no removed_at: no option at all");
  assert.equal(removeReady(before), false);
  assert.equal(removeReady(row()), true);
  assert.equal(removeOffer(null, 0, NOW), "none");
  assert.equal(removeOffer(row(), 5, NOW), "offer", "an upcoming game can always go, whoever is in it");
  assert.equal(removeOffer(row({ status: "cancelled", date: "2026-11-01" }), 5, NOW), "offer", "a called-off one too");
  assert.equal(removeOffer(row({ date: "2026-11-19" }), 0, NOW), "offer", "played alone");
  assert.equal(removeOffer(row({ date: "2026-11-19" }), 1, NOW), "blocked", "played with someone: the page says why instead of a button");
  assert.equal(removeOffer(row({ status: "completed", date: "2026-11-19" }), 2, NOW), "blocked");
  assert.equal(removeOffer(row({ date: "2026-11-20", start_time: "15:00", end_time: "16:00" }), 1, NOW), "blocked", "a game going on right now, with someone in it");
  assert.equal(removeOffer(row({ date: "2026-11-20", start_time: "15:00", end_time: "16:00" }), 0, NOW), "offer");
  assert.equal(removeOffer(row({ date: "2026-11-20", start_time: "16:00", end_time: "17:00" }), 3, NOW), "offer", "starting in 20 minutes: still upcoming");
  // With no lineup (the Me tab's rows): from the row's own numbers. The host, typed names, "+N" and waiting tags are not other players.
  assert.equal(removeOffer(row({ date: "2026-11-19", current_players: 1 }), undefined, NOW), "offer");
  assert.equal(removeOffer(row({ date: "2026-11-19", current_players: 4, confirmed_names: ["Rahul"], confirmed_extra: 1, confirmed_tagged: 1 }), undefined, NOW), "offer", "the host and three people confirmed by hand");
  assert.equal(removeOffer(row({ date: "2026-11-19", current_players: 5, confirmed_names: ["Rahul"], confirmed_extra: 1, confirmed_tagged: 1 }), undefined, NOW), "blocked", "one more: somebody joined on TapTurf");
  assert.equal(removeOffer(row({ date: "2026-11-19", current_players: 3 }), undefined, NOW), "blocked");
});

test("delete: what the routes send and the page reads", () => {
  assert.deepEqual(parseRemoval({ r: "ok", can: true, repeat: true, state: "upcoming", players: 3, requests: 1, tags: 2, creator_id: "x" }), { can: true, state: "upcoming", players: 3, requests: 1, tags: 2, repeat: true });
  assert.deepEqual(parseRemoval({ can: false, state: "played", players: "3", requests: -1, tags: 1.5 }), { can: false, state: "played", players: 0, requests: 0, tags: 0, repeat: false }, "anything that is not a count is 0");
  for (const bad of [null, "x", {}, { can: true }, { state: "upcoming" }, { can: "yes", state: "off" }, { can: true, state: "gone" }]) assert.equal(parseRemoval(bad), null, JSON.stringify(bad));
  assert.deepEqual(removedView({ r: "ok", removed: true, state: "upcoming", told: 4, extra: 1 }), { r: "ok", state: "upcoming", told: 4 });
  assert.deepEqual(removedView({ r: "ok", removed: false }), { r: "ok", state: null, told: 0 });
  assert.equal(removedLine(4), "Game deleted. 4 people were told it's off.");
  assert.equal(removedLine(1), "Game deleted. 1 person was told it's off.");
  assert.equal(removedLine(0), "Game deleted.");
  assert.equal(removeGameLine({ sport: "Football", date: "2026-11-21", start_time: "19:00:00" }, "Kings Turf"), "Football · Sat 21 Nov, 7 PM · Kings Turf");
  assert.equal(removeGameLine({ sport: "Football", date: "2026-11-21", start_time: "19:30" }, null), "Football · Sat 21 Nov, 7:30 PM");
});

test("delete: the words keep the house rules", () => {
  const all = [
    ...Object.values(REMOVE_COPY),
    REMOVE_BLOCKED,
    REMOVE_BLOCKED_LIST,
    removedLine(0),
    removedLine(3),
    ...[plan({ players: 3, requests: 1, tags: 2, repeat: true }), plan({ state: "off" }), plan({ state: "played", repeat: true }), plan()].flatMap((r) => lines(r, { confirmed_names: ["Rahul"], confirmed_extra: 2 })),
  ];
  for (const t of all) {
    for (const re of BANNED_COPY) assert.equal(re.test(t), false, `${t} / ${re}`);
    assert.equal(/[—–]/.test(t), false, `no long dash: ${t}`);
    assert.equal(/\d{5,}|@|https?:/.test(t), false, `no number, address or link: ${t}`);
    assert.equal(/forever|permanent|hurry|now or never|warning/i.test(t), false, `plain, no alarm: ${t}`);
  }
  assert.equal(REMOVE_COPY.action, "Delete game");
  assert.equal(REMOVE_COPY.title, "Delete this game?");
  assert.equal(REMOVE_COPY.keep, "Keep game");
});
