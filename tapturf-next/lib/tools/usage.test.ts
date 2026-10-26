import { test } from "node:test";
import assert from "node:assert/strict";
import { DEVICE_RE, gaParams, makeDeviceTag, readDevice, readUse, summarizeToolUsage, toolUseOf, toolUseBody, signedInInit, tagsOf } from "./usage";

const CODE = "abcd1234wxyz";

test("a tool's started and finished events are uses; nothing else is", () => {
  assert.deepEqual(toolUseOf("tool_used", "live_scorer", { action: "match_started", overs: 6 }), { tool: "live_scorer", event: "started", detail: null, tags: "6-overs", code: null });
  assert.deepEqual(toolUseOf("tool_result_generated", "toss", { result: "heads", won: true }), { tool: "toss", event: "finished", detail: null, tags: null, code: null });
  assert.deepEqual(toolUseOf("tool_used", "live_scoreboard", { sport: "Football", live: true }), { tool: "live_scoreboard", event: "started", detail: "football", tags: "football", code: null });
  for (const ev of ["tool_opened", "tool_cta_clicked", "tool_action"]) assert.equal(toolUseOf(ev, "live_scorer"), null, ev);
  assert.equal(toolUseOf("tool_used", "unknown_tool"), null);
  // A sport tag that isn't a short slug is dropped, never sent.
  assert.equal(toolUseOf("tool_used", "live_scoreboard", { sport: "Gully cricket with friends!" })?.detail, null);
  assert.equal(toolUseOf("tool_used", "live_scoreboard", { sport: "Gully cricket with friends!" })?.tags, null);
});

test("what a use was: a few short tags from the tool's own params, never typed text", () => {
  // The Live Cricket Scorer's start and end: overs and players a side.
  assert.equal(tagsOf("live_scorer", { action: "match_started", overs: 6, players: 11, named: true, live: true }), "6-overs 11-a-side");
  assert.equal(toolUseOf("tool_result_generated", "live_scorer", { action: "match_end", result: "win", overs: 10, players: 7 })?.tags, "10-overs 7-a-side");
  // The Live Scoreboard: the sport. A tournament: the format and the matches. Teams: the mode, players and teams.
  assert.equal(tagsOf("live_scoreboard", { action: "match_end", sport: "table-tennis", result: "win" }), "table-tennis");
  assert.equal(tagsOf("tournament_scorer", { matches: 6, format: "tri" }), "tri 6-matches");
  assert.equal(tagsOf("team_generator", { players: 10, teams: 2, mode: "balanced" }), "balanced 10-players 2-teams");
  // Names, titles, results and odd numbers are never tags; at most 4.
  assert.equal(tagsOf("toss", { call: "heads", result: "tails", won: false }), null);
  assert.equal(tagsOf("live_scoreboard", { sport: "Kabaddi at Ravi's turf", title: "final" }), null);
  assert.equal(tagsOf("team_generator", { players: 0, teams: 2.5, matches: 5000 }), null);
  assert.equal(tagsOf("x", { sport: "a", format: "b", mode: "c", overs: 1, players: 2 }), "a b c 1-overs");
});

test("a live link's code goes with the two live tools' uses only, and never to GA", () => {
  assert.equal(toolUseOf("tool_used", "live_scoreboard", { sport: "football", code: CODE })?.code, CODE);
  assert.equal(toolUseOf("tool_result_generated", "live_scorer", { code: CODE })?.code, CODE);
  assert.equal(toolUseOf("tool_used", "toss", { code: CODE })?.code, null, "not a live tool");
  assert.equal(toolUseOf("tool_used", "live_scorer", { code: "ABCD1234WXYZ" })?.code, null, "not a code");
  assert.equal(toolUseOf("tool_used", "live_scorer", { code: "abcd" })?.code, null, "too short");
  assert.deepEqual(gaParams({ action: "match_started", sport: "football", code: CODE }), { action: "match_started", sport: "football" });
  assert.deepEqual(gaParams({ action: "x" }), { action: "x" });
});

