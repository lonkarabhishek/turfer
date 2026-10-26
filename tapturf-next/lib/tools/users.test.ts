import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityWhat,
  chipText,
  countFor,
  detailText,
  filterPeople,
  personKey,
  shortDevice,
  tagText,
  toolCounts,
  toolFilter,
  toolLabel,
  toolPeople,
  whoFilter,
  whoName,
  type ToolUserRow,
  type ToolUserTool,
} from "./users";

const ASHA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";

const tool = (o: Partial<ToolUserTool>): ToolUserTool => ({
  tool: "toss",
  started: 1,
  finished: 0,
  first_at: "2026-10-27T04:00:00+00:00",
  last_at: "2026-10-27T04:00:00+00:00",
  details: [],
  codes: [],
  ...o,
});

const row = (o: Partial<ToolUserRow>): ToolUserRow => ({
  user_id: null,
  device: null,
  name: null,
  username: null,
  city: null,
  first_at: "2026-10-27T04:00:00+00:00",
  last_at: "2026-10-27T04:00:00+00:00",
  tools: [tool({})],
  ...o,
});

// As admin_tool_users returns them: one per person, with their tools, last used first.
const ROWS: ToolUserRow[] = [
  row({
    device: "guest0001aaaa",
    city: "Pune",
    first_at: "2026-10-27T08:00:00Z",
    last_at: "2026-10-27T09:00:00Z",
    tools: [tool({ started: 2, finished: 2, first_at: "2026-10-27T08:00:00Z", last_at: "2026-10-27T09:00:00Z" })],
  }),
  row({
    user_id: ASHA,
    name: "Asha Patil",
    username: "asha_p",
    city: "Hyderabad",
    first_at: "2026-10-27T04:00:00Z",
    last_at: "2026-10-27T08:30:00Z",
    tools: [
      tool({ started: 3, first_at: "2026-10-27T05:00:00Z", last_at: "2026-10-27T08:30:00Z" }),
      tool({
        tool: "live_scoreboard",
        started: 1,
        finished: 1,
        first_at: "2026-10-27T04:00:00Z",
        last_at: "2026-10-27T06:00:00Z",
        details: ["football"],
        codes: ["abcd1234wxyz", "not a code"],
      }),
    ],
  }),
  row({ user_id: RAVI, name: "  ", last_at: "2026-10-26T10:00:00Z", tools: [tool({ tool: "live_scorer", started: 0, finished: 1, last_at: "2026-10-26T10:00:00Z", details: ["6-overs 11-a-side"] })] }),
  row({ last_at: "2026-10-25T10:00:00Z", tools: [tool({ tool: "team_generator", started: 0, finished: 4, last_at: "2026-10-25T10:00:00Z", details: ["balanced 10-players 2-teams"] })] }),
];

test("one entry per person: their tools as chips, first and last use, the latest city", () => {
  const people = toolPeople(ROWS);
  assert.deepEqual(people.map((p) => p.key), ["d:guest0001aaaa", `u:${ASHA}`, `u:${RAVI}`, "-"], "last used first");
  const asha = people[1];
  assert.equal(asha.name, "Asha Patil");
  assert.equal(asha.username, "asha_p");
  assert.equal(asha.device, null);
  assert.equal(asha.uses, 4);
  assert.equal(asha.first, Date.parse("2026-10-27T04:00:00Z"));
  assert.equal(asha.last, Date.parse("2026-10-27T08:30:00Z"));
  assert.equal(asha.city, "Hyderabad");
  assert.deepEqual(asha.tools.map(chipText), ["Toss ×3", "Live scoreboard ×1 · Football"], "most used first");
  assert.deepEqual(asha.tools[1].codes, ["abcd1234wxyz"], "only real live link codes");
  // A match finished here but started before the log still shows as a use.
  assert.equal(people[2].tools[0].n, 1);
  assert.equal(chipText(people[2].tools[0]), "Live cricket scorer ×1 · 6 overs · 11-a-side");
  assert.equal(whoName(people[2]), "No name", "a blank name");
  assert.equal(whoName(people[0]), "Guest");
  assert.equal(people[0].device, "guest0001aaaa");
  assert.equal(shortDevice(people[0].device), "guest0");
  assert.equal(chipText(people[3].tools[0]), "Team generator ×4 · Balanced · 10 players · 2 teams");
  assert.deepEqual(toolPeople([]), []);
  assert.deepEqual(toolPeople([row({ tools: null })])[0].tools, [], "no tools");
});

