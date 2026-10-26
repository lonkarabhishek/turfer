import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activityWhat,
  chipText,
  detailText,
  filterPeople,
  peoplePerTool,
  personKey,
  shortDevice,
  tagText,
  toolFilter,
  toolLabel,
  toolPeople,
  whoFilter,
  whoName,
  type ToolUserRow,
} from "./users";

const ASHA = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const RAVI = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";

const row = (o: Partial<ToolUserRow>): ToolUserRow => ({
  user_id: null,
  device: null,
  name: null,
  username: null,
  tool: "toss",
  started: 1,
  finished: 0,
  first_at: "2026-10-27T04:00:00+00:00",
  last_at: "2026-10-27T04:00:00+00:00",
  city: null,
  details: [],
  codes: [],
  ...o,
});

// As admin_tool_users returns them: one per person and tool, last used first.
const ROWS: ToolUserRow[] = [
  row({ device: "guest0001aaaa", tool: "toss", started: 2, finished: 2, first_at: "2026-10-27T08:00:00Z", last_at: "2026-10-27T09:00:00Z", city: "Pune" }),
  row({ user_id: ASHA, name: "Asha Patil", username: "asha_p", tool: "toss", started: 3, first_at: "2026-10-27T05:00:00Z", last_at: "2026-10-27T08:30:00Z", city: "Hyderabad" }),
  row({
    user_id: ASHA,
    name: "Asha Patil",
    username: "asha_p",
    tool: "live_scoreboard",
    started: 1,
    finished: 1,
    first_at: "2026-10-27T04:00:00Z",
    last_at: "2026-10-27T06:00:00Z",
    city: "Secunderabad",
    details: ["football"],
    codes: ["abcd1234wxyz", "not a code"],
  }),
  row({ user_id: RAVI, name: "  ", tool: "live_scorer", started: 0, finished: 1, last_at: "2026-10-26T10:00:00Z", details: ["6-overs 11-a-side"] }),
  row({ tool: "team_generator", started: 0, finished: 4, last_at: "2026-10-25T10:00:00Z", details: ["balanced 10-players 2-teams"] }),
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
  assert.equal(asha.city, "Hyderabad", "the city of the latest use that had one");
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
});

test("filters: signed in or guests, and one tool (it leads the chips)", () => {
  const people = toolPeople(ROWS);
  assert.deepEqual(filterPeople(people, null, "signed").map((p) => p.key), [`u:${ASHA}`, `u:${RAVI}`]);
  assert.deepEqual(filterPeople(people, null, "guest").map((p) => p.key), ["d:guest0001aaaa", "-"]);
  const board = filterPeople(people, "live_scoreboard", "all");
  assert.deepEqual(board.map((p) => p.key), [`u:${ASHA}`]);
  assert.deepEqual(board[0].tools.map((c) => c.tool), ["live_scoreboard", "toss"]);
  assert.deepEqual(filterPeople(people, "toss", "guest").map((p) => p.key), ["d:guest0001aaaa"]);
  assert.deepEqual(peoplePerTool(people), { toss: 2, live_scoreboard: 1, live_scorer: 1, team_generator: 1 });
  assert.equal(whoFilter("signed"), "signed");
  assert.equal(whoFilter("guest"), "guest");
  for (const x of [undefined, "", "admin", ["signed"]]) assert.equal(whoFilter(x), "all");
  assert.equal(toolFilter("toss"), "toss");
  for (const x of [undefined, "", "admin", "Toss"]) assert.equal(toolFilter(x), null);
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