test("the API reads only well-formed uses", () => {
  assert.deepEqual(readUse({ tool: "toss", event: "started", detail: null }), { tool: "toss", event: "started", detail: null, tags: null, code: null });
  assert.deepEqual(readUse({ tool: "live_scoreboard", event: "finished", detail: "pickleball", tags: "pickleball", code: CODE }), {
    tool: "live_scoreboard",
    event: "finished",
    detail: "pickleball",
    tags: "pickleball",
    code: CODE,
  });
  assert.equal(readUse({ tool: "live_scoreboard", event: "finished", detail: "<script>" })?.detail, null);
  assert.equal(readUse({ tool: "live_scorer", event: "started", tags: "6-overs 11-a-side" })?.tags, "6-overs 11-a-side");
  for (const tags of ["<b>", "a b c d e", "Football", "a  b", " a", "x".repeat(25), 7]) assert.equal(readUse({ tool: "toss", event: "started", tags })?.tags, null, String(tags));
  assert.equal(readUse({ tool: "toss", event: "started", code: CODE })?.code, null, "a code only for the live tools");
  for (const bad of [null, "x", 1, {}, { tool: "toss" }, { tool: "toss", event: "opened" }, { tool: "admin", event: "started" }]) assert.equal(readUse(bad), null, JSON.stringify(bad));
});

test("a guest's device tag: random, short, and only well formed", () => {
  const tag = makeDeviceTag(Uint8Array.from({ length: 12 }, (_, i) => i * 37));
  assert.match(tag, /^[a-z0-9]{12}$/);
  assert.ok(DEVICE_RE.test(tag));
  assert.notEqual(makeDeviceTag(new Uint8Array(12).fill(1)), makeDeviceTag(new Uint8Array(12).fill(2)));
  assert.equal(makeDeviceTag(new Uint8Array(12)), "000000000000");
  assert.equal(readDevice({ device: tag }), tag);
  for (const bad of [null, {}, { device: "short" }, { device: "UPPER0000000" }, { device: "x".repeat(33) }, { device: 12345678 }]) assert.equal(readDevice(bad), null, JSON.stringify(bad));
});

test("what the browser sends: the use and its device tag; signed in, a keepalive fetch with the sign-in", () => {
  const use = toolUseOf("tool_used", "live_scoreboard", { sport: "football", code: CODE })!;
  const body = toolUseBody(use, "k3j9x0abc123");
  assert.deepEqual(JSON.parse(body), { tool: "live_scoreboard", event: "started", detail: "football", tags: "football", code: CODE, device: "k3j9x0abc123" });
  assert.equal(readDevice(JSON.parse(body)), "k3j9x0abc123");
  assert.deepEqual(readUse(JSON.parse(body)), use, "the server reads back what was sent");
  assert.equal("device" in JSON.parse(toolUseBody(use, null)), false, "no tag when storage is blocked");
  const init = signedInInit(body, "tok.en.x");
  assert.equal(init.method, "POST");
  assert.equal(init.keepalive, true, "survives the page closing");
  assert.equal(init.body, body);
  assert.equal(new Headers(init.headers).get("authorization"), "Bearer tok.en.x");
  assert.equal(new Headers(init.headers).get("content-type"), "application/json");
  assert.ok(body.length < 600, "under the route's body limit");
});

test("the admin's summary: totals, this week, live now, board sports", () => {
  const now = Date.parse("2026-10-26T12:00:00+05:30");
  const s = summarizeToolUsage(
    [
      { day: "2026-10-01", status: "stopped", n: 2 },
      { day: "2026-10-21", status: "stopped", n: 3 },
      { day: "2026-10-26", status: "live", n: 1 },
    ],
    [
      { day: "2026-10-10", tool: "toss", event: "started", detail: "", n: 4 },
      { day: "2026-10-25", tool: "toss", event: "started", detail: "", n: 5 },
      { day: "2026-10-25", tool: "live_scorer", event: "started", detail: "", n: 2 },
      { day: "2026-10-25", tool: "live_scorer", event: "finished", detail: "", n: 1 },
      { day: "2026-10-26", tool: "live_scoreboard", event: "started", detail: "football", n: 3 },
      { day: "2026-10-26", tool: "live_scoreboard", event: "started", detail: "", n: 1 },
    ],
    now,
  );
  assert.deepEqual(s.live, { total: 6, last7: 4, liveNow: 1, first: "2026-10-01" });
  assert.equal(s.uses?.started.toss, 9);
  assert.equal(s.uses?.started7.toss, 5);
  assert.equal(s.uses?.started.live_scoreboard, 4);
  assert.equal(s.uses?.finished.live_scorer, 1);
  assert.deepEqual(s.uses?.boardSports, { football: 3 });
  assert.equal(s.uses?.since, "2026-10-10");
  assert.deepEqual(summarizeToolUsage(null, null), { live: null, uses: null });
});