test("never two entries for one person, nor two chips for one tool", () => {
  const older = row({ user_id: ASHA, name: "Asha", last_at: "2026-10-27T05:00:00Z", tools: [tool({ started: 1 })] });
  const newer = row({ user_id: ASHA, name: "Asha Patil", last_at: "2026-10-27T08:00:00Z", tools: [tool({ started: 2, last_at: "2026-10-27T08:00:00Z" }), tool({ started: 9, last_at: "2026-10-27T01:00:00Z" })] });
  for (const rows of [[older, newer], [newer, older]]) {
    const people = toolPeople(rows);
    assert.equal(people.length, 1, "one entry");
    assert.equal(people[0].name, "Asha Patil", "the later row wins");
    assert.deepEqual(people[0].tools.map(chipText), ["Toss ×2"], "one chip per tool, the later one");
    assert.equal(people[0].uses, 2);
  }
});

test("filters: signed in or guests, and one tool (it leads the chips)", () => {
  const people = toolPeople(ROWS);
  assert.deepEqual(filterPeople(people, null, "signed").map((p) => p.key), [`u:${ASHA}`, `u:${RAVI}`]);
  assert.deepEqual(filterPeople(people, null, "guest").map((p) => p.key), ["d:guest0001aaaa", "-"]);
  const board = filterPeople(people, "live_scoreboard", "all");
  assert.deepEqual(board.map((p) => p.key), [`u:${ASHA}`]);
  assert.deepEqual(board[0].tools.map((c) => c.tool), ["live_scoreboard", "toss"]);
  assert.deepEqual(filterPeople(people, "toss", "guest").map((p) => p.key), ["d:guest0001aaaa"]);
  assert.equal(whoFilter("signed"), "signed");
  assert.equal(whoFilter("guest"), "guest");
  for (const x of [undefined, "", "admin", ["signed"]]) assert.equal(whoFilter(x), "all");
  assert.equal(toolFilter("toss"), "toss");
  for (const x of [undefined, "", "admin", "Toss"]) assert.equal(toolFilter(x), null);
});

test("the filters' counts and totals come from admin_tool_counts, not from the people shown", () => {
  const counts = toolCounts([
    { tool: null, signed: 120, guests: 900, uses: 4000 },
    { tool: "toss", signed: 80, guests: 700, uses: 2500 },
    { tool: "live_scoreboard", signed: 40, guests: 0, uses: 60 },
  ]);
  assert.deepEqual(countFor(counts, null), { people: 1020, signed: 120, guests: 900, uses: 4000 }, "every tool");
  assert.deepEqual(countFor(counts, "toss"), { people: 780, signed: 80, guests: 700, uses: 2500 });
  assert.deepEqual(countFor(counts, "nrr_calculator"), { people: 0, signed: 0, guests: 0, uses: 0 }, "nobody yet");
  assert.deepEqual(countFor(toolCounts([]), null), { people: 0, signed: 0, guests: 0, uses: 0 });
});

test("tags and uses as the page shows them", () => {
  assert.equal(tagText("football"), "Football");
  assert.equal(tagText("table-tennis"), "Table tennis");
  assert.equal(tagText("6-overs"), "6 overs");
  assert.equal(tagText("11-a-side"), "11-a-side");
  assert.equal(tagText("tri"), "Tri-series");
  assert.equal(tagText("roundrobin"), "Round robin");
  assert.equal(detailText("tri 6-matches"), "Tri-series · 6 matches");
  assert.equal(detailText(""), "");
  assert.equal(detailText(null), "");
  assert.equal(activityWhat({ event: "started", detail: "football" }), "Started · Football");
  assert.equal(activityWhat({ event: "finished", detail: "" }), "Finished");
  assert.equal(toolLabel("nrr_calculator"), "NRR calculator");
  assert.equal(toolLabel("some_new_tool"), "some new tool");
  assert.equal(personKey({ user_id: ASHA, device: "x" }), `u:${ASHA}`);
  assert.equal(personKey({ user_id: null, device: null }), "-");
});
