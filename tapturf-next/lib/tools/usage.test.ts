import { test } from "node:test";
import assert from "node:assert/strict";
import { readUse, summarizeToolUsage, toolUseOf } from "./usage";

test("a tool's started and finished events are uses; nothing else is", () => {
  assert.deepEqual(toolUseOf("tool_used", "live_scorer", { action: "match_started", overs: 6 }), { tool: "live_scorer", event: "started", detail: null });
  assert.deepEqual(toolUseOf("tool_result_generated", "toss", { result: "heads", won: true }), { tool: "toss", event: "finished", detail: null });
  assert.deepEqual(toolUseOf("tool_used", "live_scoreboard", { sport: "Football", live: true }), { tool: "live_scoreboard", event: "started", detail: "football" });
  for (const ev of ["tool_opened", "tool_cta_clicked", "tool_action"]) assert.equal(toolUseOf(ev, "live_scorer"), null, ev);
  assert.equal(toolUseOf("tool_used", "unknown_tool"), null);
  // A sport tag that isn't a short slug is dropped, never sent.
  assert.equal(toolUseOf("tool_used", "live_scoreboard", { sport: "Gully cricket with friends!" })?.detail, null);
});

test("the API reads only well-formed uses", () => {
  assert.deepEqual(readUse({ tool: "toss", event: "started", detail: null }), { tool: "toss", event: "started", detail: null });
  assert.deepEqual(readUse({ tool: "live_scoreboard", event: "finished", detail: "pickleball" }), { tool: "live_scoreboard", event: "finished", detail: "pickleball" });
  assert.equal(readUse({ tool: "live_scoreboard", event: "finished", detail: "<script>" })?.detail, null);
  for (const bad of [null, "x", 1, {}, { tool: "toss" }, { tool: "toss", event: "opened" }, { tool: "admin", event: "started" }]) assert.equal(readUse(bad), null, JSON.stringify(bad));
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
